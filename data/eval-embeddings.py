#!/usr/bin/env python3
"""
Side-by-side retrieval eval for the semantic verse-detection model.

Answers ONE question with numbers instead of vibes: given a spoken-style
paraphrase of a verse, how often does each embedding model rank the CORRECT
verse at the top, against the full 31k-verse corpus?

Metrics (higher is better, except median rank):
  R@1/R@3/R@5/R@10  — fraction of queries whose gold verse is in the top-k
  MRR@10            — mean reciprocal rank (rewards ranking gold higher)
  median rank       — typical position of the gold verse

Runs (pick with flags; default = all available):
  --qwen3           qwen3-0.6B int8, NO query prefix   (exactly how the app uses it today)
  --qwen3-instruct  qwen3-0.6B int8, WITH the Qwen3 retrieval instruction on the QUERY
                    (its recommended asymmetric mode — reveals if the app under-uses it)
  --bge             bge-base-en-v1.5 via sentence-transformers, with its query prefix
  --model NAME      any other sentence-transformers model id (e.g. thenlper/gte-base)

qwen3 reuses the already-precomputed corpus embeddings (embeddings/kjv-qwen3-0.6b.bin),
so it runs in seconds. sentence-transformers models embed the full corpus once and
cache it to embeddings/eval-cache/<key>.npy, so re-runs are fast.

Deps:
  qwen3 runs:  pip install onnxruntime tokenizers numpy
  st runs:     pip install sentence-transformers      (pulls torch)

Usage:
  python data/eval-embeddings.py                 # all available
  python data/eval-embeddings.py --qwen3 --bge   # just those two
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CORPUS_PATH = ROOT / "data" / "verses-for-embedding.json"
EVAL_PATH = ROOT / "data" / "eval" / "verse-paraphrases.json"
CACHE_DIR = ROOT / "embeddings" / "eval-cache"

QWEN3_BIN = ROOT / "embeddings" / "kjv-qwen3-0.6b.bin"
QWEN3_ONNX = ROOT / "models" / "qwen3-embedding-0.6b-int8" / "model_quantized.onnx"
QWEN3_TOK = ROOT / "models" / "qwen3-embedding-0.6b-int8" / "tokenizer.json"

# Qwen3-Embedding's recommended query instruction for retrieval (doc side gets
# no prefix — which matches how the corpus .bin was built).
QWEN3_INSTRUCT = (
    "Instruct: Given a spoken reference, retrieve the Bible verse it refers to\nQuery: "
)
# bge-*-en-v1.5 recommended query instruction (passages get no prefix).
BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

MAX_LEN = 128


def l2(x):
    n = np.linalg.norm(x, axis=1, keepdims=True)
    return (x / np.maximum(n, 1e-12)).astype(np.float32)


def load_corpus():
    d = json.load(open(CORPUS_PATH, encoding="utf-8"))
    texts = [e["text"] for e in d]
    refs = [e["ref"] for e in d]
    ref2idx = {r: i for i, r in enumerate(refs)}
    return texts, refs, ref2idx


def load_eval(ref2idx):
    raw = json.load(open(EVAL_PATH, encoding="utf-8"))
    pairs = raw["pairs"] if isinstance(raw, dict) else raw
    queries, gold, missing = [], [], []
    for p in pairs:
        if p["ref"] not in ref2idx:
            missing.append(p["ref"])
            continue
        queries.append(p["query"])
        gold.append(ref2idx[p["ref"]])
    if missing:
        print(f"  ! {len(missing)} eval refs not found in corpus (skipped): {missing}")
    return queries, gold


# ── qwen3 (ONNX int8) ────────────────────────────────────────────────
def qwen3_corpus_embeddings(n):
    emb = np.fromfile(QWEN3_BIN, dtype="<f4")
    dim = emb.size // n
    if dim * n != emb.size:
        sys.exit(f"qwen3 .bin size {emb.size} not divisible by corpus {n}")
    return l2(emb.reshape(n, dim))


def qwen3_embed(texts, prefix="", batch=16):
    import onnxruntime as ort
    from tokenizers import Tokenizer

    tok = Tokenizer.from_file(str(QWEN3_TOK))
    tok.enable_truncation(max_length=MAX_LEN)
    tok.enable_padding(length=MAX_LEN)
    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    sess = ort.InferenceSession(str(QWEN3_ONNX), so)
    outs = [o.name for o in sess.get_outputs()]
    ins = [i.name for i in sess.get_inputs()]
    has_se = "sentence_embedding" in outs
    has_pos = "position_ids" in ins

    out = []
    for i in range(0, len(texts), batch):
        bt = [prefix + t for t in texts[i : i + batch]]
        enc = tok.encode_batch(bt)
        ii = np.array([e.ids for e in enc], dtype=np.int64)
        am = np.array([e.attention_mask for e in enc], dtype=np.int64)
        feeds = {"input_ids": ii, "attention_mask": am}
        if has_pos:
            sl = ii.shape[1]
            feeds["position_ids"] = np.broadcast_to(
                np.arange(sl, dtype=np.int64).reshape(1, -1), ii.shape
            ).copy()
        if has_se:
            e = sess.run(["sentence_embedding"], feeds)[0]
        else:
            h = sess.run(None, feeds)[0]
            m = am[:, :, None].astype(np.float32)
            e = (h * m).sum(1) / np.maximum(m.sum(1), 1e-12)
        out.append(e.astype(np.float32))
    return l2(np.concatenate(out, 0))


# ── sentence-transformers (any model) ────────────────────────────────
def st_embed(model_name, texts, prefix="", cache_key=None, batch=64, quantize=False):
    if cache_key:
        cp = CACHE_DIR / f"{cache_key}.npy"
        if cp.exists():
            print(f"    (cached corpus: {cp.name})")
            return np.load(cp)
    from sentence_transformers import SentenceTransformer

    m = SentenceTransformer(model_name, device="cpu")
    if quantize:
        # Dynamic int8 on the Linear layers — a faithful, dependency-light proxy
        # for what a shipped int8 model does. Small encoders (bge) quantize cleanly.
        import torch

        m = torch.quantization.quantize_dynamic(
            m, {torch.nn.Linear}, dtype=torch.qint8
        )
    e = m.encode(
        [prefix + t for t in texts],
        batch_size=batch,
        normalize_embeddings=True,
        show_progress_bar=len(texts) > 1000,
    )
    e = np.asarray(e, dtype=np.float32)
    if cache_key:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        np.save(CACHE_DIR / f"{cache_key}.npy", e)
    return e


# ── metrics ──────────────────────────────────────────────────────────
def evaluate(qemb, cemb, gold):
    sims = qemb @ cemb.T  # [Q, N], both L2-normalized → cosine
    ranks = np.empty(len(gold), dtype=np.int64)
    for i, g in enumerate(gold):
        # rank of gold = 1 + number of corpus items scoring strictly higher
        ranks[i] = 1 + int((sims[i] > sims[i, g]).sum())
    rec = lambda k: float((ranks <= k).mean())
    mrr = float((1.0 / ranks).mean())
    return {
        "R@1": rec(1),
        "R@3": rec(3),
        "R@5": rec(5),
        "R@10": rec(10),
        "MRR": mrr,
        "medRank": int(np.median(ranks)),
    }, ranks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--qwen3", action="store_true")
    ap.add_argument("--qwen3-instruct", action="store_true")
    ap.add_argument("--bge", action="store_true", help="bge-base-en-v1.5 fp32")
    ap.add_argument("--bge-int8", action="store_true", help="bge-base-en-v1.5 int8")
    ap.add_argument("--bge-large", action="store_true", help="bge-large-en-v1.5 fp32")
    ap.add_argument(
        "--bge-large-int8", action="store_true", help="bge-large-en-v1.5 int8"
    )
    ap.add_argument("--model", action="append", default=[], metavar="ST_MODEL_ID")
    args = ap.parse_args()

    # Default: every run whose assets are present.
    explicit = (
        args.qwen3
        or args.qwen3_instruct
        or args.bge
        or args.bge_int8
        or args.bge_large
        or args.bge_large_int8
        or args.model
    )
    if not explicit:
        args.qwen3 = QWEN3_BIN.exists() and QWEN3_ONNX.exists()
        args.qwen3_instruct = args.qwen3
        args.bge = True  # will pip-download on demand

    print("=== LumenLive semantic-retrieval eval ===")
    texts, refs, ref2idx = load_corpus()
    queries, gold = load_eval(ref2idx)
    print(f"  corpus: {len(texts)} verses   eval: {len(queries)} paraphrases\n")

    runs = []  # (name, config-dict)
    if args.qwen3:
        runs.append(("qwen3 (app, no-prefix)", {"kind": "qwen3", "prefix": ""}))
    if args.qwen3_instruct:
        runs.append(
            ("qwen3 (instruct query)", {"kind": "qwen3", "prefix": QWEN3_INSTRUCT})
        )
    if args.bge:
        runs.append(
            (
                "bge-base-en-v1.5 (fp32)",
                {
                    "kind": "st",
                    "model": "BAAI/bge-base-en-v1.5",
                    "cache": "bge-base-en-v1.5",
                    "qprefix": BGE_QUERY_PREFIX,
                },
            )
        )
    if args.bge_int8:
        runs.append(
            (
                "bge-base-en-v1.5 (int8)",
                {
                    "kind": "st",
                    "model": "BAAI/bge-base-en-v1.5",
                    "cache": "bge-base-int8",
                    "qprefix": BGE_QUERY_PREFIX,
                    "quantize": True,
                },
            )
        )
    if args.bge_large:
        runs.append(
            (
                "bge-large-en-v1.5 (fp32)",
                {
                    "kind": "st",
                    "model": "BAAI/bge-large-en-v1.5",
                    "cache": "bge-large-en-v1.5",
                    "qprefix": BGE_QUERY_PREFIX,
                },
            )
        )
    if args.bge_large_int8:
        runs.append(
            (
                "bge-large-en-v1.5 (int8)",
                {
                    "kind": "st",
                    "model": "BAAI/bge-large-en-v1.5",
                    "cache": "bge-large-int8",
                    "qprefix": BGE_QUERY_PREFIX,
                    "quantize": True,
                },
            )
        )
    for mid in args.model:
        runs.append(
            (
                mid,
                {
                    "kind": "st",
                    "model": mid,
                    "cache": mid.replace("/", "__"),
                    "qprefix": "",
                },
            )
        )

    results = {}
    ranks_by_run = {}
    for name, cfg in runs:
        print(f"[{name}]")
        t0 = time.time()
        try:
            if cfg["kind"] == "qwen3":
                cemb = qwen3_corpus_embeddings(len(texts))
                qemb = qwen3_embed(queries, prefix=cfg["prefix"])
            else:
                q = cfg.get("quantize", False)
                cemb = st_embed(
                    cfg["model"], texts, prefix="", cache_key=cfg["cache"], quantize=q
                )
                cemb = l2(cemb)
                qemb = l2(
                    st_embed(cfg["model"], queries, prefix=cfg["qprefix"], quantize=q)
                )
            m, ranks = evaluate(qemb, cemb, gold)
            results[name] = m
            ranks_by_run[name] = ranks
            print(f"    done in {time.time() - t0:.1f}s\n")
        except Exception as e:  # noqa: BLE001 — surface any backend failure, keep going
            print(f"    SKIPPED — {type(e).__name__}: {e}\n")

    if not results:
        sys.exit("No runs completed.")

    # ── table ──
    cols = ["R@1", "R@3", "R@5", "R@10", "MRR", "medRank"]
    width = max(len(n) for n in results) + 2
    print("=" * (width + len(cols) * 9))
    print("model".ljust(width) + "".join(c.rjust(9) for c in cols))
    print("-" * (width + len(cols) * 9))
    for name, m in results.items():
        row = name.ljust(width)
        for c in cols:
            row += (f"{m[c]:.3f}" if c != "medRank" else str(m[c])).rjust(9)
        print(row)
    print("=" * (width + len(cols) * 9))

    # ── per-query disagreements (where models rank the gold very differently) ──
    if len(ranks_by_run) >= 2:
        names = list(ranks_by_run.keys())
        print("\nLargest per-query disagreements (gold-verse rank; lower is better):")
        spread = []
        for i in range(len(queries)):
            rr = [ranks_by_run[n][i] for n in names]
            spread.append((max(rr) - min(rr), i, rr))
        spread.sort(reverse=True)
        head = "  " + "query".ljust(52) + "".join(n[:16].rjust(18) for n in names)
        print(head)
        for _, i, rr in spread[:12]:
            q = (queries[i][:50] + "..") if len(queries[i]) > 50 else queries[i]
            line = "  " + q.ljust(52) + "".join(str(r).rjust(18) for r in rr)
            print(line)


if __name__ == "__main__":
    main()
