import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { invoke } from "@tauri-apps/api/core"
import { error as logError } from "@tauri-apps/plugin-log"

import "./index.css"
import App from "./App.tsx"
import { TooltipProvider } from "@/components/ui/tooltip.tsx"
import { flushSettings, hydrateSettings } from "@/stores/settings-store"
import { hydrateBibleStore, initBiblePersistence } from "@/stores/bible-store"
import { hydrateBroadcastThemes } from "@/stores/broadcast-store"
import { hydrateMediaStore } from "@/stores/media-store"
import { hydrateSongStore } from "@/stores/song-store"
import { hydratePresentations } from "@/stores/presentation-store"
import { hydrateSchedules } from "@/stores/schedule-store"
import { hydrateAlertTemplates } from "@/stores/alert-store"
import { hydrateCountdownTimers } from "@/stores/countdown-store"
import { hydrateVerseEdits } from "@/stores/verse-edit-store"
import { hydrateWebBookmarks } from "@/stores/web-store"

// Webview reloads do NOT restart the Rust backend, so any STT pipeline
// left running from the previous webview session still has
// `stt_active = true`. That makes the next `start_transcription` call
// fail silently with "Transcription is already running". Reset the
// backend to a clean state on boot, then hydrate persisted settings and
// bible store so the UI reflects the user's choices immediately.
window.addEventListener("beforeunload", () => {
  flushSettings()
})

// LumenLive is dark-only. Clear the obsolete theme preference left by older
// builds that had a light/dark toggle, so nothing lingers in localStorage.
localStorage.removeItem("theme")

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
      hydrateSettings(),
      hydrateBibleStore(),
      hydrateBroadcastThemes(),
      hydrateMediaStore(),
      hydrateSongStore(),
      hydratePresentations(),
      hydrateSchedules(),
      hydrateAlertTemplates(),
      hydrateCountdownTimers(),
      hydrateVerseEdits(),
      hydrateWebBookmarks(),
    ])
  )
  .then(() => initBiblePersistence())
  .catch(() => {})
  .finally(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </StrictMode>
    )
  })
