# applocale.md — UI Localization (i18n) Implementation Plan

Phased plan to make LumenLive's **operator interface** available in French,
Spanish, and Portuguese (English is the source locale). Scratch/planning file —
keep untracked, do not commit.

## Scope & framing

Two independent axes exist. **This plan covers only #1.**

1. **UI chrome** — every operator-facing button, label, menu, settings
   description, toast, tooltip. Currently 100% hardcoded English across ~202
   `.tsx` files (~200+ literal strings). **Greenfield — no i18n today.**
2. **Scripture/content language** (audience screen) — already handled by
   `services/translation-gateway.ts` + `groupTranslations()` + per-language
   `TranslationInfo` + active-translation setting. `nativelangauge.txt` is the
   catalog-expansion backlog for that axis. **Out of scope here.**

A French *operator* wants French menus (#1); a French *congregation* wants a
French Bible on screen (#2). Decoupled.

## Guiding principles

- **Build on `main`, incrementally, behind a flag — no long-lived branch.**
  A branch touching ~200 files while shipping other features to `main` in
  parallel means constant merge conflicts. Instead exploit the fact that
  **string extraction is behavior-preserving**: `"Save"` → `t("common.save")`
  with `common.save: "Save"` renders byte-identical. Every extraction chunk is
  safe to ship silently.
- **Gate only the visible surface** — the language switcher UI and the
  fr/es/pt catalogs — behind a flag. Until flipped, the app is English for
  everyone, exactly as today.
- **Respect CLAUDE.md layering**: pure config in `lib/`, no `invoke`/`listen`
  added outside a gateway, narrow store selectors, persisted setting follows
  the existing `PERSISTED_KEYS` pattern.
- **Gate every phase**: `npm run typecheck && npm run lint && npm test` clean,
  reported honestly.

## Stack decision

- **`i18next` + `react-i18next`** (add as deps). JSON catalogs, real
  pluralization + interpolation, namespace lazy-loading, clean React 19 / Vite
  fit. Language switch = one re-render (catalogs static per session), so it does
  not touch the RAF/editor/re-render hot paths.
- **Catalog layout**: `src/locales/{en,fr,es,pt}/<namespace>.json`, namespaced
  by domain to mirror component grouping: `common`, `settings`, `schedule`,
  `broadcast`, `media`, `slides`, `bible`, `panels`, `song`.
- **Flag**: `VITE_I18N_UI` env var (build-time) gating the switcher + non-English
  locales. English extraction ships regardless.

---

## Phase 0 — Infra + proof-of-loop (start here; reviewable slice)

Goal: end-to-end plumbing proven on **one section** before going wide.

1. `npm i i18next react-i18next`.
2. `src/lib/i18n/config.ts` (pure, no React): create the i18n instance,
   register `en` resources, `fallbackLng: "en"`, `defaultNS: "common"`,
   `returnNull: false`. Export `SUPPORTED_LOCALES` (`en`, `fr`, `es`, `pt`
   with display names) and an `isI18nUiEnabled()` reading `VITE_I18N_UI`.
3. `src/locales/en/common.json` + `src/locales/en/settings.json` (seeded from
   the section extracted in step 6).
4. Mount `<I18nextProvider>` (or `i18n.use(initReactI18next)`) — initialize in
   `src/lib/i18n/config.ts` and import once from `src/main.tsx` before
   `createRoot`, so the instance exists at first paint. No React tree wrapper
   strictly needed with `initReactI18next`, but wrap `<App/>` for clarity.
5. `settings-store.ts`: add `uiLanguage: SupportedLocale` (default `"en"`),
   `setUiLanguage`, add to `PERSISTED_KEYS`. In `hydrateSettings()` mirror the
   persisted value via `i18n.changeLanguage(...)` (same shape as the existing
   `setAnalyticsEnabled` mirror), and mirror again in the subscribe block on
   change. Keep state serializable (store the locale string).
6. **Extract `display-mode-section.tsx`** (self-contained, good pilot) to
   `t("settings.display.*")`. Prove `useTranslation("settings")` usage +
   interpolation (e.g. the `${thresholdPercent}%` value label).
7. **Gated Language settings section**: new `sections/language-section.tsx`
   (mirrors `display-mode-section.tsx`), registered in
   `settings-sections.tsx` `SETTINGS_SECTIONS` with a new `id: "language"`,
   `LanguagesIcon`. Wrap its registry entry so it only appears when
   `isI18nUiEnabled()`. Renders a locale `<Select>` bound to
   `uiLanguage`/`setUiLanguage`.
8. Gate check. **Review pause** — confirm the pattern before Phase 1.

Deliverable: language switching works for the Display Mode section; hidden
behind the flag; English identical when flag off.

## Phase 1 — Full English extraction (domain-by-domain, ships silently)

Route every remaining hardcoded string through `t()` into the `en` catalog.
Behavior-preserving, so each domain lands on `main` independently and safely.

Suggested order (roughly high-traffic → low):

- [ ] `common` — shared verbs/labels (Save, Cancel, Delete, Add, Close, Search…)
      and toast/error phrases. Build this dictionary first; reuse everywhere.
- [ ] `settings/**` — remaining 10 sections + `settings-sections.tsx`
      `name`/`title` (make these `t()`-derived at render, not static array
      literals).
- [ ] `schedule/**`
- [ ] `panels/**` (transcript, preview, live-output)
- [ ] `broadcast/**` + `broadcast-output/**`
- [ ] `slides/**` (editor, theme properties)
- [ ] `media/**`
- [ ] `song/**`, `store/**`, `tutorial/**`, `alerts`, `countdown`, keyboard
      shortcuts overlay.

Per-domain rules:
- One namespace per domain; keys are dotted + semantic
  (`schedule.item.duplicate`), not English-derived.
- Interpolation for dynamic bits: `t("bible.available", { count })` — use
  i18next plural forms, not string concatenation.
- `useTranslation(ns)` in components; for the rare string needed in
  `lib/`/store logic, pass the already-translated string down or use
  `i18n.t` from the config module (still no React in `lib/`).
- Keep `aria-label`/`title`/`placeholder` localized too.

Testing: extraction is UI-only and behavior-preserving. Add a **catalog
completeness test** in `src/lib/i18n/i18n.test.ts` — every key present in `en`
must exist in `fr`/`es`/`pt` (and vice versa), catching drift. Per CLAUDE.md,
pure-UI re-render changes may lean on the existing suite; state that explicitly
in each PR/commit.

## Phase 2 — Translations (fr / es / pt)

- [ ] Draft `fr`, `es`, `pt` catalogs from the completed `en` set. I draft the
      values; **flag for native-speaker review** of church-specific terminology
      (e.g. "slide", "cue", "verse", "broadcast", "stage") before the flag flips.
- [ ] Fill i18next plural categories per language.
- [ ] Completeness test (Phase 1) must be green across all four locales.
- [ ] Spot-check long-string layout: French/Spanish/Portuguese run ~15–30% longer
      than English — verify buttons/labels/nav don't clip or wrap badly
      (settings sidebar, toolbar buttons, toggle-card titles are the risk spots).

## Phase 3 — Formatting, edge cases, launch

- [ ] Locale-aware number/date/duration formatting via `Intl.*` (timers,
      counts, CCLI dates). Route through small helpers in `src/lib/i18n/`.
- [ ] OS-locale default: on first run, seed `uiLanguage` from
      `navigator.language` when it matches a supported locale (else `en`).
- [ ] Decide switcher placement beyond settings (optional onboarding step).
- [ ] **Flip `VITE_I18N_UI` on**, ship. RTL (Arabic/Hebrew UI) explicitly out of
      scope — only relevant if the UI language list ever grows to an RTL locale;
      the fr/es/pt set is all LTR.

---

## Files touched (map)

| Area | Change |
|---|---|
| `package.json` | add `i18next`, `react-i18next` |
| `src/lib/i18n/config.ts` | **new** — pure instance + `SUPPORTED_LOCALES` + flag helper |
| `src/lib/i18n/format.ts` | **new** (Phase 3) — Intl helpers |
| `src/lib/i18n/i18n.test.ts` | **new** — catalog completeness parity test |
| `src/locales/{en,fr,es,pt}/*.json` | **new** — namespaced catalogs |
| `src/main.tsx` | import i18n config before mount; keep hydration mirror |
| `src/stores/settings-store.ts` | `uiLanguage` + setter + `PERSISTED_KEYS` + `changeLanguage` mirror |
| `src/components/settings/settings-sections.tsx` | gated `language` section entry; `name`/`title` via `t()` |
| `src/components/settings/sections/language-section.tsx` | **new** — locale picker |
| `src/components/**` | incremental `t()` extraction (Phase 1) |

## Non-goals / explicitly deferred

- Scripture/audience content language (already exists; separate axis).
- Bible catalog expansion (`nativelangauge.txt`).
- RTL layout support.
- Localizing Rust/backend log strings (operator-invisible).

## Open questions to confirm before Phase 2

- Exact display names/order in the locale picker.
- Whether the switcher should also live outside Settings (e.g. onboarding).
- Native reviewer for fr/es/pt church terminology before launch.
