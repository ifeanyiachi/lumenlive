/**
 * Refreshes the vendored native runtime DLLs in `src-tauri/libs/` from the
 * ones a release build produced in `src-tauri/target/release/`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Tauri installer bundles these five DLLs via `bundle.resources` in
 * `tauri.conf.json`. They are produced by cargo dependencies — `ort`
 * (ONNX Runtime) and `sherpa-rs` (sherpa-onnx + cargs) — which drop
 * them into `target/<profile>/`. We deliberately DO NOT point `bundle.resources`
 * at `target/release/` anymore: for a debug build the copy destination
 * (`target/debug/`) is the same physical file as the source (the two profile
 * dirs are hard-linked), so Tauri's resource copy opened one file for read and
 * write-truncate at once and failed with Windows `os error 32`. Sourcing from a
 * stable, non-target folder (`libs/`) makes source and destination different
 * files, so that self-copy can never happen.
 *
 * WHEN TO RUN
 * -----------
 * These are a *snapshot* that must match the pinned `ort` / `sherpa-rs` versions
 * in `src-tauri/Cargo.toml` (a mismatched onnxruntime.dll crashes STT at
 * runtime). Re-run this after bumping those crate versions:
 *   1. build once so the new DLLs land in target/release
 *      (e.g. `npm run tauri -- build`, or a release `cargo build`)
 *   2. `npm run sync:libs`
 *   3. commit the updated `src-tauri/libs/*.dll`
 *
 * Run: npm run sync:libs
 */

import { join } from "node:path"
import { existsSync, mkdirSync, copyFileSync, statSync } from "node:fs"

const SRC_TAURI = join(import.meta.dir, "..", "src-tauri")
const SRC_DIR = join(SRC_TAURI, "target", "release")
const DEST_DIR = join(SRC_TAURI, "libs")

// Must stay in lockstep with the `libs/*.dll` entries in tauri.conf.json's
// bundle.resources. onnxruntime comes from `ort`; sherpa-onnx + cargs come
// from `sherpa-rs`.
const DLLS = [
  "onnxruntime.dll",
  "onnxruntime_providers_shared.dll",
  "sherpa-onnx-c-api.dll",
  "sherpa-onnx-cxx-api.dll",
  "cargs.dll",
  // DirectML.dll is intentionally NOT synced/bundled: `ort` drops it into
  // target/release, but the app only uses the CPU execution provider, so the
  // DirectML GPU provider DLL (~18 MB) is dead weight in the installer.
]

function main() {
  mkdirSync(DEST_DIR, { recursive: true })

  const missing: string[] = []
  for (const dll of DLLS) {
    const src = join(SRC_DIR, dll)
    if (!existsSync(src)) {
      missing.push(dll)
      continue
    }
    copyFileSync(src, join(DEST_DIR, dll))
    const mb = (statSync(src).size / 1024 / 1024).toFixed(1)
    console.log(`  ✓ ${dll} (${mb} MB)`)
  }

  if (missing.length > 0) {
    console.error(
      `\n  ✗ Missing in ${SRC_DIR}:\n    ${missing.join("\n    ")}\n\n` +
        `  Do a release build first (so ort/sherpa-rs place the DLLs there), then re-run.`
    )
    process.exit(1)
  }

  console.log(`\n  Synced ${DLLS.length} DLLs into src-tauri/libs/. Commit them.`)
}

main()
