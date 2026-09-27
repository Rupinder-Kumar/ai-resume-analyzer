import { useState } from "react";
import { ScoreDonut } from "./ScoreDonut";

export interface AnalyzeResult {
  matchScore: number;
  strengths: string[];
  gaps: string[];
  summary: string;
}

interface ResultsPanelProps {
  result: AnalyzeResult;
}

function buildFeedbackText(result: AnalyzeResult): string {
  const lines: string[] = [];

  lines.push(`Match Score: ${result.matchScore}/100`, "");

  lines.push("Strengths:");
  if (result.strengths.length === 0) {
    lines.push("- (none identified)");
  } else {
    result.strengths.forEach((s) => lines.push(`- ${s}`));
  }
  lines.push("");

  lines.push("Areas to Improve:");
  if (result.gaps.length === 0) {
    lines.push("- (none identified)");
  } else {
    result.gaps.forEach((g) => lines.push(`- ${g}`));
  }
  lines.push("");

  lines.push("Summary:", result.summary);

  return lines.join("\n");
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy fallback below
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function ResultsPanel({ result }: ResultsPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    const ok = await copyToClipboard(buildFeedbackText(result));
    setCopyState(ok ? "copied" : "failed");
    setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div className="mt-10 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Your Feedback</h2>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 active:bg-gray-100"
        >
          {copyState === "copied"
            ? "Copied!"
            : copyState === "failed"
            ? "Couldn't copy"
            : "Copy Feedback"}
        </button>
      </div>

      <div className="mt-4 flex flex-col items-center gap-2 border-b border-gray-100 pb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Match Score
        </h3>
        <ScoreDonut score={result.matchScore} />
      </div>

      <div className="grid gap-6 pt-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Strengths
          </h3>
          {result.strengths.length === 0 ? (
            <p className="text-sm text-gray-400">No specific strengths identified.</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-gray-700">
              {result.strengths.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-700">
            Areas to Improve
          </h3>
          {result.gaps.length === 0 ? (
            <p className="text-sm text-gray-400">No specific gaps identified.</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-gray-700">
              {result.gaps.map((g, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-amber-500">•</span>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-6">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Summary
        </h3>
        <p className="text-sm leading-relaxed text-gray-700">
          {result.summary || "No summary was returned."}
        </p>
      </div>
    </div>
  );
}
