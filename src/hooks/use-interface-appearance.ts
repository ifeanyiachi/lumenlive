import { useEffect } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { toast } from "sonner"
import { useSettingsStore } from "@/stores/settings-store"
import { i18n } from "@/lib/i18n/config"

// Serialize native zoom requests so rapid keyboard input cannot leave an older
// zoom applied after the user's latest choice. This hook runs only in App,
// never in the broadcast/stage entry points.
let pendingZoom = Promise.resolve()

export function useInterfaceAppearance() {
  const scale = useSettingsStore((s) => s.interfaceScale)
  const density = useSettingsStore((s) => s.interfaceDensity)

  useEffect(() => {
    document.documentElement.dataset.interfaceDensity = density
    return () => {
      delete document.documentElement.dataset.interfaceDensity
    }
  }, [density])

  useEffect(() => {
    if (!isTauri()) {
      // Browser development uses CSS zoom; the desktop uses native webview zoom
      // so viewport breakpoints and portal positioning scale together.
      document.documentElement.style.zoom = String(scale / 100)
      return () => {
        document.documentElement.style.zoom = ""
      }
    }
    pendingZoom = pendingZoom
      .then(() => getCurrentWebview().setZoom(scale / 100))
      .catch((error: unknown) => {
        console.error("[appearance] Failed to apply interface size", error)
        toast.error(i18n.t("appearance.applyFailed", { ns: "settings" }))
      })
  }, [scale])
}
