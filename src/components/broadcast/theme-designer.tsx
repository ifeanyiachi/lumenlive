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
  Share2Icon,
} from "lucide-react"
import { currentDefaultThemeId } from "@/lib/theme/defaults"
import { ThemeLibrary } from "@/components/broadcast/theme-library"
import { PresentationEditor } from "@/components/slides/presentation-editor"
import { createThemeFromTemplate } from "@/lib/theme/templates"
import { slideToTheme } from "@/lib/theme/render"
import { exportTheme } from "@/lib/theme-bundle/io"
import type { Slide } from "@/types/slide"
import type { Theme, ThemeType } from "@/types/theme"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

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
  const { t } = useTranslation("broadcast")
  const isDesignerOpen = useBroadcastStore((s) => s.isDesignerOpen)
  const session = usePresentationStore((s) => s.typedThemeSession)
  const draftName = usePresentationStore((s) => s.draftPresentation?.name ?? "")
  const activeThemeId = session?.identity.id ?? null
  const isEditing = session != null
  const scriptureDefaultThemeId = useSettingsStore(
    (s) => s.scriptureDefaultThemeId
  )
  const songSlideDefaults = useSettingsStore((s) => s.songSlideDefaults)
  const sessionType = session?.identity.type
  const otherThemeDefaultIds = useSettingsStore((s) => s.otherThemeDefaultIds)

  const [showGrid, setShowGrid] = useState(false)
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null)
  // The original id of the built-in the current draft was forked from, or null
  // when editing a custom theme or a blank new one. A pristine built-in can be
  // made the default by its own id — without persisting a duplicate custom copy.
  const [sourceBuiltinId, setSourceBuiltinId] = useState<string | null>(null)

  const currentDefault =
    sessionType != null
      ? currentDefaultThemeId(sessionType, {
          scriptureDefaultThemeId,
          songSlideDefaults,
          otherThemeDefaultIds,
        })
      : null
  const isCurrentDefault =
    currentDefault != null &&
    (currentDefault === session?.identity.id ||
      currentDefault === sourceBuiltinId)
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
      // Remember the source built-in so "Set as Default" can point at its own id
      // instead of persisting the forked copy (see handleSaveAsDefault).
      setSourceBuiltinId(theme.builtin ? theme.id : null)
      markClean()
    })
  }

  const newTheme = (type: ThemeType) => {
    guardSwitch(() => {
      const theme = createThemeFromTemplate(type, uuid, Date.now())
      usePresentationStore.getState().startEditingTheme(theme, true)
      setSourceBuiltinId(null)
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
      toast.error(t("themeDesigner.enterName"))
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
      toast.error(t("themeDesigner.nameExists", { name }))
      return false
    }
    const theme = slideToTheme(slide, sess.identity, Date.now())
    useThemesStore.getState().upsertTheme(theme)
    usePresentationStore.setState({
      typedThemeSession: { ...sess, isNew: false },
    })
    markClean()
    toast.success(t("themeDesigner.saved"))
    return true
  }

  // Point the app-wide default for `type` at `themeId`.
  const applyDefault = (type: ThemeType, themeId: string) => {
    if (type === "scripture") {
      useSettingsStore.getState().setScriptureDefaultThemeId(themeId)
      // Apply to the Program output so the new default is live immediately.
      useBroadcastStore.getState().setActiveTheme(themeId)
      toast.success(t("themeDesigner.defaultScripture"))
    } else if (type === "song") {
      const s = useSettingsStore.getState()
      s.setSongSlideDefaults({ ...s.songSlideDefaults, themeId })
      toast.success(t("themeDesigner.defaultSong"))
    } else {
      useSettingsStore.getState().setOtherThemeDefaultId(type, themeId)
      toast.success(t("themeDesigner.defaultSet", { type }))
    }
  }

  // Make the current theme the app-wide default for its type.
  //
  // A pristine, unedited built-in is set as default by its *own* id — opening a
  // built-in forks it to an unsaved custom copy, so saving here would persist a
  // duplicate custom theme for no reason. Only once the fork is actually edited
  // do we save it and point the default at the new custom id.
  const handleSaveAsDefault = () => {
    const sess = usePresentationStore.getState().typedThemeSession
    if (!sess) return
    if (sourceBuiltinId && !isDirty()) {
      applyDefault(sess.identity.type, sourceBuiltinId)
      return
    }
    if (!handleSave()) return
    const identity = usePresentationStore.getState().typedThemeSession?.identity
    if (!identity) return
    applyDefault(identity.type, identity.id)
  }

  // Export the theme currently open in the editor to a `.lumtheme` bundle,
  // packaging its media. Builds the bundle from the live draft so unsaved tweaks
  // travel too.
  const handleExport = async () => {
    const s = usePresentationStore.getState()
    const sess = s.typedThemeSession
    const slide = s.draftPresentation?.slides[0]
    if (!sess || !slide) return
    const theme = slideToTheme(slide, sess.identity, Date.now())
    try {
      const { saved, missingMedia } = await exportTheme(theme)
      if (!saved) return
      if (missingMedia > 0) {
        toast.warning(
          t("themeDesigner.exportMissingMedia", {
            name: theme.name,
            count: missingMedia,
          })
        )
      } else {
        toast.success(t("themeDesigner.exported", { name: theme.name }))
      }
    } catch {
      toast.error(t("themeDesigner.exportFailed"))
    }
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
            {t("themeDesigner.title")}
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
                placeholder={t("themeDesigner.namePlaceholder")}
              />
            ) : (
              <span className="text-xl font-semibold text-foreground">
                {t("themeDesigner.title")}
              </span>
            )}

            {isEditing && (
              <div className="ml-2 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  onClick={() => usePresentationStore.getState().undo()}
                  title={t("undo") + " (Ctrl+Z)"}
                >
                  <Undo2Icon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  onClick={() => usePresentationStore.getState().redo()}
                  title={t("redo") + " (Ctrl+Y)"}
                >
                  <Redo2Icon className="size-4" />
                </Button>
                <Button
                  variant={showGrid ? "default" : "ghost"}
                  size="icon-sm"
                  className="size-8"
                  onClick={() => setShowGrid((v) => !v)}
                  title={t("themeDesigner.toggleGrid")}
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
                  {t("discard")}
                </Button>
                {sessionType && (
                  <Button
                    variant="outline"
                    onClick={handleSaveAsDefault}
                    disabled={isCurrentDefault}
                    title={t("themeDesigner.saveAsDefault", {
                      type: sessionType,
                    })}
                  >
                    <CheckCheckIcon className="size-4" />
                    {isCurrentDefault
                      ? t("themeDesigner.defaultType", { type: sessionType })
                      : t("themeDesigner.setAsDefault")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleExport}
                  title={t("themeDesigner.exportTitle")}
                >
                  <Share2Icon className="size-4" />
                  {t("export")}
                </Button>
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/80"
                  onClick={handleSave}
                >
                  <SaveIcon className="size-4" />
                  {t("themeDesigner.saveTheme")}
                </Button>
              </>
            )}

            <Button variant="ghost" onClick={handleClose}>
              <XIcon strokeWidth={2} />
              {t("close")}
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
                    {t("themeDesigner.selectTheme")}
                  </p>
                  <p className="mt-1 text-xs">
                    {t("themeDesigner.selectThemeDescription")}
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
                    {t("themeDesigner.discardChanges")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("themeDesigner.discardChangesDescription")}
                  </p>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPendingSwitch(null)}
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      pendingSwitch()
                      setPendingSwitch(null)
                    }}
                  >
                    {t("themeDesigner.discardContinue")}
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
