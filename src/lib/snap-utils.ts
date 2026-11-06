export interface SnapElement {
  x: number
  y: number
  width: number
  height: number
  visible?: boolean
}

export interface SnapGuide {
  axis: "x" | "y"
  position: number
}

const DEFAULT_SNAP_THRESHOLD = 1.5

export function computeSnaps(
  el: { x: number; y: number; width: number; height: number },
  others: SnapElement[],
  dragMode: string | null,
  options?: { threshold?: number; bounds?: { width: number; height: number } }
): { snappedX: number | null; snappedY: number | null; guides: SnapGuide[] } {
  const threshold = options?.threshold ?? DEFAULT_SNAP_THRESHOLD
  const maxX = options?.bounds?.width ?? 100
  const maxY = options?.bounds?.height ?? 100
  const guides: SnapGuide[] = []
  let snappedX: number | null = null
  let snappedY: number | null = null

  const elCx = el.x + el.width / 2
  const elCy = el.y + el.height / 2
  const elRight = el.x + el.width
  const elBottom = el.y + el.height

  const xTargets: number[] = [0, maxX / 2, maxX]
  const yTargets: number[] = [0, maxY / 2, maxY]

  for (const other of others) {
    if (other.visible === false) continue
    xTargets.push(other.x, other.x + other.width / 2, other.x + other.width)
    yTargets.push(other.y, other.y + other.height / 2, other.y + other.height)
  }

  const isMove = dragMode === "move"

  const xEdges = isMove
    ? [
        { value: el.x, type: "left" as const },
        { value: elCx, type: "center" as const },
        { value: elRight, type: "right" as const },
      ]
    : [
        { value: el.x, type: "left" as const },
        { value: elRight, type: "right" as const },
      ]

  const yEdges = isMove
    ? [
        { value: el.y, type: "top" as const },
        { value: elCy, type: "center" as const },
        { value: elBottom, type: "bottom" as const },
      ]
    : [
        { value: el.y, type: "top" as const },
        { value: elBottom, type: "bottom" as const },
      ]

  let bestDx = threshold + 1
  let bestDy = threshold + 1

  for (const edge of xEdges) {
    for (const target of xTargets) {
      const d = Math.abs(edge.value - target)
      if (d < bestDx) {
        bestDx = d
        snappedX = target
        if (isMove) {
          if (edge.type === "left") snappedX = target
          else if (edge.type === "center") snappedX = target - el.width / 2
          else snappedX = target - el.width
        }
      }
    }
  }

  for (const edge of yEdges) {
    for (const target of yTargets) {
      const d = Math.abs(edge.value - target)
      if (d < bestDy) {
        bestDy = d
        snappedY = target
        if (isMove) {
          if (edge.type === "top") snappedY = target
          else if (edge.type === "center") snappedY = target - el.height / 2
          else snappedY = target - el.height
        }
      }
    }
  }

  if (bestDx > threshold) snappedX = null
  if (bestDy > threshold) snappedY = null

  if (snappedX !== null) {
    const finalLeft = snappedX
    const finalCx = finalLeft + el.width / 2
    const finalRight = finalLeft + el.width
    for (const target of xTargets) {
      if (
        Math.abs(finalLeft - target) < 0.1 ||
        Math.abs(finalCx - target) < 0.1 ||
        Math.abs(finalRight - target) < 0.1
      ) {
        guides.push({ axis: "x", position: target })
      }
    }
  }
  if (snappedY !== null) {
    const finalTop = snappedY
    const finalCy = finalTop + el.height / 2
    const finalBottom = finalTop + el.height
    for (const target of yTargets) {
      if (
        Math.abs(finalTop - target) < 0.1 ||
        Math.abs(finalCy - target) < 0.1 ||
        Math.abs(finalBottom - target) < 0.1
      ) {
        guides.push({ axis: "y", position: target })
      }
    }
  }

  return { snappedX, snappedY, guides }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
