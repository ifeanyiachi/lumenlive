<h1 align="center">LumenLive</h1>

<p align="center">Church presentation software that keeps up with your service — and your pastor.</p>

<p align="center">A Tauri v2 desktop app (React frontend, Rust backend) for running scripture, songs, slides, media, and announcements to broadcast-quality outputs — with real-time AI that puts the verse on screen the moment it's spoken.</p>

LumenLive is a full live-production suite for worship services: build a run-of-show; design slides and overlays; project songs, scripture, media, and web content; and send everything to projectors, stage displays, and NDI video mixers. On top of that, it listens to the sermon, transcribes it in real time, and detects Bible references — both explicit citations and spoken quotations — so the right scripture appears without anyone typing it.

## Features

### Service planning & live control

- **Service schedule / run-of-show** — build named services from scripture, songs, slides, media, web, and section headers; drag-and-drop reorder, duplicate detection, per-item speaker notes, and next/previous navigation that walks slide-by-slide through decks. Multiple saved schedules.
- **Live queue** — stage detected or hand-picked verses to go live, reorder them, and fire any one to the output with a click. Automatic de-duplication so the same verse never queues twice.
- **Stage display** — a confidence monitor for the platform showing current + next content, a clock, and speaker notes, with its own layout and styling.
- **Onboarding tour** — a guided, interactive walkthrough for first-time operators.

### Songs & lyrics

- **Song library** — build, edit, and organize songs with an arrangement builder (order verses, choruses, bridges) and CCLI metadata.
- **Online lyrics search** — fan a query across LRCLIB and Genius and pull full lyrics (including time-synced lyrics from LRCLIB) without leaving the app.
- **Import** — bring in existing songs from OpenLyrics and OpenSong files.
- **Projection** — per-song projection options with dedicated lyric and hymnal slide themes.

### Presentation & slides

- **Slide/deck editor** — WYSIWYG 1920×1080 canvas with text, image, scripture, shape, and video elements; per-element entry/exit animations, shadows, outlines, masks, and text build-ins (line-by-line / word-by-word).
- **Backgrounds & transitions** — solid, gradient, image, or video backgrounds with blur/brightness/tint; slide transitions (cut, fade, dissolve, push, wipe).
- **Slide themes** — 12 built-in themes with layout variants (title, title+content, scripture, blank), plus a theme picker.
- **PowerPoint import** — bring in `.pptx` decks (text boxes, pictures, backgrounds).
- **PDF export** — export any deck to a print-ready PDF.

### Broadcast output engine

- **Multiple named outputs** — e.g. *Program* and *Alt*, each with its own theme, monitor, and content-routing mode (mirror another output, run independently, or per-output layer filtering).
- **Theme Designer** — a Fabric.js canvas editor for verse overlays: backgrounds, verse/number/reference typography, shadows, outlines, text boxes, layout anchoring, transitions, and custom image/shape overlay elements — with undo/redo, duplicate, and live preview. 12 built-in broadcast themes.
- **NDI broadcast output** — send the program feed as an NDI source to OBS, vMix, and hardware mixers. Configurable source name, resolution (720p/1080p/4K), frame rate (24/30/60), and three alpha modes.
- **Props & overlays** — persistent lower-thirds, logos, and text/image graphics toggled on and off independently of the main content.
- **Alerts** — banner, lower-third, and full-screen announcements (nursery call, prayer request, custom message) with templated styling, icons, animation, and auto-dismiss.
- **Countdown timers** — pre-service and segment countdowns with configurable format, position, styling, and end action.

### Media & web

- **Media library** — import images, video, and audio (reference or app-managed copy), organize into collections, tag and search, and generate thumbnails.
- **Media playback** — trim in/out points, loop, end actions (hold/stop/loop/next), named cue markers, and live fit/framing (cover, contain, fill, zoom, focal-point pan, letterbox).
- **Web & YouTube presentation** — put any URL or YouTube video full-screen on the audience output, with start/end offsets, transport controls, live-stream support, and jump-to-live.

### AI verse detection

- **Real-time speech-to-text** via local Moonshine/sherpa-onnx (offline) or cloud Deepgram (WebSocket streaming with Bible keyterm boosting).
- **Multi-strategy detection** merged through one confidence-scored pipeline:
  - **Direct reference parsing** — Aho-Corasick automaton + fuzzy book-name matching for explicit citations ("John 3:16").
  - **Semantic search** — local int8-quantized ONNX embeddings (Qwen3-0.6B) with vector similarity for paraphrased or quoted scripture.
  - **FTS5 keyword search** — BM25 ranking fused with vector results; agreement boosts confidence.
  - **Reading mode** — locks onto a passage and auto-advances verse-by-verse, refining chapter-only hits as the reading continues.
- **Tunable behavior** — confidence threshold, cooldown, auto-display, and paraphrase-detection toggles.

### Scripture library

- **Translations** — KJV ships bundled for offline use, alongside three public-domain translations (SpaRV Spanish, FreJND French, PorBLivre Portuguese). Eight more — NIV, ESV, NKJV, NLT, NASB, AMP, MSG, and TPT — are supported via bring-your-own import (you supply your own licensed copy).
- **SQLite Bible database** with FTS5 full-text search (BM25 ranking).
- **Cross-references** — from openbible.info, with vote counts.
- **Original-language word study** — per-verse Hebrew/Greek interlinear with transliteration, Strong's numbers, morphology, and full lexicon entries (definition, KJV usage, etymology); project any word as a study card.
- **Verse editor** — rich-text (TipTap) editing of how a verse displays live, with styled segments; saved edits auto-apply whenever that verse is presented.

### Control & audio

- **Remote control** — OSC and HTTP APIs to drive LumenLive from phones, tablets, stream decks, or show-control systems (next/prev, show/hide, theme/opacity, schedule navigation, alerts, and more).
- **Audio input** — device selection, gain control, live RMS/peak level metering, and voice-activity detection.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Bun](https://bun.sh) | Latest | Package manager and script runtime |
| [Rust](https://rustup.rs) | Stable | Backend compilation |
| [Tauri CLI](https://v2.tauri.app/start/create-project/) | v2 | Desktop app framework |
| [LLVM](https://releases.llvm.org/) | Latest | Required on Windows for native deps |
| [CMake](https://cmake.org/) | Latest | Required on Windows for native deps |

**Windows** — run the bootstrap script first (installs LLVM and CMake via `winget` if missing):

```sh
bun run setup:windows
```

## Setup

```sh
bun install
bun run setup:all
```

`setup:all` is idempotent — it downloads Bible source data, builds the SQLite database, downloads the Qwen3 ONNX model, and precomputes verse embeddings, skipping any phase already complete.

<details>
<summary>Running individual setup steps</summary>

| Command | What it does |
|---------|-------------|
| `bun run download:bible-data` | Download Bible translation source files |
| `bun run build:bible` | Build the SQLite database from source files |
| `bun run setup:lexicon` | Build the Hebrew/Greek lexicon database |
| `bun run download:model` | Download the int8-quantized Qwen3-0.6B ONNX embedding model |
| `bun run precompute:embeddings` | Precompute verse embeddings (Rust, release mode) |
| `bun run download:sherpa` | Download the Moonshine base.en model (sherpa-onnx) for local STT |
| `bun run download:ndi-sdk` | Download the NDI 6 SDK (only needed for broadcast output) |

</details>

## Development

Run the full app (Vite dev server + desktop shell) with `bun run tauri dev`. The first Rust build takes a while; subsequent runs are incremental.

| Command | What it does |
|---------|-------------|
| `bun run tauri dev` | Run the full app (Vite + Tauri) |
| `bun run tauri build` | Produce a platform installer |
| `bun run dev` | Frontend only on the Vite dev server |
| `bun run build` | `tsc -b && vite build` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint |
| `bun run format` | Prettier (with Tailwind plugin) |
| `bun run test` | Vitest |

For the Rust workspace (from `src-tauri/`): `cargo check`, `cargo clippy --all-targets`, `cargo fmt`, `cargo test`.

## Project structure

```
lumenlive/
├── src/              React frontend
│   ├── components/   Feature UI — schedule, slides, songs, media,
│   │                 broadcast, alerts, countdown, props, verse-edit, panels
│   ├── stores/       Zustand stores (one per subsystem)
│   ├── types/        Shared data models
│   ├── hooks/        React hooks
│   └── lib/          Themes, renderers, import/export (pptx, pdf)
├── src-tauri/        Rust workspace
│   ├── crates/
│   │   ├── audio         cpal capture, VAD, metering
│   │   ├── stt           Deepgram (WS + REST), local Moonshine (sherpa-onnx)
│   │   ├── bible         SQLite + FTS5, cross-references, lexicon
│   │   ├── detection     Direct parsing, semantic + keyword search, merger
│   │   ├── lyrics        Online lyrics search (LRCLIB, Genius)
│   │   ├── broadcast     Output windows + NDI output via FFI
│   │   └── api           Tauri command layer, OSC + HTTP remote control
│   └── tauri.conf.json
├── data/             Bible + model data pipeline (TypeScript + Python)
└── .github/          CI workflows, issue templates
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri v2 |
| Frontend | React 19 + TypeScript + Tailwind CSS v4 + Zustand |
| UI components | shadcn/ui + Radix |
| Canvas & editing | Fabric.js (theme designer), TipTap (verse editor) |
| Import / export | JSZip (`.pptx` import), jsPDF (PDF export) |
| Backend | Rust (workspace with 7 crates) |
| Speech-to-text | Moonshine / sherpa-onnx (local) / Deepgram (cloud) |
| Verse detection | Aho-Corasick + semantic embeddings (Qwen3-0.6B ONNX, int8-quantized) |
| Lyrics | LRCLIB + Genius search, OpenLyrics / OpenSong import |
| Bible database | SQLite + FTS5 |
| Broadcast | NDI 6 SDK via FFI |
| Remote control | OSC + HTTP (Axum) |

## Support

Found a bug or have a feature request? [Open an issue](../../issues). For anything else, email [hello@lumenlive.xyz](mailto:hello@lumenlive.xyz) or follow us on social media.

## Security

See [SECURITY.md](.github/SECURITY.md) for the CSP policy and how to report vulnerabilities.

## License

[MIT](LICENSE)
