/**
 * Downloads an offline Zipformer transducer model (int8) for local STT via
 * sherpa-onnx — the higher-accuracy on-device engine with contextual hotword
 * biasing toward Bible keyterms (book names, reference cues, numerals).
 *
 * Default: the **GigaSpeech** Zipformer (10k hrs of varied real-world audio —
 * podcasts/talks/YouTube), which is more robust to accents and live-room speech
 * than the LibriSpeech (audiobook) models. Files are renamed to the canonical
 * names `TransducerProvider` looks for:
 *   encoder.int8.onnx, decoder.int8.onnx, joiner.int8.onnx, tokens.txt
 *
 * Hotword biasing needs a `bpe.vocab`. The repo ships `bpe.model`, so this
 * script downloads it and generates `bpe.vocab` via Python + sentencepiece
 * (present in this project's tooling). If generation fails, the recognizer
 * still runs — just unbiased — and the one-liner is printed.
 *
 * Swap `MODEL_REPO` / `SOURCES` for whichever model wins the on-device bench
 * (see `src-tauri/crates/stt/examples/sherpa_bench.rs`). Keep the local
 * `MODEL_NAME` dir in sync with `resolve_transducer_model_dir` in the backend.
 *
 * Run: bun run download:zipformer
 */

import { join } from "node:path"
import { existsSync, mkdirSync, createWriteStream, renameSync } from "node:fs"
import { execFileSync } from "node:child_process"

const PROJECT_ROOT = join(import.meta.dir, "..")

// Local directory name resolved by `resolve_transducer_model_dir` in the Rust
// backend. Keep in sync with that constant.
const MODEL_NAME = "sherpa-onnx-zipformer-en-int8"
const MODEL_DIR = join(PROJECT_ROOT, "models", "sherpa", MODEL_NAME)

// GigaSpeech Zipformer — int8 exports named `*-epoch-30-avg-1.*`.
const MODEL_REPO = "csukuangfj/sherpa-onnx-zipformer-gigaspeech-2023-12-12"
const BASE_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main`

/** Source file name in the repo → canonical dest name in MODEL_DIR. */
type Source = { src: string; dest: string; optional?: boolean }

const SOURCES: Source[] = [
  { src: "encoder-epoch-30-avg-1.int8.onnx", dest: "encoder.int8.onnx" },
  { src: "decoder-epoch-30-avg-1.int8.onnx", dest: "decoder.int8.onnx" },
  { src: "joiner-epoch-30-avg-1.int8.onnx", dest: "joiner.int8.onnx" },
  { src: "tokens.txt", dest: "tokens.txt" },
  // Source for the generated bpe.vocab (below). Optional: absence just means
  // biasing stays off.
  { src: "bpe.model", dest: "bpe.model", optional: true },
]

async function downloadFile({ src, dest, optional }: Source): Promise<boolean> {
  const target = join(MODEL_DIR, dest)
  if (existsSync(target)) {
    console.log(`  ✓ ${dest} already exists`)
    return true
  }

  const url = `${BASE_URL}/${src}`
  console.log(`  Downloading ${src} → ${dest} ...`)

  const response = await fetch(url, { redirect: "follow" })
  if (!response.ok) {
    if (optional) {
      console.log(`  · ${src} not in repo (optional) — skipping`)
      return false
    }
    throw new Error(
      `Download failed for ${src}: ${response.status} ${response.statusText}`
    )
  }

  const totalBytes = Number(response.headers.get("content-length") ?? 0)
  const totalMB = (totalBytes / 1_000_000).toFixed(0)

  const writer = createWriteStream(target + ".tmp")
  const reader = response.body?.getReader()
  if (!reader) throw new Error(`No response body for ${src}`)

  let downloaded = 0
  let lastPercent = -1
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    writer.write(Buffer.from(value))
    downloaded += value.byteLength
    const percent =
      totalBytes > 0 ? Math.floor((downloaded / totalBytes) * 100) : 0
    if (percent !== lastPercent && percent % 10 === 0) {
      process.stdout.write(
        `\r    ${percent}% (${(downloaded / 1_000_000).toFixed(0)}/${totalMB} MB)`
      )
      lastPercent = percent
    }
  }

  writer.end()
  await new Promise<void>((resolve, reject) => {
    writer.on("finish", resolve)
    writer.on("error", reject)
  })

  renameSync(target + ".tmp", target)
  process.stdout.write(`\r  ✓ ${dest} (${totalMB} MB)          \n`)
  return true
}

/**
 * Generate `bpe.vocab` (sherpa-onnx hotword tokenizer input) from `bpe.model`
 * using Python + sentencepiece. Each line is "piece score" — the format
 * sherpa-onnx's BPE modeling unit expects. Best-effort: returns false (with a
 * warning) if Python or sentencepiece is unavailable, so the download still
 * succeeds and the engine runs unbiased.
 */
function generateBpeVocab(): boolean {
  const bpeModel = join(MODEL_DIR, "bpe.model")
  const bpeVocab = join(MODEL_DIR, "bpe.vocab")
  if (existsSync(bpeVocab)) {
    console.log("  ✓ bpe.vocab already exists")
    return true
  }
  if (!existsSync(bpeModel)) return false

  // argv[1] = bpe.model path, argv[2] = bpe.vocab out path — passed as args so
  // no path needs escaping inside the inline script.
  const py = [
    "import sys, sentencepiece as spm",
    "sp = spm.SentencePieceProcessor()",
    "sp.load(sys.argv[1])",
    "f = open(sys.argv[2], 'w', encoding='utf-8')",
    "f.write(''.join('%s %f\\n' % (sp.id_to_piece(i), sp.get_score(i)) for i in range(sp.vocab_size())))",
    "f.close()",
  ].join("; ")

  for (const python of ["python", "python3"]) {
    try {
      execFileSync(python, ["-c", py, bpeModel, bpeVocab], { stdio: "pipe" })
      if (existsSync(bpeVocab)) {
        console.log(`  ✓ bpe.vocab generated via ${python} + sentencepiece`)
        return true
      }
    } catch {
      // Try the next interpreter name.
    }
  }
  return false
}

async function main() {
  mkdirSync(MODEL_DIR, { recursive: true })
  console.log(`Downloading Zipformer (GigaSpeech) model to ${MODEL_DIR}`)

  for (const source of SOURCES) {
    await downloadFile(source)
  }

  console.log("\nGenerating hotword vocab for biasing ...")
  const biasing = generateBpeVocab()

  console.log("\nZipformer model ready.")
  if (biasing) {
    console.log("Hotword biasing is ON (bpe.vocab present).")
  } else {
    console.log(
      "⚠ Hotword biasing is OFF — could not produce bpe.vocab. The recognizer still runs."
    )
    console.log(
      "  Install sentencepiece (pip install sentencepiece) and re-run, or generate manually:"
    )
    console.log(
      `    python -c "import sentencepiece as spm; sp=spm.SentencePieceProcessor(model_file='${join(MODEL_DIR, "bpe.model")}'); open('${join(MODEL_DIR, "bpe.vocab")}','w').write(''.join('%s %f\\n' % (sp.id_to_piece(i), sp.get_score(i)) for i in range(sp.vocab_size())))"`
    )
  }
}

main().catch((e) => {
  console.error("Failed to download Zipformer model:", e)
  process.exit(1)
})
