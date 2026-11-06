#!/usr/bin/env python3
"""
Pre-compute verse embeddings with the Qwen3-Embedding-0.6B ONNX model.

Mirror of precompute-embeddings-onnx.py (the bge path) for the Qwen A/B model:
it embeds every verse with the SAME int8 model the Rust app loads at runtime, so
the pre-computed index and live queries share one vector space.

Qwen specifics vs. bge:
  - Symmetric model: verses AND queries are embedded with NO prefix (bge instead
    prefixes queries). Keep verses prefix-free here to match the runtime.
  - The model exposes no baked-in `sentence_embedding`, so this falls through to
    mean pooling over the attention mask (matches the Rust OnnxEmbedder).
  - Qwen3 needs a `position_ids` input; it's fed when the model declares it.

The tokenizer lives inside the self-contained int8 dir, because the downloader
(data/download-model.ts) drops the fp32 export after quantizing.

Usage:
  python3 data/precompute-embeddings-qwen-onnx.py

Requires:
  pip install onnxruntime tokenizers numpy
"""

import json
import os
import time
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

# ── Paths ───────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
VERSES_PATH = ROOT / "data" / "verses-for-embedding.json"
EMB_OUT = ROOT / "embeddings" / "kjv-qwen3-0.6b.bin"
IDS_OUT = ROOT / "embeddings" / "kjv-qwen3-0.6b-ids.bin"

# Qwen int8, produced by data/download-model.ts. Model + tokenizer both live in
# the self-contained int8 dir. Same int8 model the runtime OnnxEmbedder loads.
MODEL_INT8 = ROOT / "models" / "qwen3-embedding-0.6b-int8" / "model_quantized.onnx"
MODEL_FP32 = ROOT / "models" / "qwen3-embedding-0.6b" / "model.onnx"  # fallback if kept
TOKENIZER_PATH = ROOT / "models" / "qwen3-embedding-0.6b-int8" / "tokenizer.json"

MAX_LENGTH = 128  # Bible verses are short (~20 tokens avg). 128 is plenty and 4x faster than 512.
BATCH_SIZE = 64


def main():
    print(f"\n=== LumenLive Verse Embedding Pre-computation (Qwen3 ONNX) ===")

    # Select model
    if MODEL_INT8.exists():
        model_path = MODEL_INT8
        print(f"Model: INT8 quantized ({model_path})")
    elif MODEL_FP32.exists():
        model_path = MODEL_FP32
        print(f"Model: FP32 ({model_path})")
    else:
        print(f"ERROR: No ONNX model found at {MODEL_INT8} or {MODEL_FP32}")
        print("       Run 'bun run download:model' to generate the Qwen int8 model.")
        sys.exit(1)

    # Load tokenizer
    print(f"Tokenizer: {TOKENIZER_PATH}")
    tokenizer = Tokenizer.from_file(str(TOKENIZER_PATH))
    tokenizer.enable_truncation(max_length=MAX_LENGTH)
    # DYNAMIC padding: pad each batch to its longest sequence, NOT a fixed 128.
    # Verses average ~20 tokens, so fixed-128 padding wastes ~6x the compute on
    # pad tokens. Mean pooling over the attention mask is padding-invariant, so
    # the resulting embeddings are byte-for-byte the same as fixed padding — this
    # is purely a speed win. Combined with length-sorted batching below, most
    # batches are short and throughput climbs dramatically.
    tokenizer.enable_padding()

    # Load ONNX model
    print(f"Loading ONNX model...")
    sess_options = ort.SessionOptions()
    sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    # Use all logical cores for intra-op parallelism (the 0.6B int8 matmuls are
    # the bottleneck). ORT defaults to physical cores; be explicit.
    sess_options.intra_op_num_threads = os.cpu_count() or 4
    session = ort.InferenceSession(str(model_path), sess_options)

    # Check for sentence_embedding output
    output_names = [o.name for o in session.get_outputs()]
    print(f"Model outputs: {output_names}")
    has_sentence_embedding = "sentence_embedding" in output_names

    if has_sentence_embedding:
        print("Using 'sentence_embedding' output (pre-pooled)")
    else:
        print("Using mean pooling on first output (Qwen has no baked-in pooling).")

    # Check for position_ids input
    input_names = [i.name for i in session.get_inputs()]
    has_position_ids = "position_ids" in input_names
    print(f"Model inputs: {input_names}")

    # Load verses
    print(f"\nLoading verses from {VERSES_PATH}...")
    with open(VERSES_PATH) as f:
        entries = json.load(f)
    print(f"  {len(entries)} verses loaded")

    ids = [e["id"] for e in entries]
    texts = [e["text"] for e in entries]  # NO prefix — Qwen is symmetric
    n = len(texts)

    # LENGTH-SORTED batching: process verses ordered by length so each batch
    # groups similar-length sequences. With dynamic padding, a batch then pads to
    # its own (short) longest verse instead of the global max — minimizing wasted
    # pad-token compute. Embeddings are written back to ORIGINAL positions, so the
    # output order (and thus the id sidecar) is unchanged. Output values are
    # identical to unsorted/fixed-padding — only the compute order differs.
    order = sorted(range(n), key=lambda i: len(texts[i]))
    dim = None
    out = None  # allocated once we know the embedding dim

    # Process in batches
    print(f"\nEncoding {n} verses in batches of {BATCH_SIZE} (length-sorted, dynamic pad)...")
    t0 = time.time()
    done = 0

    for batch_start in range(0, n, BATCH_SIZE):
        batch_idx = order[batch_start : batch_start + BATCH_SIZE]
        batch_texts = [texts[i] for i in batch_idx]

        # Tokenize batch (pads to the longest sequence in THIS batch)
        encodings = tokenizer.encode_batch(batch_texts)

        input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
        attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)

        feeds = {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
        }

        if has_position_ids:
            seq_len = input_ids.shape[1]
            position_ids = np.broadcast_to(
                np.arange(seq_len, dtype=np.int64).reshape(1, -1),
                input_ids.shape,
            ).copy()
            feeds["position_ids"] = position_ids

        # Run inference
        if has_sentence_embedding:
            outputs = session.run(["sentence_embedding"], feeds)
            embeddings = outputs[0]  # shape: [batch, dim]
        else:
            outputs = session.run(None, feeds)
            hidden = outputs[0]  # shape: [batch, seq_len, dim]
            # Mean pooling
            mask_expanded = attention_mask[:, :, np.newaxis].astype(np.float32)
            embeddings = (hidden * mask_expanded).sum(axis=1) / mask_expanded.sum(axis=1)

        # L2 normalize
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms = np.maximum(norms, 1e-12)
        embeddings = (embeddings / norms).astype(np.float32)

        # Scatter results back to their original verse positions.
        if out is None:
            dim = embeddings.shape[1]
            out = np.empty((n, dim), dtype=np.float32)
        for j, i in enumerate(batch_idx):
            out[i] = embeddings[j]

        done += len(batch_idx)
        if done % (BATCH_SIZE * 10) == 0 or done == n:
            elapsed = time.time() - t0
            rate = done / elapsed if elapsed > 0 else 0
            remaining = (n - done) / rate if rate > 0 else 0
            print(f"  {done}/{n} ({rate:.0f} verses/sec, ~{remaining/60:.0f} min remaining)", flush=True)

    elapsed = time.time() - t0
    print(f"  Done in {elapsed:.1f}s ({len(texts) / elapsed:.0f} verses/sec)")

    # `out` is already in original verse order (results were scattered back).
    print(f"  Embedding dimension: {dim}")

    # Write embeddings binary (flat f32, little-endian)
    EMB_OUT.parent.mkdir(parents=True, exist_ok=True)
    print(f"\nWriting embeddings to {EMB_OUT}...")
    emb_array = np.ascontiguousarray(out, dtype="<f4")
    emb_array.tofile(str(EMB_OUT))
    emb_size = EMB_OUT.stat().st_size
    print(f"  {emb_size:,} bytes ({emb_size / 1024 / 1024:.1f} MB)")

    # Write IDs binary (flat i64, little-endian)
    print(f"Writing IDs to {IDS_OUT}...")
    ids_array = np.array(ids, dtype="<i8")
    ids_array.tofile(str(IDS_OUT))
    ids_size = IDS_OUT.stat().st_size
    print(f"  {ids_size:,} bytes")

    # Verify
    expected_emb = len(entries) * dim * 4
    expected_ids = len(entries) * 8
    assert emb_size == expected_emb, f"Embedding size mismatch: {emb_size} != {expected_emb}"
    assert ids_size == expected_ids, f"IDs size mismatch: {ids_size} != {expected_ids}"

    print(f"\n=== Done! {len(entries)} verses x {dim} dims ===\n")


if __name__ == "__main__":
    main()
