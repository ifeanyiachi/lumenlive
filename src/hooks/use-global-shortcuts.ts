import { useEffect } from "react"
import { useScheduleStore } from "@/stores/schedule-store"
import { useShortcutsStore } from "@/stores/shortcuts-store"
import { useSettingsDialogStore } from "@/lib/settings-dialog"
import { transcriptionActions } from "@/hooks/use-transcription"
import { useTranscriptStore } from "@/stores/transcript-store"
import { trackServiceStarted } from "@/services/analytics-gateway"
import { isEditableTarget } from "@/lib/dom/is-editable-target"
import { GLOBAL_SHORTCUTS } from "@/lib/keyboard/registry"
import { matchesAny } from "@/lib/keyboard/match"

/**
 * The single dispatcher for the app's *global* keyboard shortcuts (the
 * `scope: "global"` entries in `lib/keyboard/registry`). Mounted once at the app
 * root. Contextual shortcuts (live output, slide editor, book search) keep their
 * own listeners in the components that own those surfaces — this hook never
 * touches them.
 *
 * Stores are read with `getState()` inside the handler so the listener binds
 * exactly once and never re-subscribes on state change.
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    const dispatch: Record<string, () => void> = {
      "toggle-shortcuts": () => useShortcutsStore.getState().toggleOverlay(),
      "open-settings": () => useSettingsDialogStore.getState().openSettings(),
      "transcription-toggle": () => {
        const transcript = useTranscriptStore.getState()
        if (transcript.isTranscribing) {
          void transcriptionActions.stop()
        } else if (transcript.connectionStatus !== "connecting") {
          // Mirror the panel's start button: count a keyboard start as a new
          // service for analytics before kicking off the pipeline.
          trackServiceStarted()
          void transcriptionActions.start()
        }
      },
      "focus-search": () => {
        const input = document.querySelector<HTMLElement>(
          '[data-slot="search-panel"] input'
        )
        input?.focus()
      },
      "schedule-next": () => useScheduleStore.getState().goToAdjacentItem(1),
      "schedule-prev": () => useScheduleStore.getState().goToAdjacentItem(-1),
      "schedule-go-to-current": () => {
        const store = useScheduleStore.getState()
        const index = store.activeItemIndex
        const schedule = store.getActiveSchedule()
        if (index === null || !schedule) return
        const item = schedule.items[index]
        if (!item) return
        document
          .querySelector(`[data-schedule-item-id="${item.id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
        store.flashItem(item.id)
      },
      escape: () => {
        // Blur the focused input so Esc reliably drops keyboard focus. Radix
        // dialogs handle their own Esc-to-close at the document level, so we
        // never preventDefault or stopPropagation here — both can run.
        const active = document.activeElement
        if (active instanceof HTMLElement && isEditableTarget(active)) {
          active.blur()
        }
      },
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const overlayOpen = useShortcutsStore.getState().overlayOpen

      for (const shortcut of GLOBAL_SHORTCUTS) {
        if (!matchesAny(e, shortcut.chords)) continue

        // Escape always runs (it must work while typing, to blur the field).
        // Every other global shortcut is suppressed while the operator is typing
        // so single keys like `t` or `/` don't hijack text entry.
        if (shortcut.id !== "escape" && isEditableTarget(e.target)) return

        // While the cheat sheet is open, only `?` (to close it) stays live —
        // otherwise `t`/`n`/`p` would fire actions behind the overlay. Esc is
        // left to Radix to close the dialog.
        if (
          overlayOpen &&
          shortcut.id !== "toggle-shortcuts" &&
          shortcut.id !== "escape"
        ) {
          return
        }

        const run = dispatch[shortcut.id]
        if (!run) return
        // Printable single keys ("/", "?", ",") must not also be typed/scrolled.
        if (shortcut.id !== "escape") e.preventDefault()
        run()
        return
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
