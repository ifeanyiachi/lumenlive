export const INTERFACE_SCALES = [80, 90, 100, 110, 125, 150, 200] as const
export type InterfaceDensity = "compact" | "standard" | "comfortable"

export function normalizeInterfaceScale(value: unknown): number {
  return typeof value === "number" &&
    INTERFACE_SCALES.some((scale) => scale === value)
    ? value
    : 100
}

export function isInterfaceDensity(value: unknown): value is InterfaceDensity {
  return value === "compact" || value === "standard" || value === "comfortable"
}

export function stepInterfaceScale(value: number, direction: -1 | 1): number {
  const index = INTERFACE_SCALES.findIndex(
    (scale) => scale === normalizeInterfaceScale(value)
  )
  return INTERFACE_SCALES[
    Math.max(0, Math.min(INTERFACE_SCALES.length - 1, index + direction))
  ]
}
