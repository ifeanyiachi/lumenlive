import { toast } from "sonner"
import { can } from "@/stores/entitlements-store"

/** Known capabilities are free; unknown capabilities fail without a login prompt. */
export function requireFeature(
  key: string,
  featureName: string,
  onActivated?: () => void
): boolean {
  void onActivated
  if (can(key)) return true
  toast(`${featureName} is unavailable`)
  return false
}
