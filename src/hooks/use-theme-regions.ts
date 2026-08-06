import { useMemo, useCallback } from "react"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { anchorPosition } from "@/lib/verse-renderer"

const WS_WIDTH = 1920
const WS_HEIGHT = 1080

export interface ThemeRegionRect {
  x: number
  y: number
  width: number
  height: number
}

export function useThemeRegions() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const updateDraftNested = useBroadcastStore((s) => s.updateDraftNested)

  const textAreaPct = useMemo<ThemeRegionRect | null>(() => {
    if (!draftTheme) return null
    const layout = draftTheme.layout
    const bgWpx = (layout.backgroundWidth / 100) * WS_WIDTH
    const bgHpx = (layout.backgroundHeight / 100) * WS_HEIGHT
    const pos = anchorPosition(
      layout.anchor,
      bgWpx,
      bgHpx,
      WS_WIDTH,
      WS_HEIGHT,
      layout.offsetX,
      layout.offsetY
    )
    return {
      x: (pos.x / WS_WIDTH) * 100,
      y: (pos.y / WS_HEIGHT) * 100,
      width: layout.backgroundWidth,
      height: layout.backgroundHeight,
    }
  }, [draftTheme])

  const setTextAreaOffset = useCallback(
    (offsetX: number, offsetY: number) => {
      updateDraftNested("layout.offsetX", offsetX)
      updateDraftNested("layout.offsetY", offsetY)
    },
    [updateDraftNested]
  )

  const setTextAreaSize = useCallback(
    (width: number, height: number) => {
      updateDraftNested(
        "layout.backgroundWidth",
        Math.max(10, Math.min(100, width))
      )
      updateDraftNested(
        "layout.backgroundHeight",
        Math.max(10, Math.min(100, height))
      )
    },
    [updateDraftNested]
  )

  return { textAreaPct, setTextAreaOffset, setTextAreaSize }
}
