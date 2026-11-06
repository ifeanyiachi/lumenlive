/**
 * Store-facing orchestration for theme bundles — the glue tier that reads the
 * media / theme / broadcast stores to build a `.lumtheme` bundle, and writes
 * those stores back when importing one. Kept out of {@link ./bundle} (a pure,
 * testable data boundary) and out of the components (which just call these
 * functions and show a toast). Mirrors `@/lib/schedule-bundle/io`.
 */

import type { Theme } from "@/types/theme"
import type { StageLayout } from "@/types/stage-layout"
import { useThemesStore } from "@/stores/themes"
import { useMediaStore } from "@/stores/media-store"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { saveBundle, readBundle } from "@/services/bundle-gateway"
import { i18n } from "@/lib/i18n/config"
import {
  buildThemeBundle,
  parseThemeBundle,
  ThemeBundleParseError,
  THEME_BUNDLE_EXTENSION,
  type ThemeBundleItem,
} from "./bundle"

/** Save dialog: always write the branded extension. */
function saveFilters() {
  return [
    {
      name: i18n.t("broadcast:dialog.themeFile"),
      extensions: [THEME_BUNDLE_EXTENSION],
    },
  ]
}

/**
 * Open dialog: accept the file whatever extension a transfer left it with. A
 * bundle's bytes are a zip, so transfers routinely rename `.lumtheme` to `.zip`
 * (or strip the extension). The Rust reader detects the real format from the
 * file's *content*, so the picker must not hide those renamed files.
 */
function openFilters() {
  return [
    {
      name: i18n.t("broadcast:dialog.themeFile"),
      extensions: [THEME_BUNDLE_EXTENSION, "zip", "json"],
    },
    { name: i18n.t("broadcast:dialog.allFiles"), extensions: ["*"] },
  ]
}

/** Outcome of an export attempt. */
export interface ExportResult {
  /** True when a file was written (false = user cancelled or no Tauri). */
  saved: boolean
  /** Count of referenced media whose source file couldn't be found and packaged. */
  missingMedia: number
}

/** Keep a proposed filename tidy; the picker still lets the user rename it. */
function bundleFileName(name: string): string {
  const base = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${base || "theme"}.${THEME_BUNDLE_EXTENSION}`
}

async function exportItem(item: ThemeBundleItem): Promise<ExportResult> {
  const { manifest, mediaFiles, missingMedia } = buildThemeBundle(
    item,
    { mediaAssets: useMediaStore.getState().assets },
    Date.now()
  )
  const name = item.kind === "theme" ? item.theme.name : item.stageLayout.name
  const path = await saveBundle(
    bundleFileName(name),
    JSON.stringify(manifest),
    mediaFiles,
    saveFilters()
  )
  return { saved: path != null, missingMedia }
}

/** Package a design theme + its media into a `.lumtheme` bundle and save it. */
export function exportTheme(theme: Theme): Promise<ExportResult> {
  return exportItem({ kind: "theme", theme })
}

/** Package a stage layout + its media into a `.lumtheme` bundle and save it. */
export function exportStageLayout(layout: StageLayout): Promise<ExportResult> {
  return exportItem({ kind: "stage-layout", stageLayout: layout })
}

/** Outcome of an import attempt (null = user cancelled or no Tauri). */
export interface ImportResult {
  kind: ThemeBundleItem["kind"]
  /** The imported item's name, for the confirmation toast. */
  name: string
  /** The imported item's new id, so the caller can focus/open it. */
  id: string
}

/**
 * Prompt for a `.lumtheme` file, read it, register any packaged media into the
 * media store with fresh ids, and insert the theme or stage layout (also
 * re-keyed). Returns the imported item's kind/name/id, or null if cancelled.
 * Throws {@link ThemeBundleParseError} on an unreadable file.
 */
export async function importThemeBundle(): Promise<ImportResult | null> {
  const file = await readBundle(
    i18n.t("broadcast:dialog.importTheme"),
    openFilters()
  )
  if (!file) return null

  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(file.manifestJson)
  } catch {
    throw new ThemeBundleParseError("This bundle's manifest is corrupt.")
  }

  const parsed = parseThemeBundle(rawManifest, file.media, {
    newId: () => crypto.randomUUID(),
    now: Date.now(),
    toAssetUrl: safeFileSrc,
  })

  // Register packaged media before the item so its references resolve.
  if (parsed.mediaAssets.length > 0) {
    useMediaStore.getState().addAssets(parsed.mediaAssets)
  }

  if (parsed.kind === "stage-layout" && parsed.stageLayout) {
    useBroadcastStore.getState().saveStageLayout(parsed.stageLayout)
    return {
      kind: "stage-layout",
      name: parsed.stageLayout.name,
      id: parsed.stageLayout.id,
    }
  }

  if (parsed.theme) {
    useThemesStore.getState().upsertTheme(parsed.theme)
    return { kind: "theme", name: parsed.theme.name, id: parsed.theme.id }
  }

  return null
}
