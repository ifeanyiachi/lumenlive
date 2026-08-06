# Vendored native runtime DLLs (Windows)

These five DLLs are bundled into the Windows installer via `bundle.resources` in
`../tauri.conf.json` (mapped to `./`, i.e. next to the app `.exe`). At runtime
the Windows loader and `MoonshineRecognizer`/ONNX Runtime find them beside the
executable.

| DLL | Comes from | Provides |
| --- | --- | --- |
| `onnxruntime.dll` | `ort` crate | ONNX Runtime core |
| `onnxruntime_providers_shared.dll` | `ort` crate | ORT provider shim |
| `sherpa-onnx-c-api.dll` | `sherpa-rs` crate | sherpa-onnx C API |
| `sherpa-onnx-cxx-api.dll` | `sherpa-rs` crate | sherpa-onnx C++ API |
| `cargs.dll` | `sherpa-rs` crate | sherpa-onnx CLI arg dep |

> `ort` also drops `DirectML.dll` (~18 MB) into `target/release`, but the app
> uses only the CPU execution provider, so it is deliberately **not** vendored or
> bundled.

## Why they live here (not `target/release/`)

They are actually *produced* by the cargo dependencies into `target/<profile>/`.
We used to point `bundle.resources` straight at `target/release/*.dll`, but on
Windows the `target/release` and `target/debug` copies are **hard-linked to the
same files**. For a debug build Tauri copies the resource from
`target/release/x.dll` to `target/debug/x.dll` — the *same physical file* — so it
opened one file for read and write-truncate simultaneously and failed with
`os error 32` ("being used by another process"). Sourcing from this stable
folder makes source and destination different files, so that self-copy can never
happen. (Release builds were never affected — Tauri skips a same-path copy.)

## Keeping them in sync

These are a **snapshot** and must match the pinned `ort` / `sherpa-rs` versions
in `../Cargo.toml`. A mismatched `onnxruntime.dll` crashes STT at runtime. After
bumping either crate:

1. Do a release build so the new DLLs land in `target/release/`.
2. `npm run sync:libs`
3. Commit the updated `libs/*.dll`.

They are checked into git on purpose (same as `sdk/ndi/windows/*.dll`) so a fresh
clone can build an installer without a separate download step.
