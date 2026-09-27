/**
 * One-time script: reads data/resume-best-practices.json, generates an
 * embedding for each tip's `text`, and writes { id, text, embedding } to
 * data/embeddings.json.
 *
 * Embedding logic lives in lib/embedding.ts, shared with retrieve.ts, so
 * the tips and any future query are always embedded with the same model.
 *
 * Run with:
 *   npm run embed
 */

import { readFile, writeFile } from "fs/promises";
import path from "path";
import { embedTexts } from "../lib/embedding";

interface Tip {
  id: string;
  text: string;
}

interface EmbeddedTip extends Tip {
  embedding: number[];
}

const DATA_DIR = path.join(__dirname, "..", "data");
const INPUT_PATH = path.join(DATA_DIR, "resume-best-practices.json");
const OUTPUT_PATH = path.join(DATA_DIR, "embeddings.json");

async function loadTips(): Promise<Tip[]> {
  const raw = await readFile(INPUT_PATH, "utf-8");
  const tips = JSON.parse(raw) as Tip[];

  if (!Array.isArray(tips) || tips.length === 0) {
    throw new Error(`No tips found in ${INPUT_PATH}`);
  }

  return tips;
}

async function main() {
  const tips = await loadTips();
  const texts = tips.map((t) => t.text);

  console.log(`Embedding ${texts.length} tips...`);
  const { embeddings, source } = await embedTexts(texts, "document");

  const result: EmbeddedTip[] = tips.map((tip, i) => ({
    id: tip.id,
    text: tip.text,
    embedding: embeddings[i],
  }));

  await writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2), "utf-8");

  console.log(
    `Wrote ${result.length} embeddings (dim=${embeddings[0]?.length ?? 0}, source=${source}) to ${OUTPUT_PATH}`
  );
}

main().catch((err) => {
  console.error("Embedding script failed:", err);
  process.exit(1);
});
