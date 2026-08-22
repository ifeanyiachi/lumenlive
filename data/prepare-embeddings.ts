/**
 * Unified pipeline: sets up everything needed for LumenLive from scratch.
 *
 *   Phase 1 – Python environment (.venv + all pip deps)
 *   Phase 2 – Download Bible data (pre-built zip + cross-refs)
 *   Phase 3 – Build lumenlive.db (SQLite + FTS5)
 *   Phase 4 – Export bge-base-en-v1.5 embedding model to INT8 ONNX
 *   Phase 5 – Export KJV verses to JSON
 *   Phase 6 – Pre-compute verse embeddings (via the INT8 ONNX)
 *   Phase 7 – Download Moonshine model (sherpa-onnx) for local STT
 *   Phase 8 – Download Zipformer transducer model (sherpa-onnx) for local STT
 *
 * Every phase is idempotent: if its output artifacts already exist it is
 * skipped. Pass --force to re-run everything regardless.
 *
 * Run: bun run setup:all
 *      bun run setup:all --force
 */

import { join, dirname, delimiter } from "node:path"
import { existsSync } from "node:fs"
import { ensurePythonEnv, getVenvBin, PROJECT_ROOT } from "./lib/python-env"

// ── Paths ────────────────────────────────────────────────────────────
const DATA_DIR = join(PROJECT_ROOT, "data")
const MODELS_DIR_INT8 = join(PROJECT_ROOT, "models", "bge-base-en-v1.5-int8")

const KJV_SOURCE = join(DATA_DIR, "sources", "KJV.json")
const CROSS_REFS = join(DATA_DIR, "cross-refs", "cross_references.txt")
const DB_PATH = join(DATA_DIR, "lumenlive.db")
const VERSES_JSON = join(DATA_DIR, "verses-for-embedding.json")
const EMB_BIN = join(PROJECT_ROOT, "embeddings", "kjv-bge-base-en-v1.5.bin")
const IDS_BIN = join(PROJECT_ROOT, "embeddings", "kjv-bge-base-en-v1.5-ids.bin")
// Moonshine base.en int8 model directory (local STT via sherpa-onnx). The
// preprocessor ONNX is the sentinel artifact the download script writes last.
const MOONSHINE_MODEL = join(
  PROJECT_ROOT,
  "models",
  "sherpa",
  "sherpa-onnx-moonshine-base-en-int8",
  "preprocess.onnx"
)
// Zipformer transducer model directory (higher-accuracy local STT). The encoder
// ONNX is the sentinel artifact the download script writes; the bundle also
// needs it, so `tauri build` fails without this phase having run.
const ZIPFORMER_MODEL = join(
  PROJECT_ROOT,
  "models",
  "sherpa",
  "sherpa-onnx-zipformer-en-int8",
  "encoder.int8.onnx"
)
const MODEL_INT8 = join(MODELS_DIR_INT8, "model_quantized.onnx")

const force = process.argv.includes("--force")

// ── Helpers ──────────────────────────────────────────────────────────
function shouldSkip(label: string, ...artifacts: string[]): boolean {
  if (force) return false
  const allExist = artifacts.every((p) => existsSync(p))
  if (allExist) {
    console.log(`  ⏭ Skip: ${label} (artifacts already exist)`)
  }
  return allExist
}

async function run(
  cmd: string[],
  cwd?: string,
  extraEnv?: Record<string, string>
): Promise<void> {
  const proc = Bun.spawn(cmd, {
    stdout: "inherit",
    stderr: "inherit",
    cwd: cwd ?? PROJECT_ROOT,
    env: { ...process.env, ...extraEnv },
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`Command failed (exit ${exitCode}): ${cmd.join(" ")}`)
  }
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔══════════════════════════════════════════════╗")
  console.log("║   LumenLive – Full Setup Pipeline               ║")
  console.log("╚══════════════════════════════════════════════╝")
  if (force) console.log("  (--force: re-running all phases)\n")

  // ── Phase 1: Python environment ────────────────────────────────
  console.log("\n━━━ Phase 1/8: Python environment ━━━")
  await ensurePythonEnv([
    "sentence-transformers",
    "transformers",
    "accelerate",
    "tokenizers",
    "numpy",
    "torch",
    "onnx",
    "onnxscript",
    "onnxruntime",
    // Needed by Phase 8 to generate the Zipformer `bpe.vocab` (hotword biasing).
    "sentencepiece",
  ])

  // ── Phase 2: Bible source data (pre-built zip + cross-refs) ────
  console.log("\n━━━ Phase 2/8: Download Bible source data ━━━")
  if (!shouldSkip("Bible source data", KJV_SOURCE, CROSS_REFS)) {
    await run(["bun", "run", join(DATA_DIR, "download-sources.ts")])
  }

  // ── Phase 3: Build Bible database ──────────────────────────────
  console.log("\n━━━ Phase 3/8: Build Bible database ━━━")
  if (!shouldSkip("Bible database", DB_PATH)) {
    await run(["bun", "run", join(DATA_DIR, "build-bible-db.ts")])
  }

  // ── Phase 4: Export bge embedding model to INT8 ONNX ───────────
  console.log("\n━━━ Phase 4/8: Export bge embedding model (INT8 ONNX) ━━━")
  // Gate on the INT8 model alone: it is the only variant the app and the
  // precompute step load. data/export-bge-onnx.py bakes CLS pooling + L2 norm
  // into a `sentence_embedding` output and quantizes to int8.
  if (!shouldSkip("ONNX model", MODEL_INT8)) {
    const venvPython = getVenvBin(
      process.platform === "win32" ? "python" : "python3"
    )
    console.log(
      "\n  🧠 Exporting BAAI/bge-base-en-v1.5 to INT8 ONNX (CLS pooling + L2 norm)..."
    )
    console.log("     Downloads the model on first run.\n")
    await run([venvPython, join(DATA_DIR, "export-bge-onnx.py")], undefined, {
      PYTHONUTF8: "1",
    })
    console.log(`  ✓ INT8 model saved to ${MODELS_DIR_INT8}`)
  }

  // ── Phase 5: Export verses to JSON ─────────────────────────────
  console.log("\n━━━ Phase 5/8: Export verses to JSON ━━━")
  if (!shouldSkip("verses JSON", VERSES_JSON)) {
    if (!existsSync(DB_PATH)) {
      console.error(
        "  ❌ lumenlive.db not found. Run phases 2-3 first (or remove --force skip)."
      )
      process.exit(1)
    }
    await run(["bun", "run", join(DATA_DIR, "compute-embeddings.ts")])
  }

  // ── Phase 6: Pre-compute embeddings ────────────────────────────
  console.log("\n━━━ Phase 6/8: Pre-compute verse embeddings ━━━")
  if (!shouldSkip("precomputed embeddings", EMB_BIN, IDS_BIN)) {
    const venvPython = getVenvBin(
      process.platform === "win32" ? "python" : "python3"
    )
    // Embed via the exact INT8 ONNX the app loads (reads its `sentence_embedding`
    // output → correct CLS pooling), so index and runtime queries share a subspace.
    await run(
      [venvPython, join(DATA_DIR, "precompute-embeddings-onnx.py")],
      undefined,
      { PYTHONUTF8: "1" }
    )
  }

  // ── Phase 7: Moonshine (sherpa-onnx) local STT model ──────────
  console.log("\n━━━ Phase 7/8: Download Moonshine STT model ━━━")
  if (!shouldSkip("Moonshine model", MOONSHINE_MODEL)) {
    await run(["bun", "run", join(DATA_DIR, "download-sherpa-model.ts")])
  }

  // ── Phase 8: Zipformer (sherpa-onnx) local STT model ──────────
  // The higher-accuracy on-device engine (with Bible-keyterm hotword biasing).
  // Also a required bundle resource, so a fork must have this before it can
  // `bun run tauri build`. The download script generates bpe.vocab via the
  // venv's sentencepiece (installed in Phase 1) so biasing is on.
  console.log("\n━━━ Phase 8/8: Download Zipformer STT model ━━━")
  if (!shouldSkip("Zipformer model", ZIPFORMER_MODEL)) {
    // Prepend the venv bin dir to PATH so the download script's bare
    // `python`/`python3` resolves to the venv interpreter (which has
    // sentencepiece from Phase 1), keeping bpe.vocab biasing on.
    const venvBinDir = dirname(
      getVenvBin(process.platform === "win32" ? "python" : "python3")
    )
    await run(
      ["bun", "run", join(DATA_DIR, "download-zipformer-model.ts")],
      undefined,
      {
        PATH: `${venvBinDir}${delimiter}${process.env.PATH ?? ""}`,
      }
    )
  }

  // ── Done ───────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════╗")
  console.log("║   ✅ Setup complete!                          ║")
  console.log("╚══════════════════════════════════════════════╝\n")
}

main().catch((err) => {
  console.error("\n❌ Pipeline failed:", err.message ?? err)
  process.exit(1)
})
