/**
 * Given the `gaps` array from a resume/JD analysis, embeds the combined
 * gap text (same embedding model as scripts/embed.ts, via lib/embedding.ts)
 * and returns the 3-5 resume best-practice tips most similar to it, by
 * cosine similarity against data/embeddings.json.
 *
 * data/embeddings.json is imported directly (not read from disk at
 * runtime) so its contents are bundled straight into this function at
 * build time — this only works if you've run `npm run embed` and
 * committed data/embeddings.json before deploying.
 */

import embeddedTipsJson from "../../data/embeddings.json";
import { embedTexts } from "../../lib/embedding";

export interface EmbeddedTip {
  id: string;
  text: string;
  embedding: number[];
}

export interface RetrievedTip {
  id: string;
  text: string;
  score: number;
}

const TIPS = embeddedTipsJson as EmbeddedTip[];

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Embedding dimension mismatch (query=${a.length}, tip=${b.length}) — ` +
        "the query was likely embedded with a different model/source than " +
        "data/embeddings.json was built with. Re-run `npm run embed` after " +
        "changing VOYAGE_API_KEY availability."
    );
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * @param gaps  The `gaps` array from an analyze.ts draft result.
 * @param topK  How many tips to return — clamped to 3-5 per the spec.
 */
export async function retrieveTips(
  gaps: string[],
  topK: number = 4
): Promise<RetrievedTip[]> {
  const clampedTopK = Math.max(3, Math.min(5, topK));

  const combinedGapText = gaps.map((g) => g.trim()).filter(Boolean).join(". ");
  if (!combinedGapText || TIPS.length === 0) return [];

  const { embeddings } = await embedTexts([combinedGapText], "query");
  const queryEmbedding = embeddings[0];

  const scored: RetrievedTip[] = TIPS.map((tip) => ({
    id: tip.id,
    text: tip.text,
    score: cosineSimilarity(queryEmbedding, tip.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, clampedTopK);
}
