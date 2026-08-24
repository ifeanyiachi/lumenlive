/**
 * Bundle I/O gateway — the shared Tauri boundary for reading and writing
 * self-contained content bundles (a `manifest.json` + streamed `media/…` bytes
 * in a zip).
 *
 * Every bundle format in the app rides on the same two Rust commands
 * (`write_bundle` / `read_bundle`): schedule bundles (`.lumsched`), single
 * theme / stage-layout bundles (`.lumtheme`), and the full-library backup
 * (`.lumbackup`). This gateway owns those command names and the save/open
 * dialogs; the per-format modules (`@/lib/schedule-bundle`, `@/lib/theme-bundle`,
 * `@/lib/backup`) build/parse the manifest and never touch `@tauri-apps`
 * directly. Imports are dynamic so the module is safe to load in the browser /
 * tests, where the plugins are absent.
 */

import type { BundleMediaFile, ExtractedMedia } from "@/types/bundle"

export type { BundleMediaFile, ExtractedMedia }

/** A dialog file-type filter (`{ name, extensions }`). */
export interface DialogFilter {
  name: string
  extensions: string[]
}

/** A bundle read off disk by {@link readBundle}. */
export interface ReadBundleResult {
  /** Basename including extension, e.g. "themes.lumtheme". */
  name: string
  /** True when the file was a legacy plain-JSON export (no packaged media). */
  legacy: boolean
  /** The bundle's manifest text, or (legacy) the whole file text. */
  manifestJson: string
  /** Media extracted into the managed library (empty for a legacy file). */
  media: ExtractedMedia[]
}

/** Lazy-load the dialog + core plugins; null when unavailable (browser/tests). */
async function tauri() {
  try {
    const [dialog, core] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/api/core"),
    ])
    return { dialog, core }
  } catch {
    return null
  }
}

/**
 * Prompt for a save location (pre-filled with `defaultName`) and write a bundle
 * there via the Rust `write_bundle` command, which streams the media bytes
 * straight into the archive. Returns the saved path, or null if the user cancels
 * or the plugins are unavailable. A write failure (disk full, permission)
 * rejects so the caller can report it.
 */
export async function saveBundle(
  defaultName: string,
  manifestJson: string,
  mediaFiles: BundleMediaFile[],
  filters: DialogFilter[]
): Promise<string | null> {
  const t = await tauri()
  if (!t) return null
  const path = await t.dialog.save({ defaultPath: defaultName, filters })
  if (!path) return null
  await t.core.invoke("write_bundle", {
    destPath: path,
    manifestJson,
    media: mediaFiles,
  })
  return path
}

/**
 * Open the picker and read the chosen bundle through the Rust `read_bundle`
 * command, which auto-detects a zip bundle vs a legacy plain-JSON export
 * (unpacking bundle media into the managed library). Returns null when the user
 * cancels or the plugins are unavailable. Parsing/validation is the caller's job.
 */
export async function readBundle(
  title: string,
  filters: DialogFilter[]
): Promise<ReadBundleResult | null> {
  const t = await tauri()
  if (!t) return null
  const selected = await t.dialog.open({ multiple: false, title, filters })
  if (selected == null || Array.isArray(selected)) return null
  const path = String(selected)
  const result = await t.core.invoke<{
    manifestJson: string
    media: ExtractedMedia[]
    legacy: boolean
  }>("read_bundle", { bundlePath: path })
  return { name: path.split(/[\\/]/).pop() ?? "bundle", ...result }
}
