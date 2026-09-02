#!/usr/bin/env python3
"""
Export Qwen/Qwen3-Embedding-0.6B to a graph-optimized int8 ONNX the app can load.

Sibling of data/export-bge-onnx.py, but for the Qwen A/B model. Two differences
matter:

  1. **No pooling baked in.** bge bakes CLS-pooling + L2-norm into a
     `sentence_embedding` output. Qwen is exported as a plain feature-extraction
     model (raw `last_hidden_state`); the runtime Rust `OnnxEmbedder` mean-pools
     over the attention mask and L2-normalizes — and the Qwen precompute script
     does the same, so both sides match.
  2. **Symmetric, x64 int8.** Qwen adds no query prefix. Quantization uses
     `avx512_vnni` (dynamic) — the x64 target this repo's bge int8 already uses —
     NOT the `--arm64` that data/download-model.ts hardcodes for Apple Silicon.

Pipeline:
  1. optimum main_export → fp32 ONNX (feature-extraction, no KV cache; includes
     the `position_ids` input Qwen3 needs).
  2. optimum ORTQuantizer → dynamic int8 (avx512_vnni).
  3. Copy the tokenizer into the int8 dir so it is self-contained (the app and
     precompute both read the tokenizer from there), then drop the fp32 export.

Output:
  models/qwen3-embedding-0.6b-int8/model_quantized.onnx   (int8, what the app loads)
  models/qwen3-embedding-0.6b-int8/tokenizer.json

Deps: the shared .venv (optimum-onnx[onnxruntime], transformers, torch).
Run:  python data/export-qwen-onnx.py
"""

import shutil
from pathlib import Path

from transformers import AutoTokenizer
from optimum.exporters.onnx import main_export
from optimum.onnxruntime import ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig

MODEL_ID = "Qwen/Qwen3-Embedding-0.6B"
ROOT = Path(__file__).resolve().parent.parent
FP32_DIR = ROOT / "models" / "qwen3-embedding-0.6b"
INT8_DIR = ROOT / "models" / "qwen3-embedding-0.6b-int8"
INT8_ONNX = INT8_DIR / "model_quantized.onnx"


def main():
    FP32_DIR.mkdir(parents=True, exist_ok=True)
    INT8_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[1/3] Exporting {MODEL_ID} to fp32 ONNX (feature-extraction)...")
    print("      Downloads the model from HuggingFace on first run (~2.4 GB).")
    main_export(
        MODEL_ID,
        output=str(FP32_DIR),
        task="feature-extraction",
    )
    # Ensure the tokenizer is present alongside the fp32 export (main_export
    # normally writes it, but save it explicitly to be safe).
    AutoTokenizer.from_pretrained(MODEL_ID).save_pretrained(str(FP32_DIR))

    print("[2/3] Quantizing to int8 (avx512_vnni, dynamic) via optimum...")
    quantizer = ORTQuantizer.from_pretrained(str(FP32_DIR))
    qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)
    quantizer.quantize(
        save_dir=str(INT8_DIR),
        quantization_config=qconfig,
        file_suffix="quantized",
    )

    if not INT8_ONNX.exists():
        raise SystemExit(
            f"expected int8 model at {INT8_ONNX}; dir has: "
            f"{[p.name for p in INT8_DIR.glob('*.onnx')]}"
        )

    print("[3/3] Making the int8 dir self-contained (tokenizer) ...")
    # The app + precompute read the tokenizer from the int8 dir. quantize copies
    # config.json but not always the tokenizer, so save it explicitly.
    AutoTokenizer.from_pretrained(MODEL_ID).save_pretrained(str(INT8_DIR))

    # Drop the ~2.4 GB fp32 export — only the int8 model ships / is loaded.
    shutil.rmtree(FP32_DIR, ignore_errors=True)

    size_mb = INT8_ONNX.stat().st_size / 1024 / 1024
    print(f"\nDone. int8 model: {INT8_ONNX} ({size_mb:.1f} MB)")
    print("  Files kept (models/qwen3-embedding-0.6b-int8/):")
    print("  - model_quantized.onnx (int8, the model the app loads)")
    print("  - tokenizer.json")


if __name__ == "__main__":
    main()
