import { useRef, useState } from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useBroadcastStore, useSettingsStore } from "@/stores"
import { useThemesStore } from "@/stores/themes"
import { usePresentationStore } from "@/stores/presentation-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SaveIcon,
  TrashIcon,
  XIcon,
  Undo2Icon,
  Redo2Icon,
  GridIcon,
  PaletteIcon,
  CheckCheckIcon,
} from "lucide-react"
import { resolveLegacyThemeId } from "@/lib/theme/migrate/legacy-id"
import { ThemeLibrary } from "@/components/broadcast/theme-library"
import { PresentationEditor } from "@/components/slides/presentation-editor"
import { createThemeFromTemplate } from "@/lib/theme/templates"
import { slideToTheme } from "@/lib/theme/render"
import type { Slide } from "@/types/slide"
import type { Theme, ThemeType } from "@/types/theme"
import { toast } from "sonner"

const uuid = () => crypto.randomUUID()
const snapshotOf = (slide: Slide | undefined) =>
  slide ? JSON.stringify(slide) : ""

/**
 * The Theme Designer for the type-first model (themeredo.md, Phase 3). Left: the
 * theme library (built-ins + customs from `useThemesStore`). Right: the shared
 * slide editor, embedded and parameterized by the theme's intrinsic type — its
 * type-specific properties panel and curated add-menu come from the editor's own
 * `typedThemeSession`. The designer's top bar is the single chrome (name, undo,
 * grid, save/discard) so there's no duplicate toolbar. Saving projects the edited
 * single-slide draft back into a `Theme` via `slideToTheme`.
 */
export function ThemeDesigner() {
  const isDesignerOpen = useBroadcastStore((s) => s.isDesignerOpen)
  const session = usePresentationStore((s) => s.typedThemeSession)
  const draftName = usePresentationStore((s) => s.draftPresentation?.name ?? "")
  const activeThemeId = session?.identity.id ?? null
  const isEditing = session != null
  const scriptureDefaultThemeId = useSettingsStore(
    (s) => s.scriptureDefaultThemeId
  )
  const isScriptureTheme = session?.identity.type === "scripture"
  const isCurrentDefault =
    isScriptureTheme &&
    resolveLegacyThemeId(scriptureDefaultThemeId) === session?.identity.id

  const [showGrid, setShowGrid] = useState(false)
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null)
  // Snapshot of the draft slide as it was last opened/saved — the dirty signal
  // that gates switching away (the presentation store's undo stack isn't
  // reactive state, so we compare the slide directly).
  const cleanSnapshot = useRef("")

  const markClean = () => {
    const slide = usePresentationStore.getState().draftPresentation?.slides[0]
    cleanSnapshot.current = snapshotOf(slide)
  }

  const isDirty = () => {
    if (!usePresentationStore.getState().typedThemeSession) return false
    const slide = usePresentationStore.getState().draftPresentation?.slides[0]
    return snapshotOf(slide) !== cleanSnapshot.current
  }

  // Guard a destructive switch (open another theme / New / close) behind an
  // unsaved-changes confirm when the current draft has edits.
  const guardSwitch = (action: () => void) => {
    if (isDirty()) setPendingSwitch(() => action)
    else action()
  }

  const openTheme = (theme: Theme) => {
    guardSwitch(() => {
      // Built-ins are immutable code constants — editing one forks it to a fresh
      // custom copy (new id) so Save writes a distinct theme.
      const editable: Theme = theme.builtin
        ? {
            ...structuredClone(theme),
            id: uuid(),
            name: `${theme.name} (Custom)`,
            builtin: false,
          }
        : theme
      usePresentationStore.getState().startEditingTheme(editable, theme.builtin)
      markClean()
    })
  }

  const newTheme = (type: ThemeType) => {
    guardSwitch(() => {
      const theme = createThemeFromTemplate(type, uuid, Date.now())
      usePresentationStore.getState().startEditingTheme(theme, true)
      markClean()
    })
  }

  const setSessionName = (name: string) => {
    const s = usePresentationStore.getState()
    if (!s.typedThemeSession) return
    usePresentationStore.setState({
      typedThemeSession: {
        ...s.typedThemeSession,
        identity: { ...s.typedThemeSession.identity, name },
      },
      draftPresentation: s.draftPresentation
        ? { ...s.draftPresentation, name }
        : s.draftPresentation,
    })
  }

  // Saves the edited draft back to a Theme. Returns true on success so callers
  // (e.g. "Set as default") can chain only when the save actually landed.
  const handleSave = (): boolean => {
    const s = usePresentationStore.getState()
    const sess = s.typedThemeSession
    const slide = s.draftPresentation?.slides[0]
    if (!sess || !slide) return false
    const name = sess.identity.name.trim()
    if (!name) {
      toast.error("Enter a theme name before saving")
      return false
    }
    // Names must be unique across the library (built-ins + customs), case-insensitive.
    const nameTaken = useThemesStore
      .getState()
      .allThemes()
      .some(
        (t) =>
          t.id !== sess.identity.id &&
          t.name.trim().toLowerCase() === name.toLowerCase()
      )
    if (nameTaken) {
      toast.error(`A theme named “${name}” already exists`)
      return false
    }
    const theme = slideToTheme(slide, sess.identity, Date.now())
    useThemesStore.getState().upsertTheme(theme)
    usePresentationStore.setState({
      typedThemeSession: { ...sess, isNew: false },
    })
    markClean()
    toast.success("Theme saved")
    return true
  }

  // Save the current scripture theme and make it the app-wide default (the look
  // new outputs adopt). Saves first so the default points at a persisted theme —
  // editing a built-in forks it to an unsaved custom id until Save runs.
  const handleSaveAsDefault = () => {
    if (!handleSave()) return
    const id = usePresentationStore.getState().typedThemeSession?.identity.id
    if (!id) return
    useSettingsStore.getState().setScriptureDefaultThemeId(id)
    // Apply to the Program output so the new default is live immediately.
    useBroadcastStore.getState().setActiveTheme(id)
    toast.success("Set as default scripture theme")
  }

  const handleDiscard = () => {
    guardSwitch(() => usePresentationStore.getState().discardDraft())
  }

  const handleClose = () => {
    guardSwitch(() => {
      usePresentationStore.getState().discardDraft()
      useBroadcastStore.getState().setDesignerOpen(false)
    })
  }

  return (
    <DialogPrimitive.Root
      open={isDesignerOpen}
      onOpenChange={(open) => {
        if (!open) {
          usePresentationStore.getState().discardDraft()
          useBroadcastStore.getState().setDesignerOpen(false)
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />

        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            Theme Designer
          </DialogPrimitive.Title>

          {/* Top bar — the single chrome for the embedded editor */}
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
            {isEditing ? (
              <Input
                value={draftName}
                onChange={(e) => setSessionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") e.stopPropagation()
                }}
                className="h-8 w-56 text-lg font-semibold"
                placeholder="Theme name"
              />
            ) : (
              <span className="text-xl font-semibold text-foreground">
                Theme Designer
              </span>
            )}

            {isEditing && (
              <div className="ml-2 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  onClick={() => usePresentationStore.getState().undo()}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2Icon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  onClick={() => usePresentationStore.getState().redo()}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2Icon className="size-4" />
                </Button>
                <Button
                  variant={showGrid ? "default" : "ghost"}
                  size="icon-sm"
                  className="size-8"
                  onClick={() => setShowGrid((v) => !v)}
                  title="Toggle grid"
                >
                  <GridIcon className="size-4" />
                </Button>
              </div>
            )}

            <div className="flex-1" />

            {isEditing && (
              <>
                <Button variant="outline" onClick={handleDiscard}>
                  <TrashIcon className="size-4" />
                  Discard
                </Button>
                {isScriptureTheme && (
                  <Button
                    variant="outline"
                    onClick={handleSaveAsDefault}
                    disabled={isCurrentDefault}
                    title="Save and set as the default scripture theme"
                  >
                    <CheckCheckIcon className="size-4" />
                    {isCurrentDefault ? "Default" : "Set as Default"}
                  </Button>
                )}
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/80"
                  onClick={handleSave}
                >
                  <SaveIcon className="size-4" />
                  Save Theme
                </Button>
              </>
            )}

            <Button variant="ghost" onClick={handleClose}>
              <XIcon strokeWidth={2} />
              Close
            </Button>
          </div>

          {/* Library (left) + editor (right) */}
          <div
            className="min-h-0 flex-1"
            style={{
              display: "grid",
              // minmax(0, 1fr) — a bare `1fr` track has an implicit min-width:auto
              // that refuses to shrink below the editor's min-content, overflowing
              // under the dialog's overflow-hidden and clipping the right panel.
              gridTemplateColumns: "300px minmax(0, 1fr)",
            }}
          >
            <ThemeLibrary
              activeThemeId={activeThemeId}
              onOpenTheme={openTheme}
              onNewTheme={newTheme}
            />

            {isEditing ? (
              <PresentationEditor
                embedded
                themeMode
                hideToolbar
                showGrid={showGrid}
                onShowGridChange={setShowGrid}
                onClose={() => usePresentationStore.getState().discardDraft()}
              />
            ) : (
              <div className="flex min-h-0 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
                <PaletteIcon className="size-10 opacity-40" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Select a theme to edit
                  </p>
                  <p className="mt-1 text-xs">
                    Pick a theme from the list, or create a new one to get
                    started.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Unsaved-changes guard */}
          {pendingSwitch && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
              <div className="w-full max-w-sm rounded-xl bg-popover p-6 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
                <div className="flex flex-col gap-2">
                  <h3 className="font-heading leading-none font-medium">
                    Discard unsaved changes?
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    This theme has unsaved edits. Continuing will lose them. This
                    action cannot be undone.
                  </p>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPendingSwitch(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      pendingSwitch()
                      setPendingSwitch(null)
                    }}
                  >
                    Discard &amp; Continue
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
