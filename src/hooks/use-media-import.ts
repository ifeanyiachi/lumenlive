import { useRef } from "react"
import { useMediaStore } from "@/stores/media-store"
import {
  ALL_EXTENSIONS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
  isTauri,
  pathsToAssets,
  filesToAssets,
} from "@/lib/media-import"
import type { MediaAsset } from "@/types/media"

/** `<input accept=…>`-friendly list of every supported media extension. */
export const MEDIA_ACCEPT = ALL_EXTENSIONS.map((e) => `.${e}`).join(",")

const PROGRESS_THRESHOLD = 3

/** Show progress only for larger batches; wraps `onProgress` from media-import. */
function progressReporter(total: number) {
  const show = total >= PROGRESS_THRESHOLD
  if (show) useMediaStore.getState().setImportProgress({ current: 0, total })
  return {
    onProgress: show
      ? (current: number) =>
          useMediaStore.getState().setImportProgress({ current, total })
      : undefined,
    done: () => useMediaStore.getState().setImportProgress(null),
  }
}

async function importViaTauri(): Promise<MediaAsset[]> {
  const { open } = await import("@tauri-apps/plugin-dialog")
  const paths = await open({
    multiple: true,
    filters: [
      {
        name: "Media",
        extensions: [
          ...IMAGE_EXTENSIONS,
          ...VIDEO_EXTENSIONS,
          ...AUDIO_EXTENSIONS,
        ],
      },
    ],
  })
  if (!paths || paths.length === 0) return []

  const { onProgress, done } = progressReporter(paths.length)
  try {
    return await pathsToAssets(paths, onProgress)
  } finally {
    done()
  }
}

async function importViaWeb(files: FileList): Promise<MediaAsset[]> {
  const { onProgress, done } = progressReporter(files.length)
  try {
    return await filesToAssets(files, onProgress)
  } finally {
    done()
  }
}

/**
 * Shared media-import orchestration for any "add media" affordance (the Media
 * view's import button, the quick-add panel's media tab, …). Owns the platform
 * split — native file dialog under Tauri, a hidden `<input type=file>` in the
 * browser — plus progress reporting and store insertion, so callers only render
 * a trigger.
 *
 * `onImported` receives the freshly-imported assets after they're added to the
 * media store, letting a caller do something extra with them (e.g. drop them
 * straight onto the schedule).
 */
export function useMediaImport(onImported?: (assets: MediaAsset[]) => void) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isImporting = useMediaStore((s) => s.importProgress !== null)

  const commit = (assets: MediaAsset[]) => {
    if (assets.length === 0) return
    useMediaStore.getState().addAssets(assets)
    useMediaStore.getState().setSelectedAsset(assets[0].id)
    onImported?.(assets)
  }

  const startImport = async () => {
    if (isImporting) return
    if (isTauri) {
      commit(await importViaTauri())
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    commit(await importViaWeb(files))
    e.target.value = ""
  }

  return {
    /** Ref for the browser-only hidden file input (render it via `fileInput`). */
    fileInputRef,
    /** True while an import is in flight. */
    isImporting,
    /** Open the native dialog (Tauri) or the hidden input (web). */
    startImport,
    /** onChange handler for the hidden web input. */
    handleFileChange,
    /** Whether the hidden web input needs rendering. */
    needsFileInput: !isTauri,
  }
}
