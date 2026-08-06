/**
 * Downloads the Moonshine base.en (int8) model for local streaming STT via
 * sherpa-onnx. Moonshine has no 30s padding and runs ~10x faster than Whisper
 * on CPU, making it the recommended offline provider for low-end machines.
 *
 * Model: sherpa-onnx-moonshine-base-en-int8 (~287MB across 5 files)
 * Source: https://huggingface.co/csukuangfj/sherpa-onnx-moonshine-base-en-int8
 *
 * Run: bun run download:sherpa
 */

import { join } from "node:path"
import { existsSync, mkdirSync, createWriteStream } from "node:fs"

const PROJECT_ROOT = join(import.meta.dir, "..")
const MODEL_NAME = "sherpa-onnx-moonshine-base-en-int8"
const MODEL_DIR = join(PROJECT_ROOT, "models", "sherpa", MODEL_NAME)
const BASE_URL = `https://huggingface.co/csukuangfj/${MODEL_NAME}/resolve/main`

// The five files the Moonshine recognizer needs. `SherpaProvider` looks for
// exactly these names in the model directory.
const FILES = [
  "preprocess.onnx",
  "encode.int8.onnx",
  "uncached_decode.int8.onnx",
  "cached_decode.int8.onnx",
  "tokens.txt",
]

async function downloadFile(name: string) {
  const dest = join(MODEL_DIR, name)
  if (existsSync(dest)) {
    console.log(`  ✓ ${name} already exists`)
    return
  }

  const url = `${BASE_URL}/${name}`
  console.log(`  Downloading ${name} ...`)

  const response = await fetch(url, { redirect: "follow" })
  if (!response.ok) {
    throw new Error(
      `Download failed for ${name}: ${response.status} ${response.statusText}`
    )
  }

  const totalBytes = Number(response.headers.get("content-length") ?? 0)
  const totalMB = (totalBytes / 1_000_000).toFixed(0)

  const writer = createWriteStream(dest + ".tmp")
  const reader = response.body?.getReader()
  if (!reader) throw new Error(`No response body for ${name}`)

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

  const { renameSync } = await import("node:fs")
  renameSync(dest + ".tmp", dest)
  process.stdout.write(`\r  ✓ ${name} (${totalMB} MB)          \n`)
}

async function main() {
  mkdirSync(MODEL_DIR, { recursive: true })
  console.log(`Downloading Moonshine model to ${MODEL_DIR}`)
  for (const name of FILES) {
    await downloadFile(name)
  }
  console.log("\nMoonshine model ready.")
}

main().catch((e) => {
  console.error("Failed to download Moonshine model:", e)
  process.exit(1)
})
