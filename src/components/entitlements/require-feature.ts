import { toast } from "sonner"

import { can } from "@/stores/entitlements-store"
import { openAccountMenu } from "@/lib/account-menu"
import { useAuthStore } from "@/stores/auth-store"
import { startBrowserSignIn } from "@/services/desktop-auth-flow"

/**
 * Feature-gate for imperative entry points (betaplan Phase C, step 6).
 *
 * Call at the top of an action handler for a paid capability: if the current
 * entitlement grants `key` it returns `true` and the caller proceeds; otherwise
 * it raises a sign-in or upgrade prompt and returns `false` so the caller
 * aborts. Anonymous users enter the shared browser-login flow. The **default is Free**, so any
 * unlicensed / lapsed state denies here.
 *
 * For *rendering* (disabling or hiding a control), subscribe with `useCan(key)`
 * instead — this helper is for the click/gesture path.
 */
export function requireFeature(
  key: string,
  featureName: string,
  onActivated?: () => void
): boolean {
  if (can(key)) return true
  const signedIn = useAuthStore.getState().status === "authenticated"
  toast(`${featureName} is a paid feature`, {
    description: signedIn
      ? "Upgrade your plan to unlock it on this device."
      : "Sign in to unlock it on this device.",
    action: {
      label: signedIn ? "Account" : "Sign in",
      onClick: signedIn
        ? openAccountMenu
        : () =>
            void startBrowserSignIn({
              pendingAction: `feature:${key}`,
              onActivated,
            }).catch(() => {}),
    },
  })
  return false
}
