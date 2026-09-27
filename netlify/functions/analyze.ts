import type { Handler } from "@netlify/functions";
import { retrieveTips, RetrievedTip } from "./retrieve";

interface AnalyzeRequestBody {
  resumeText?: string;
  jdText?: string;
}

interface AnalyzeResult {
  matchScore: number;
  strengths: string[];
  gaps: string[];
  summary: string;
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929";
const RETRIEVED_TIPS_COUNT = 4; // within the 3-5 range from the spec

class ClaudeCallError extends Error {
  statusCode: number;
  details?: any;

  constructor(message: string, statusCode: number, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function buildDraftPrompt(resumeText: string, jdText: string): string {
  return `You are an ATS (Applicant Tracking System) and resume-review assistant.

Compare the RESUME to the JOB DESCRIPTION below and evaluate the match.

Respond with ONLY a single JSON object and nothing else — no markdown code fences, no preamble, no explanation outside the JSON. The JSON must have exactly this shape:

{
  "matchScore": <integer 0-100, how well the resume matches the job description>,
  "strengths": [<array of short strings, specific things the resume does well for this JD>],
  "gaps": [<array of short strings, specific things missing or weak relative to this JD, phrased constructively>],
  "summary": "<a few sentences summarizing the fit and the top improvement areas, in an encouraging, constructive tone — never harsh or discouraging>"
}

JOB DESCRIPTION:
"""
${jdText}
"""

RESUME:
"""
${resumeText}
"""`;
}

function buildGroundedPrompt(
  resumeText: string,
  jdText: string,
  retrievedTips: RetrievedTip[]
): string {
  const tipsList = retrievedTips.map((t, i) => `${i + 1}. ${t.text}`).join("\n");

  return `You are an ATS (Applicant Tracking System) and resume-review assistant.

Compare the RESUME to the JOB DESCRIPTION below and evaluate the match.

You have been given a short list of RELEVANT RESUME BEST-PRACTICE TIPS below, retrieved because they relate to this resume's likely weak spots. Use them as grounding: where a tip applies, reference its underlying practice explicitly (in your own words, not verbatim) inside "gaps" and in "summary" — don't just list generic advice, tie it to what you actually found in this resume.

RELEVANT RESUME BEST-PRACTICE TIPS:
${tipsList}

Respond with ONLY a single JSON object and nothing else — no markdown code fences, no preamble, no explanation outside the JSON. The JSON must have exactly this shape:

{
  "matchScore": <integer 0-100, how well the resume matches the job description>,
  "strengths": [<array of short strings, specific things the resume does well for this JD>],
  "gaps": [<array of short strings, specific things missing or weak relative to this JD, phrased constructively, explicitly referencing the relevant tip above where it applies>],
  "summary": "<a few sentences summarizing the fit and the top improvement areas, in an encouraging, constructive tone — explicitly reference at least one of the tips above by its underlying practice>"
}

JOB DESCRIPTION:
"""
${jdText}
"""

RESUME:
"""
${resumeText}
"""`;
}

function extractJson(rawText: string): string {
  // Strip ```json ... ``` or ``` ... ``` fences if the model added them anyway.
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return rawText.trim();
}

function isValidResult(value: any): value is AnalyzeResult {
  return (
    value &&
    typeof value.matchScore === "number" &&
    Array.isArray(value.strengths) &&
    value.strengths.every((s: any) => typeof s === "string") &&
    Array.isArray(value.gaps) &&
    value.gaps.every((g: any) => typeof g === "string") &&
    typeof value.summary === "string"
  );
}

async function callClaude(prompt: string, apiKey: string): Promise<AnalyzeResult> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new ClaudeCallError("Claude API request failed.", 502, errText);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((block: any) => block.type === "text");

  if (!textBlock || typeof textBlock.text !== "string") {
    throw new ClaudeCallError("Claude API returned no text content.", 502);
  }

  const jsonString = extractJson(textBlock.text);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new ClaudeCallError(
      "Could not parse Claude's response as JSON.",
      502,
      textBlock.text
    );
  }

  if (!isValidResult(parsed)) {
    throw new ClaudeCallError(
      "Claude's JSON response did not match the expected shape.",
      502,
      parsed
    );
  }

  return {
    matchScore: Math.max(0, Math.min(100, Math.round(parsed.matchScore))),
    strengths: parsed.strengths,
    gaps: parsed.gaps,
    summary: parsed.summary,
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed. Use POST." }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Server is missing ANTHROPIC_API_KEY. Set it in your environment.",
      }),
    };
  }

  let body: AnalyzeRequestBody;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Request body must be valid JSON." }),
    };
  }

  const { resumeText, jdText } = body;

  if (!resumeText || !jdText || !resumeText.trim() || !jdText.trim()) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Both resumeText and jdText are required and cannot be empty.",
      }),
    };
  }

  try {
    // Pass 1: draft analysis, mainly to get a `gaps` array to search with.
    const draft = await callClaude(buildDraftPrompt(resumeText, jdText), apiKey);

    // Retrieve grounding tips for those gaps. Retrieval is best-effort —
    // if it fails (e.g. embeddings.json wasn't committed, or the embedding
    // call errors), fall back to the draft result rather than failing the
    // whole request.
    let retrievedTips: RetrievedTip[] = [];
    try {
      retrievedTips = await retrieveTips(draft.gaps, RETRIEVED_TIPS_COUNT);
    } catch (err: any) {
      console.warn(`Tip retrieval failed, continuing without grounding: ${err.message}`);
    }

    if (retrievedTips.length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      };
    }

    // Pass 2: re-run the analysis with the retrieved tips as grounding
    // context, so the final gaps/summary explicitly reference them.
    const grounded = await callClaude(
      buildGroundedPrompt(resumeText, jdText, retrievedTips),
      apiKey
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(grounded),
    };
  } catch (err: any) {
    if (err instanceof ClaudeCallError) {
      return {
        statusCode: err.statusCode,
        body: JSON.stringify({ error: err.message, details: err.details }),
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Unexpected server error.",
        details: err?.message || String(err),
      }),
    };
  }
};
