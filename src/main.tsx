import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { invoke } from "@tauri-apps/api/core"
import { error as logError } from "@tauri-apps/plugin-log"
import { I18nextProvider } from "react-i18next"

import "./index.css"
import App from "./App.tsx"
import { TooltipProvider } from "@/components/ui/tooltip.tsx"
import { flushSettings, hydrateSettings } from "@/stores/settings-store"
import { flushThemes } from "@/stores/themes"
import { hydrateBibleStore, initBiblePersistence } from "@/stores/bible-store"
import {
  hydrateBroadcastThemes,
  hydrateBroadcastSession,
} from "@/stores/broadcast-store"
import { hydrateMediaStore } from "@/stores/media-store"
import { hydrateSongStore } from "@/stores/song-store"
import { hydratePresentations } from "@/stores/presentation-store"
import { hydrateThemes } from "@/stores/themes"
import { hydrateSchedules } from "@/stores/schedule-store"
import { hydrateAlertTemplates } from "@/stores/alert-store"
import { hydrateCountdownTimers } from "@/stores/countdown-store"
import { hydrateWebBookmarks } from "@/stores/web-store"
import { initUpdateNotifier, useUpdateStore } from "@/stores/update-store"
import {
  bootstrapLicensing,
  startRevalidationLoop,
} from "@/stores/licensing-actions"
import { trackAppLaunched } from "@/services/analytics-gateway"
import { i18n, initializeI18n } from "@/lib/i18n/config"
import { disableNativeContextMenu } from "@/lib/disable-native-context-menu"
import { initializeDesktopAuthCallbackBridge } from "@/services/desktop-auth-callback-gateway"
import { restoreDesktopLoginFromStorage } from "@/services/desktop-auth-service"

disableNativeContextMenu()

// Webview reloads do NOT restart the Rust backend, so any STT pipeline
// left running from the previous webview session still has
// `stt_active = true`. That makes the next `start_transcription` call
// fail silently with "Transcription is already running". Reset the
// backend to a clean state on boot, then hydrate persisted settings and
// bible store so the UI reflects the user's choices immediately.
window.addEventListener("beforeunload", () => {
  flushSettings()
  void flushThemes()
})

// LumenLive is dark-only. Clear the obsolete theme preference left by older
// builds that had a light/dark toggle, so nothing lingers in localStorage.
localStorage.removeItem("theme")

// A webview reload (routine under `tauri dev`) or a cold launch via the deep
// link wipes the in-memory browser-login transaction. Restore any pending one
// from storage before the callback bridge runs so an arriving callback can still
// complete the sign-in and the Account surface keeps showing "pending".
restoreDesktopLoginFromStorage()

// Persist uncaught errors and rejections to the tauri-plugin-log FILE before a
// crash can reload the webview and wipe the console. A hard renderer/GPU crash
// gives no JS event to catch, but any JS-level crash (uncaught throw, stack
// overflow, rejected promise) lands in the log this way, so a "mystery restart"
// leaves a readable cause behind. Registered before React mounts so it covers
// the whole session. Fire-and-forget; mirrored to the console for live use.
function reportCrash(kind: string, detail: unknown) {
  const text =
    detail instanceof Error
      ? `${detail.name}: ${detail.message}\n${detail.stack ?? ""}`
      : String(detail)
  console.error(`[crash:${kind}]`, detail)
  void logError(`[crash:${kind}] ${text}`).catch(() => {})
}

window.addEventListener("error", (e) => {
  reportCrash("error", e.error ?? e.message)
})
window.addEventListener("unhandledrejection", (e) => {
  reportCrash("unhandledrejection", e.reason)
})

// Reset the STT pipeline to a clean state (a webview reload leaves the Rust
// backend running, so a stale `stt_active` would make the next
// `start_transcription` fail), hydrate every persisted store, then mount React
// so the first paint already reflects the user's data. Each step swallows its
// own failure so a single store's hydration error can't block boot.
invoke("stop_transcription")
  .catch(() => {})
  .then(() =>
    Promise.all([
      initializeI18n(),
      hydrateSettings(),
      hydrateBibleStore(),
      hydrateBroadcastThemes(),
      hydrateBroadcastSession(),
      hydrateMediaStore(),
      hydrateSongStore(),
      hydratePresentations(),
      hydrateThemes(),
      hydrateSchedules(),
      hydrateAlertTemplates(),
      hydrateCountdownTimers(),
      hydrateWebBookmarks(),
      // Install the native browser-login callback before React mounts so a
      // callback cannot race the account UI during startup.
      initializeDesktopAuthCallbackBridge(),
      // Resolve the mandatory-update policy before mounting the application so
      // blocked builds never start dashboard or broadcast hooks.
      initUpdateNotifier(),
      // Restore the account session + license offline, then background-revalidate
      // if due. Never blocks boot — the app defaults to Free on any failure.
      bootstrapLicensing(),
    ])
  )
  .then(() => initBiblePersistence())
  .catch(() => {})
  .finally(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <I18nextProvider i18n={i18n}>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </I18nextProvider>
      </StrictMode>
    )
    if (useUpdateStore.getState().policyStatus !== "blocked") {
      // Weekly background license re-validation for the app's lifetime. A full
      // webview reload recreates this module, so the interval never stacks.
      startRevalidationLoop()
      // Anonymous launch heartbeat. Fired after hydration so the opt-out has
      // already been applied to the analytics gateway; no-ops when opted out or
      // outside Tauri. This is what makes an install count as an active church.
      trackAppLaunched()
    }
  })
