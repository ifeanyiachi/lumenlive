import { toast } from "sonner"

import { can } from "@/stores/entitlements-store"
import { openSettings } from "@/lib/settings-dialog"

/**
 * Feature-gate for imperative entry points (betaplan Phase C, step 6).
 *
 * Call at the top of an action handler for a paid capability: if the current
 * entitlement grants `key` it returns `true` and the caller proceeds; otherwise
 * it raises the upgrade prompt (a toast that deep-links to the Account section)
 * and returns `false` so the caller aborts. The **default is Free**, so any
 * unlicensed / lapsed state denies here.
 *
 * For *rendering* (disabling or hiding a control), subscribe with `useCan(key)`
 * instead — this helper is for the click/gesture path.
 */
export function requireFeature(key: string, featureName: string): boolean {
  if (can(key)) return true
  toast(`${featureName} is a paid feature`, {
    description: "Sign in or upgrade your plan to unlock it on this device.",
    action: {
      label: "Account",
      onClick: () => openSettings("account"),
    },
  })
  return false
}
