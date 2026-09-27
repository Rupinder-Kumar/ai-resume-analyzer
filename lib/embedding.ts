/**
 * Single source of truth for "how do we embed text" — imported by both
 * scripts/embed.ts (embeds the 20 tips, one time) and
 * netlify/functions/retrieve.ts (embeds a query at request time), so the
 * two paths can never drift onto different models.
 */

export const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
export const VOYAGE_MODEL = "voyage-3-lite";
export const LOCAL_MODEL = "Xenova/all-MiniLM-L6-v2";

export interface EmbedResult {
  embeddings: number[][];
  source: string; // e.g. "voyage:voyage-3-lite" or "local:Xenova/all-MiniLM-L6-v2"
}

async function embedWithVoyage(
  texts: string[],
  apiKey: string,
  inputType: "document" | "query"
): Promise<number[][]> {
  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Voyage API request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  // Voyage doesn't guarantee response order matches input order.
  const sorted = [...data.data].sort((a: any, b: any) => a.index - b.index);
  return sorted.map((item: any) => item.embedding as number[]);
}

// Cached across invocations within the same warm process (script run, or
// warm serverless container) so the local model is only loaded once.
let localExtractorPromise: Promise<any> | null = null;

async function getLocalExtractor() {
  if (!localExtractorPromise) {
    localExtractorPromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      return pipeline("feature-extraction", LOCAL_MODEL);
    })();
  }
  return localExtractorPromise;
}

async function embedWithLocalModel(texts: string[]): Promise<number[][]> {
  const extractor = await getLocalExtractor();
  const embeddings: number[][] = [];
  for (const text of texts) {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    embeddings.push(Array.from(output.data as Float32Array));
  }
  return embeddings;
}

/**
 * Embeds `texts` with Voyage AI if VOYAGE_API_KEY is set (falling back to
 * the local model if that request fails), otherwise uses the local model
 * directly. `inputType` should be "document" when embedding the tips
 * themselves and "query" when embedding a search query against them —
 * Voyage uses this to optimize the embedding for each role.
 */
export async function embedTexts(
  texts: string[],
  inputType: "document" | "query" = "document"
): Promise<EmbedResult> {
  const apiKey = process.env.VOYAGE_API_KEY;

  if (apiKey) {
    try {
      const embeddings = await embedWithVoyage(texts, apiKey, inputType);
      return { embeddings, source: `voyage:${VOYAGE_MODEL}` };
    } catch (err: any) {
      console.warn(`Voyage API failed (${err.message}); falling back to local model.`);
    }
  }

  const embeddings = await embedWithLocalModel(texts);
  return { embeddings, source: `local:${LOCAL_MODEL}` };
}
