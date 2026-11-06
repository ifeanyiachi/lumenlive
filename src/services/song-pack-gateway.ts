import { invoke } from "@tauri-apps/api/core"

/**
 * Gateway for community song-pack downloads. Owns the `song_fetch_pack` command
 * and its `song:pack-progress` event so the import UI never invokes them
 * directly. The download runs in Rust (host-allow-listed, redirect-guarded,
 * size-capped) and streams progress back; the raw ZIP bytes are unzipped and
 * imported by the pure `lib/song/import` layer — the sibling of
 * `song-search-gateway.ts`.
 */

/** Bytes-received progress for a pack download. `total` is 0 when unknown. */
export interface PackProgress {
  received: number
  total: number
}

/**
 * Download a community song pack from `url` — a GitHub repository URL, a
 * `.../tree/<branch>` URL, or a direct `.zip` link on a supported host. Rejects
 * with a human-readable message on an unsupported host or a failed download.
 * `onProgress` (optional) is called as bytes arrive; its listener is always torn
 * down before this resolves or rejects, so no handle leaks.
 */
export async function fetchSongPack(
  url: string,
  onProgress?: (p: PackProgress) => void
): Promise<Uint8Array> {
  let dispose: (() => void) | undefined
  if (onProgress) {
    const { listen } = await import("@tauri-apps/api/event")
    const unlisten = await listen<PackProgress>("song:pack-progress", (e) =>
      onProgress(e.payload)
    )
    dispose = unlisten
  }
  try {
    // The command returns raw bytes (tauri::ipc::Response) → an ArrayBuffer here.
    const buf = await invoke<ArrayBuffer>("song_fetch_pack", { url })
    return new Uint8Array(buf)
  } finally {
    dispose?.()
  }
}
