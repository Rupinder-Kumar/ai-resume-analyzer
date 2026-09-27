import { useState, FormEvent, ChangeEvent } from "react";
import { ResultsPanel, AnalyzeResult } from "@/components/ResultsPanel";
import { LoadingState } from "@/components/LoadingState";

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

interface TextOrFileInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
}

function TextOrFileInput({ id, label, value, onChange, disabled }: TextOrFileInputProps) {
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtractError(null);
    setFileName(file.name);

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".pdf") && !lowerName.endsWith(".docx")) {
      setExtractError("Please upload a .pdf or .docx file.");
      return;
    }

    setExtracting(true);
    onChange("");
    try {
      const fileBase64 = await readFileAsBase64(file);
      const res = await fetch("/.netlify/functions/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64,
          mimeType: file.type,
          fileName: file.name,
        }),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data?.error || `Could not extract text from that file (${res.status}).`);
      }
      if (!data?.text) {
        throw new Error("The server didn't return any extracted text.");
      }

      onChange(data.text as string);
    } catch (err: any) {
      setExtractError(err.message || "Could not extract text from that file.");
    } finally {
      setExtracting(false);
    }
  }

  function switchMode(next: "paste" | "upload") {
    setMode(next);
    setExtractError(null);
  }

  const fieldDisabled = disabled || extracting;

  return (
    <div className="field">
      <div className="field-header">
        <label htmlFor={id}>{label}</label>
        <div className="mode-toggle">
          <button
            type="button"
            className={mode === "paste" ? "active" : ""}
            onClick={() => switchMode("paste")}
            disabled={disabled}
          >
            Paste text
          </button>
          <button
            type="button"
            className={mode === "upload" ? "active" : ""}
            onClick={() => switchMode("upload")}
            disabled={disabled}
          >
            Upload file
          </button>
        </div>
      </div>

      {mode === "paste" ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Paste the ${label.toLowerCase()} here...`}
          disabled={fieldDisabled}
        />
      ) : (
        <div className="upload-box">
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
            disabled={fieldDisabled}
          />
          {extracting && (
            <p className="hint" role="status">
              Extracting text from {fileName}...
            </p>
          )}
          {extractError && (
            <p className="error" role="alert">
              {extractError}
            </p>
          )}
          {!extracting && value && (
            <>
              <p className="hint">
                Loaded from {fileName} — feel free to edit the extracted text below.
              </p>
              <textarea
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={fieldDisabled}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!resumeText.trim() || !jdText.trim()) {
      setError("Please provide both a resume and a job description (paste text or upload a file).");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/.netlify/functions/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jdText }),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data?.error || `Something went wrong while analyzing (${res.status}).`);
      }
      if (!data) {
        throw new Error("The server returned an unreadable response. Please try again.");
      }

      setResult(data as AnalyzeResult);
    } catch (err: any) {
      setError(err.message || "Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>AI Resume Analyzer</h1>
      <p className="subtitle">
        Paste or upload your resume and a job description to get a match score and feedback.
      </p>

      <form onSubmit={handleSubmit}>
        <TextOrFileInput
          id="resume"
          label="Resume"
          value={resumeText}
          onChange={setResumeText}
          disabled={loading}
        />

        <TextOrFileInput
          id="jd"
          label="Job Description"
          value={jdText}
          onChange={setJdText}
          disabled={loading}
        />

        <button type="submit" disabled={loading}>
          {loading ? "Analyzing..." : "Analyze Match"}
        </button>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>

      {loading && <LoadingState />}
      {!loading && result && <ResultsPanel result={result} />}
    </main>
  );
}
