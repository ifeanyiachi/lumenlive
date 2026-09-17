# Bible Translations — Store Catalog Expansion

Plan + phased implementation for adding the full set of open-licensed Bible
translations from `nativelangauge.txt` to the in-app resource store so users can
download them for later offline use.

Source of truth for the catalog: `nativelangauge.txt` (helloao API ids +
licenses). Entries tagged `[DEFERRED-RTL]` there are **out of scope**.

---

## 1. Goal

Grow the store's Bible catalog from **1 hosted translation (KJV)** to **~59
translations across ~20 languages**, each downloadable and installable in one
click, attaching onto the Bible connection exactly like the bundled KJV.

This is **content ingestion + a hosting-policy flip**, not new plumbing — the
download/verify/decompress/attach machinery and the Store UI already exist and
work for any manifest entry.

---

## 2. Decisions (locked)

| Decision | Choice |
| --- | --- |
| Which translations | **Everything** in `nativelangauge.txt` except the 6 RTL entries and the already-bundled KJV → ~59 hosted |
| CC-licensed ([OK]) entries | **Include** — BY, BY-SA, **and BY-ND**. We store verbatim text (no modification), so BY-ND is satisfied. Attribution is surfaced in the UI. |
| Deuterocanon / LXX books | **Include.** Canonical 66 keep book numbers 1–66; deuterocanon/LXX books get stable numbers **≥ 67** (reachable within that translation; they don't participate in cross-translation nav). |
| RTL (Arabic, Hebrew) | **Out of scope.** 2 languages / 6 entries excluded until RTL layout support lands. Tagged `[DEFERRED-RTL]` in the txt file. |
| Rendering (CJK/Greek/Cyrillic fonts) | See §7 Risks — download works regardless; display glyph coverage is a separate verification. |

### Out-of-scope entries (excluded)
- `arb_vdv` (Arabic) — RTL
- `hbo_wlc`, `heb_lbm`, `heb_wlc`, `heb_mod`, `heb_scg` (Hebrew) — RTL
- `eng_kjv` — already bundled in the app; never re-hosted

---

## 3. Current architecture (what we build on)

```
data/ (Bun build tooling, not app-compiled)
  download-sources.ts          → scrollmapper JSON sources (KJV, SpaRV, …)
  ingest-xml-translations.ts   → XML → standalone DB → temp-bible/ + index.json
  build-store-upload.ts        → packages temp-bible/ → store-upload/bible-translations/
                                 (manifest.json + <slug>.db.zst)  ← LIVE pipeline
  build-store-manifest.ts      → legacy (/store/ prefix; superseded by upload script)

R2 bucket root (pub-82480c48…r2.dev)
  /bible-translations/manifest.json
  /bible-translations/<slug>.db.zst

src-tauri/src/commands/resource_store.rs
  store_fetch_manifest / store_install_bible / store_remove_bible / store_list_installed
  — streams download, SHA-256 verify, zstd-decompress, ATTACH under global id ≥ 1000,
    registry in installed-translations.json (re-attached at startup). GENERIC over
    manifest entries — no per-translation code. ALLOWED_HOSTS already = the R2 bucket.

src/lib/resource-store/     manifest.ts (parse/validate), bible-display.ts, diff.ts, …
src/services/resource-store-gateway.ts   invoke/listen boundary
src/stores/resource-store.ts             orchestration
src/components/store/…                    Store tab UI (cards, progress, import)
```

### Standalone DB schema (must not change — the attach layer reads it)
`translations` / `books` / `verses` (+ two indexes). Routed queries select fixed
columns with `translation_id = 1` (local id in a standalone DB). A downloaded DB
must produce byte-identical routing to the bundled DB. See
`crates/bible/src/db.rs` + `build-store-manifest.ts`'s `STANDALONE_SCHEMA`.

### Manifest resource shape (per entry)
`{ kind:"bible", id, title, abbreviation, language, license:{name,copyrighted,distribution,attribution?}, schemaVersion, url, sha256, bytes }`
`types/resource-store.ts` + `lib/resource-store/manifest.ts` already parse
`attribution`; unknown `language`/`abbreviation` values degrade gracefully.

---

## 4. Source format — bible.helloao.org

- `GET /api/available_translations.json` → per-translation metadata: `id`,
  `name`, `shortName`, `englishName`, `language`, `languageName`,
  `languageEnglishName`, `textDirection` (`ltr`/`rtl`), `numberOfBooks`,
  `sha256`, links.
- `GET /api/<id>/complete.json` → full text. Shape:
  ```
  { translation:{…}, books:[ { id:"GEN", name, commonName, order,
      chapters:[ { number, content:[ … ], footnotes:[…] } ] } ] }
  ```
  Chapter `content` is a mixed array; **verse** items are
  `{ type:"verse", number, content:[ … ] }` where inner `content` mixes plain
  **strings** with objects (`{noteId}` footnote refs, `{lineBreak:true}`,
  `{poem:…}` markers). Non-verse content items (headings, line breaks) are
  ignored for our flat verse text.

Book ids are **USFM codes** (`GEN`, `EXO`, … `REV`, plus deuterocanon/LXX:
`TOB`, `JDT`, `WIS`, `SIR`, `BAR`, `1MA`, `2MA`, `MAN`, `1ES`, `2ES`, `LJE`,
`S3Y`, `SUS`, `BEL`, `ODA`, `PS2`, `EZA`, `5EZ`, `6EZ`, `PSS`, etc.).

---

## 5. Book-number mapping (canonical + deuterocanon/LXX)

A single pure table `USFM_BOOKS: Record<usfmId, {number, name, abbreviation, testament}>`:

- **1–66**: standard Protestant order (`GEN`=1 … `REV`=66), `testament` `OT`
  (≤39) / `NT` (≥40) — matches the bundled KJV so canonical books route across
  translations.
- **≥ 67**: deuterocanon / LXX books in a fixed, documented order, `testament`
  `"DC"` (a new tag, allowed by the `TEXT` column). These are reachable only
  within a translation that contains them; cross-translation nav simply won't
  target a book the active translation lacks.
- **Unknown USFM id** → **skip that book + log a warning** (never crash; keeps a
  stray/renamed book from failing the whole build).

The map lives in one place in the new script (self-contained, unit-tested).
`book_number` (not the source name) is authoritative, so book names/abbrevs stay
consistent regardless of source spelling — same rule as `ingest-xml-translations.ts`.

---

## 6. Phased implementation

Each phase ends green on the gate: `npm run typecheck && npm run lint && npm test`.
The **network fetch + R2 upload are operator steps** (they need internet + R2
credentials); the code/pipeline is what we build and verify locally.

### Phase 1 — Fetch/convert pipeline (the core new piece)
**New:** `data/fetch-helloao-translations.ts` (Bun) + `data/helloao/` helpers.

1. `CATALOG` array: the ~59 in-scope entries, each
   `{ helloaoId, slug, abbreviation, title, language, languageName, licenseName, attribution, distribution:"bundled-free" }`.
   Slugs are stable (manifest id + file stem + R2 key). Skips `eng_kjv`; dedups by slug.
2. `flattenVerseContent(content): string` — **pure**, concatenates string items,
   turns `{lineBreak}` into a space, drops `{noteId}`/`{poem}` objects, collapses
   whitespace. → colocated test with the tricky cases (footnote mid-verse, poem
   line breaks, string-only).
3. `USFM_BOOKS` map (§5) + `mapBook(usfmId)` — pure, tested (canonical hit,
   deuterocanon ≥67, unknown → skip).
4. For each catalog entry: fetch `complete.json`, build the standalone SQLite DB
   with the frozen schema, insert translation/books/verses, `VACUUM`.
5. Verify John 3:16 routes (`translation_id=1`) — fail the entry loudly if not.
6. zstd-compress (level 19) → `temp-bible/<slug>.db.zst`; record
   `{slug, abbreviation, title, language, copyrighted:false, books, verses,
   dbBytes, zstBytes, sha256, licenseName, attribution}` into
   `temp-bible/index.json` (merge — keep existing entries).
7. Politeness: sequential fetches, retry-with-backoff, resumable (skip a slug
   whose `.db.zst` + matching index entry already exist).

**Verify:** dry-run on 2–3 translations (e.g. `BSB`, `spa_r09`, `lat_clv` to
exercise deuterocanon) — confirm verse counts, John 3:16, and a deuterocanon
book (e.g. Sirach) landing at a ≥67 number. Unit tests green.

### Phase 2 — Flip the hosting policy in the packager
**Edit:** `data/build-store-upload.ts`.

1. Replace `HOSTED_SLUGS = new Set(["kjv"])` with "host every entry in
   `index.json` where `copyrighted === false`" (all our entries qualify).
2. Extend `LICENSE_NAME` handling → read `licenseName` + `attribution` straight
   from the index entry; add `attribution` to `ManifestResource.license` when
   present.
3. Keep the sha256/size re-verification against `index.json` and the unique-id /
   complete-descriptor guards.

**Verify:** run `bun run data/build-store-upload.ts` against the Phase-1
`temp-bible/`; confirm `store-upload/bible-translations/manifest.json` lists all
hosted entries with url/sha256/bytes + attribution, and one `.db.zst` per entry.

### Phase 3 — Frontend display (pure lib + small UI)
**Edit:** `src/lib/resource-store/bible-display.ts` — expand `languageLabel()`
to every in-scope language code (es, fr, de, it, nl, ru, zh, ko, sw, hi, ha, pl,
ro, la, yo, ig, el/grc, …). Update the colocated `bible-display.test.ts`.

**Edit:** `src/components/store/bible-store-card.tsx` — render a small
attribution line when `resource.license.attribution` is set (additive; memo/perf
rules preserved — plain-data prop only).

No changes to Rust, types, gateway, or the manifest parser (already handle
`attribution` + arbitrary languages).

**Verify:** gate green; card shows language names + attribution; unknown
abbreviations still fall back to a badge color.

### Phase 4 — Publish + smoke test (operator)
1. `bun run data/fetch-helloao-translations.ts` (full run).
2. `bun run data/build:store-upload`.
3. Upload `data/store-upload/bible-translations/` to the R2 bucket root
   (manifest.json + all `<slug>.db.zst`).
4. In-app: open Store → Bible Versions → confirm the catalog lists the new
   translations, install a few (incl. one deuterocanon-bearing, one CJK, Greek),
   switch to them, remove one. Confirm survives restart (re-attach).

---

## 7. Risks / notes

- **Versification differences** (Vulgate/LXX Psalm numbering, verse splits) mean
  a chapter/verse may not line up 1:1 across translations. Inherent to the data;
  acceptable — each translation is internally correct. Canonical 66 books keep
  standard numbers so common references still route.
- **Non-Latin display fonts.** Download/attach/search work for any script, but
  the slide/broadcast **canvas renderer must have glyph coverage** for Chinese,
  Korean, Cyrillic, and Greek to display them. Verify in Phase 4; if a script
  renders as tofu, adding a font fallback is a follow-up (separate from this
  task). RTL (Arabic/Hebrew) already deferred.
- **Attach id space / count.** ~59 attached DBs under global ids ≥ 1000 — well
  within SQLite ATTACH limits and the registry design; each is a separate file,
  only downloaded ones attach.
- **Hosted size.** ~59 × ~0.5–4 MB compressed ≈ 100–200 MB on R2. Fine.
- **`.md` policy.** This file is planning scratch — keep untracked; do not commit.
- **Deuterocanon `testament` tag.** Introduces `"DC"` alongside `OT`/`NT`. The
  column is free `TEXT`; confirm no consumer switches exhaustively on
  `OT`/`NT` in a way that breaks on `DC` (grep `crates/bible` during Phase 1).

---

## 8. Definition of done

- [ ] `fetch-helloao-translations.ts` builds all ~59 DBs; unit tests
      (`flattenVerseContent`, `mapBook`) green.
- [ ] `build-store-upload.ts` emits a manifest with all hosted entries +
      attribution; sha/size verified.
- [ ] `languageLabel` covers every in-scope language (test updated); card shows
      attribution.
- [ ] `npm run typecheck && npm run lint && npm test` all clean.
- [ ] Artifacts uploaded to R2; in-app install/switch/remove/restart verified for
      a representative sample.
