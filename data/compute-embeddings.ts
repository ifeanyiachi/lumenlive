/// <reference types="bun-types" />
/**
 * Pre-computes verse embeddings using the ONNX model.
 * This script exports verses to a JSON file, then a Rust binary does the actual embedding.
 *
 * Usage:
 * 1. Run: bun run data/download-model.ts  (download the ONNX model first)
 * 2. Run: bun run data/compute-embeddings.ts  (export verses to JSON)
 * 3. Run: cargo run -p lumenlive-detection --features onnx,vector-search --bin precompute -- \
 *         --model models/qwen3-embedding-0.6b-int8/model_quantized.onnx \
 *         --tokenizer models/qwen3-embedding-0.6b-int8/tokenizer.json \
 *         --verses data/verses-for-embedding.json \
 *         --output-embeddings embeddings/kjv-qwen3-0.6b.bin \
 *         --output-ids embeddings/kjv-qwen3-0.6b-ids.bin
 *
 * For now, this script just exports the verses to JSON.
 * The actual embedding computation will be done via Rust.
 */

import { Database } from "bun:sqlite"
import { join } from "node:path"
import { mkdir } from "node:fs/promises"

const DATA_DIR = import.meta.dir
const DB_PATH = join(DATA_DIR, "lumenlive.db")
const OUTPUT_PATH = join(DATA_DIR, "verses-for-embedding.json")

// Canonical archaic->modern rule table, shared with the Rust query-side
// normalizer (src-tauri/crates/detection/src/semantic/normalize.rs). This is
// the DOCUMENT side of the same contract: verse text is canonicalized here so
// the pre-computed index lands in the same lexical space as the normalized live
// transcript. The two normalizers MUST agree — they read the same JSON and
// apply the same whole-word, case-insensitive replacement over [A-Za-z]+ runs.
const RULES_PATH = join(
  DATA_DIR,
  "..",
  "src-tauri",
  "crates",
  "detection",
  "src",
  "semantic",
  "archaic-normalization.json"
)

async function loadWordMap(): Promise<Record<string, string>> {
  const rules = (await Bun.file(RULES_PATH).json()) as {
    wordMap: Record<string, string>
  }
  return rules.wordMap
}

/**
 * Canonicalize archaic KJV vocabulary to modern equivalents. Mirrors
 * `normalize_archaic` in the Rust detection crate: each maximal run of ASCII
 * letters is looked up (lowercased) in the rule table and replaced with the
 * modern form when matched, or lowercased otherwise. Case is always folded so
 * it never becomes a mismatch axis; non-letters pass through verbatim.
 */
function normalizeArchaic(
  text: string,
  wordMap: Record<string, string>
): string {
  return text.replace(/[A-Za-z]+/g, (word) => {
    const lower = word.toLowerCase()
    return wordMap[lower] ?? lower
  })
}

async function main() {
  await mkdir(join(DATA_DIR, "..", "embeddings"), { recursive: true })

  console.log("\n📖 Exporting KJV verses for embedding...\n")

  const wordMap = await loadWordMap()
  console.log(
    `  Loaded ${Object.keys(wordMap).length} archaic normalization rules`
  )

  const db = new Database(DB_PATH, { readonly: true })

  // Get all KJV verses (translation_id = 1)
  const verses = db
    .query(
      "SELECT id, book_name, chapter, verse, text FROM verses WHERE translation_id = 1 ORDER BY id"
    )
    .all() as Array<{
    id: number
    book_name: string
    chapter: number
    verse: number
    text: string
  }>

  console.log(`  Found ${verses.length} KJV verses`)

  // Write to JSON for the Rust precompute binary. Verse text is normalized into
  // the same lexical space as the live transcript (see normalizeArchaic) so the
  // embeddings match archaic wording read aloud by a modern-vocab STT.
  const output = verses.map((v) => ({
    id: v.id,
    text: normalizeArchaic(v.text, wordMap),
    ref: `${v.book_name} ${v.chapter}:${v.verse}`,
  }))

  await Bun.write(OUTPUT_PATH, JSON.stringify(output))
  console.log(`  ✓ Exported to ${OUTPUT_PATH}`)
  console.log(
    `\n  Next: Run the Rust precompute binary to generate embeddings.`
  )
  console.log(
    `  This requires the ONNX model to be downloaded first (bun run data/download-model.ts)\n`
  )

  db.close()
}

main().catch((err) => {
  console.error("❌ Export failed:", err)
  process.exit(1)
})
