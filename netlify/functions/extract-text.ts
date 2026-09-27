import type { Handler } from "@netlify/functions";

// pdf-parse and mammoth don't ship clean ESM types; require keeps this simple
// since Netlify bundles functions with esbuild (no separate type-check step).
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

interface ExtractRequestBody {
  fileBase64?: string;
  mimeType?: string;
  fileName?: string;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed. Use POST." }),
    };
  }

  let body: ExtractRequestBody;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Request body must be valid JSON." }),
    };
  }

  const { fileBase64, mimeType, fileName } = body;

  if (!fileBase64) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "fileBase64 is required." }),
    };
  }

  const lowerName = (fileName || "").toLowerCase();
  const isPdf = mimeType === "application/pdf" || lowerName.endsWith(".pdf");
  const isDocx =
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx");

  if (!isPdf && !isDocx) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Unsupported file type. Please upload a PDF or DOCX file.",
      }),
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(fileBase64, "base64");
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "fileBase64 could not be decoded." }),
    };
  }

  try {
    let text = "";

    if (isPdf) {
      const result = await pdfParse(buffer);
      text = result.text || "";
    } else {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || "";
    }

    text = text.trim();

    if (!text) {
      return {
        statusCode: 422,
        body: JSON.stringify({
          error:
            "Could not find any text in that file. If it's a scanned/image-based PDF, try pasting the text instead.",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to parse the file.",
        details: err?.message || String(err),
      }),
    };
  }
};
