#!/usr/bin/env python3
"""
Export BAAI/bge-base-en-v1.5 to a graph-optimized int8 ONNX the app can load.

The runtime `OnnxEmbedder` (Rust) and the precompute scripts both prefer a
`sentence_embedding` output, so we bake bge's pooling + normalization INTO the
graph:
  - CLS pooling (bge-v1.5 uses the [CLS] token, NOT mean pooling)
  - L2 normalization
and expose a single output named `sentence_embedding` of shape [batch, 768].

token_type_ids is baked to zeros inside the graph, so the ONNX needs only
`input_ids` + `attention_mask` — exactly what OnnxEmbedder feeds.

Pipeline:
  1. torch -> fp32 ONNX  (legacy exporter, dynamo=False → clean, standard graph)
  2. optimum ORTQuantizer → dynamic int8 (avx512_vnni), the same tooling that
     produced the qwen3 int8.

We deliberately do NOT run offline graph optimization: level-99 fusion emits
hardware-specific ops that both break the quantizer's shape inference AND are
non-portable across machines. The Rust runtime applies full graph optimization
(GraphOptimizationLevel::Level3) at load time instead, portably and per-host.

Output:
  models/bge-base-en-v1.5-int8/model_quantized.onnx   (int8, what the app loads)
  models/bge-base-en-v1.5-int8/tokenizer.json

Deps: pip install torch transformers "optimum[onnxruntime]" onnx onnxruntime
Run:  python data/export-bge-onnx.py
"""

from pathlib import Path

import torch
from transformers import AutoModel, AutoTokenizer
from optimum.onnxruntime import ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig

MODEL_ID = "BAAI/bge-base-en-v1.5"
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "models" / "bge-base-en-v1.5-int8"
FP32_ONNX = OUT_DIR / "model.onnx"
INT8_ONNX = OUT_DIR / "model_quantized.onnx"
MAX_LEN = 128


class BgeSentenceEmbedder(torch.nn.Module):
    """bge transformer + CLS pooling + L2 norm -> one `sentence_embedding` output.

    token_type_ids is omitted (BERT fills zeros internally), so the exported
    graph takes only input_ids + attention_mask.
    """

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask):
        out = self.model(input_ids=input_ids, attention_mask=attention_mask)
        cls = out.last_hidden_state[:, 0]  # CLS pooling (bge-v1.5)
        return torch.nn.functional.normalize(cls, p=2, dim=1)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Loading {MODEL_ID} ...")
    tok = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModel.from_pretrained(MODEL_ID).eval()
    wrapper = BgeSentenceEmbedder(model).eval()

    dummy = tok(
        "for god so loved the world",
        return_tensors="pt",
        padding="max_length",
        truncation=True,
        max_length=MAX_LEN,
    )

    print(f"[1/2] Exporting fp32 ONNX (legacy exporter) -> {FP32_ONNX.name} ...")
    torch.onnx.export(
        wrapper,
        (dummy["input_ids"], dummy["attention_mask"]),
        str(FP32_ONNX),
        input_names=["input_ids", "attention_mask"],
        output_names=["sentence_embedding"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "sentence_embedding": {0: "batch"},
        },
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,  # legacy TorchScript exporter → standard, ORT-friendly graph
    )
    # optimum's quantizer loads the model dir; it needs the HF config alongside.
    model.config.save_pretrained(str(OUT_DIR))
    tok.save_pretrained(str(OUT_DIR))

    print("[2/2] Quantizing to int8 (avx512_vnni, dynamic) via optimum ...")
    quantizer = ORTQuantizer.from_pretrained(str(OUT_DIR), file_name=FP32_ONNX.name)
    qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)
    quantizer.quantize(
        save_dir=str(OUT_DIR),
        quantization_config=qconfig,
        file_suffix="quantized",
    )

    # optimum names the output "<stem>_quantized.onnx" → normalize to model_quantized.onnx.
    produced = OUT_DIR / "model_quantized.onnx"
    if not produced.exists():
        raise SystemExit(
            f"expected int8 model at {produced}; dir has: "
            f"{[p.name for p in OUT_DIR.glob('*.onnx')]}"
        )
    # Drop the fp32 intermediate — only the int8 model ships.
    try:
        FP32_ONNX.unlink()
    except OSError:
        pass

    size_mb = INT8_ONNX.stat().st_size / 1024 / 1024
    print(f"\nDone. int8 model: {INT8_ONNX} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
