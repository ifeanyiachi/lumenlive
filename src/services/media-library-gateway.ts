/**
 * Gateway for the managed media-library folder: resolving its path and revealing
 * it in the OS file browser. Uses lazy imports so the Media Library settings
 * section works under plain browser dev (no Tauri) exactly as before — a failed
 * import simply means "no managed folder".
 */

/**
 * Resolve the managed media-library directory, or `null` when not running under
 * Tauri (e.g. browser dev).
 */
export async function resolveMediaLibraryPath(): Promise<string | null> {
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path")
    return await join(await appDataDir(), "media-library")
  } catch {
    return null
  }
}

/** Reveal the given folder in the OS file browser. Silently no-ops on failure. */
export async function revealMediaLibraryFolder(path: string): Promise<void> {
  try {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener")
    await revealItemInDir(path)
  } catch {
    // Folder may not exist yet (nothing copied) or opener unavailable.
  }
}
