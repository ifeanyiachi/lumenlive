import { useEffect, useState } from "react"

import {
  resolveMediaLibraryPath,
  revealMediaLibraryFolder,
} from "@/services/media-library-gateway"

/**
 * Resolves the on-disk media library folder (guarded against a late resolve
 * after unmount) and exposes an action to reveal it in the OS file manager.
 * `libraryPath` is null until resolved, or if resolution yields no directory.
 */
export function useMediaLibraryPath() {
  const [libraryPath, setLibraryPath] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      const dir = await resolveMediaLibraryPath()
      if (!cancelled && dir) setLibraryPath(dir)
    }
    resolve()
    return () => {
      cancelled = true
    }
  }, [])

  const openFolder = async () => {
    if (!libraryPath) return
    await revealMediaLibraryFolder(libraryPath)
  }

  return { libraryPath, openFolder }
}
