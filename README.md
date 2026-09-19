<h1 align="center">LumenLive</h1>

<p align="center">Church presentation software that keeps up with your service — and your pastor.</p>

<p align="center">A Tauri v2 desktop app (React frontend, Rust backend) for running scripture, songs, slides, media, and announcements to broadcast-quality outputs — with real-time AI that puts the verse on screen the moment it's spoken.</p>

LumenLive is a full live-production suite for worship services: build a run-of-show; design slides and overlays; project songs, scripture, media, and web content; and send everything to projectors, stage displays, and NDI video mixers. On top of that, it listens to the sermon, transcribes it in real time, and detects Bible references — both explicit citations and spoken quotations — so the right scripture appears without anyone typing it.

## Features

### Service planning & live control

- **Service schedule / run-of-show** — build named services from scripture, songs, slides, media, web, and section headers; drag-and-drop reorder, duplicate detection, per-item speaker notes, and next/previous navigation that walks slide-by-slide through decks. Multiple saved schedules.
- **Scripture collections** — select several verses in book search and drop them in as a single grouped item that expands into a deck of one slide per verse, in canonical order.
- **Live queue** — stage detected or hand-picked verses to go live, reorder them, and fire any one to the output with a click. Automatic de-duplication so the same verse never queues twice.
- **Stage display** — a confidence monitor for the platform showing current + next content, a clock, and speaker notes, with its own layout and styling.
- **Keyboard shortcuts** — a registry-driven cheat sheet (press `?`) covering transcription, search, schedule navigation, live control, and editing, with the same bindings surfaced in tooltips.
- **Onboarding tour** — a guided, interactive walkthrough for first-time operators.
- **Service-safe** — accidental page reloads are blocked while a service is live so a stray keystroke can't take the output down.

### Songs & lyrics

- **Song library** — build, edit, and organize songs with an arrangement builder (order verses, choruses, bridges) and CCLI metadata.
- **Online lyrics search** — fan a query across LRCLIB and Genius and pull full lyrics (including time-synced lyrics from LRCLIB) without leaving the app.
- **Import** — bring in existing songs from OpenLyrics and OpenSong files.
- **Projection** — per-song projection options with dedicated lyric and hymnal slide themes.

### Presentation & slides

- **Slide/deck editor** — WYSIWYG 1920×1080 canvas with text, image, scripture, shape, and video elements; per-element entry/exit animations, shadows, outlines, masks, and text build-ins (line-by-line / word-by-word).
- **Backgrounds & transitions** — solid, gradient, image, or video backgrounds with blur/brightness/tint; slide transitions (cut, fade, dissolve, push, wipe).
- **PowerPoint import** — bring in `.pptx` decks (text boxes, pictures, backgrounds).
- **PDF export** — export any deck to a print-ready PDF.

### Themes & looks

- **Type-first themes** — a theme is a styled single slide with an intrinsic *type* — **scripture, song, countdown, sermon, overlay,** or **announcement** — whose required elements are placeholders that live or authored content flows into at go-live. The type is chosen once at creation and drives the builder, the controls, and how content fills in.
- **Built-in catalog** — 15 built-in looks: one primary per type plus a nine-strong library of song looks (glow, hymnal, and animated backdrops like aurora, bokeh, embers, starfield, snow, godrays, and drift).
- **Look editor** — design themes on the same element canvas as slides: backgrounds, verse / number / reference typography, shadows, outlines, text boxes, layout anchoring, transitions, and custom image or shape overlays — with undo/redo, duplicate, and live preview.
- **Portable theme bundles** — export any theme (or stage layout) with its media as a self-contained `.lumtheme` file and import it on another machine.

### Broadcast output engine

- **Multiple named outputs** — e.g. *Program* and *Alt*, each with its own theme, monitor, and content-routing mode (mirror another output, run independently, or per-output layer filtering).
- **Resilient live output** — the output survives a monitor being unplugged and re-plugged, persists the live session, and hardens the output window running on the operator's own desktop.
- **NDI broadcast output** — send the program feed as an NDI source to OBS, vMix, and hardware mixers. Configurable source name, resolution (720p/1080p/4K), frame rate (24/30/60), and three alpha modes.
- **Props & overlays** — persistent lower-thirds, logos, and text/image graphics toggled on and off independently of the main content.
- **Alerts** — banner, lower-third, and full-screen announcements (nursery call, prayer request, custom message) with templated styling, icons, animation, and auto-dismiss.
- **Countdown timers** — pre-service and segment countdowns with configurable format, position, styling, and end action.

### Media & web

- **Media library** — import images, video, and audio (reference or app-managed copy), organize into collections, tag and search, and generate thumbnails.
- **Media playback** — trim in/out points, loop, end actions (hold/stop/loop/next), named cue markers, and live fit/framing (cover, contain, fill, zoom, focal-point pan, letterbox).
- **Web & YouTube presentation** — put any URL or YouTube video full-screen on the audience output, with start/end offsets, transport controls, live-stream support, and jump-to-live.

### AI verse detection

- **Real-time speech-to-text** — cloud Deepgram (WebSocket streaming with Bible keyterm boosting).
- **Multi-strategy detection** merged through one confidence-scored pipeline:
  - **Direct reference parsing** — Aho-Corasick automaton + fuzzy book-name matching for explicit citations ("John 3:16").
  - **Semantic search** — local int8-quantized ONNX embeddings (bge-base-en-v1.5) with HNSW vector similarity for paraphrased or quoted scripture.
  - **FTS5 keyword search** — BM25 ranking fused with vector results; agreement boosts confidence.
  - **Quotation scoring** — archaic register and citation cues lift the confidence of an actual quotation so it outranks a loose allusion.
- **Voice commands** — the operator can drive scripture by voice: step forward/back N verses, jump to an absolute verse of the current chapter, or move to another chapter ("next verse", "back two verses", "verse three", "go to chapter seven").
- **Preview before live** — send an AI-detected verse to Program preview to check it before committing it to the audience output.
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

### Backup, sync & sharing

- **Full-library backup** — export the entire content library — custom themes, stage layouts, presentations, songs, schedules, the media library (bytes included), countdown timers, alert templates, and web bookmarks — to a single `.lumbackup` file, with selective control over what's included. Restore merges by id, so re-importing is idempotent. (API keys, app settings, and the Bible/model data stay out.)
- **Self-contained schedule bundles** — export a service as a `.lumsched` file that embeds its presentations, songs, custom themes, and raw media, so a schedule built on one machine opens with everything intact on another.
- **Portable theme bundles** — share an individual theme or stage layout with its media as a `.lumtheme` file.
- **File associations** — `.lumbackup`, `.lumsched`, and `.lumtheme` files open straight into LumenLive.

### Updates & privacy

- **In-app updater** — checks for a newer signed release at launch and surfaces a Software Update panel; downloads with a progress bar, verifies the signature, and relaunches. A failed or offline check never blocks startup, and a dismissed version stays dismissed.
- **Privacy-respecting telemetry** — optional anonymous usage analytics (fixed event names and small closed enums only — no scripture text, church or service names, media paths, or free-form strings), with a one-switch opt-out in Privacy settings.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Bun](https://bun.sh) | Latest | Package manager and script runtime |
| [Rust](https://rustup.rs) | Stable | Backend compilation |
| [Tauri CLI](https://v2.tauri.app/start/create-project/) | v2 | Desktop app framework |
| [Python](https://www.python.org/) | 3.10+ | Setup pipeline: exports the embedding model and precomputes verse embeddings (a `.venv` with torch/onnx is created automatically) |
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

`setup:all` is idempotent — it provisions the Python `.venv`, downloads Bible source data, builds the SQLite database, and exports the bge-base-en-v1.5 embedding model to int8 ONNX and precomputes verse embeddings. It skips any phase already complete. First run downloads torch and the source models, so expect several GB and a while. Running this once is what makes `bun run tauri build` succeed — all of these are required bundle resources.

<details>
<summary>Running individual setup steps</summary>

| Command | What it does |
|---------|-------------|
| `bun run download:bible-data` | Download Bible translation source files |
| `bun run build:bible` | Build the SQLite database from source files |
| `bun run setup:lexicon` | Build the Hebrew/Greek lexicon database |
| `bun run export:model` | Export the int8-quantized bge-base-en-v1.5 ONNX embedding model |
| `bun run precompute:embeddings` | Precompute verse embeddings (Rust, release mode) |
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
│   ├── services/     Tauri/IPC gateways (the invoke/listen boundary)
│   ├── hooks/        React hooks
│   └── lib/          Themes, renderers, detection, keyboard, updater,
│                     import/export (pptx, pdf, .lum* bundles, backup)
├── src-tauri/        Rust workspace
│   ├── crates/
│   │   ├── audio         cpal capture, VAD, metering
│   │   ├── stt           Deepgram (WS + REST)
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
| Canvas & editing | Custom HTML5 canvas renderer (slides & themes), TipTap (verse editor) |
| Import / export | JSZip (`.pptx` import + `.lum*` bundles), jsPDF (PDF export) |
| Backend | Rust (workspace with 7 crates) |
| Speech-to-text | Deepgram (cloud) |
| Verse detection | Aho-Corasick + semantic embeddings (bge-base-en-v1.5 ONNX, int8-quantized) + FTS5 |
| Lyrics | LRCLIB + Genius search, OpenLyrics / OpenSong import |
| Bible database | SQLite + FTS5 |
| Broadcast | NDI 6 SDK via FFI |
| Remote control | OSC + HTTP (Axum) |
| Updates | Tauri updater (signed GitHub releases) |
| Onboarding | react-joyride |
| Telemetry | Aptabase (anonymous, opt-out) |

## Support

Found a bug or have a feature request? [Open an issue](../../issues). For anything else, email [hello@lumenlive.xyz](mailto:hello@lumenlive.xyz) or follow us on social media.

## Security

See [SECURITY.md](.github/SECURITY.md) for the CSP policy and how to report vulnerabilities.

## License

[PolyForm Noncommercial License 1.0.0](LICENSE)
