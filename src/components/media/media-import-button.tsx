import { useRef } from "react"
import { PlusIcon, LoaderIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
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

const ACCEPT = ALL_EXTENSIONS.map((e) => `.${e}`).join(",")

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

export function MediaImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importProgress = useMediaStore((s) => s.importProgress)
  const isImporting = importProgress !== null

  const handleImport = async () => {
    if (isImporting) return
    if (isTauri) {
      const assets = await importViaTauri()
      if (assets.length > 0) {
        useMediaStore.getState().addAssets(assets)
        useMediaStore.getState().setSelectedAsset(assets[0].id)
      }
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const assets = await importViaWeb(files)
    if (assets.length > 0) {
      useMediaStore.getState().addAssets(assets)
      useMediaStore.getState().setSelectedAsset(assets[0].id)
    }
    e.target.value = ""
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleImport}
        disabled={isImporting}
      >
        {isImporting ? (
          <LoaderIcon className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <PlusIcon className="mr-1.5 size-3.5" />
        )}
        {isImporting ? "Importing..." : "Import"}
      </Button>
      {!isTauri && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={handleFileChange}
          className="hidden"
        />
      )}
    </>
  )
}
