import { PresentationEditor } from "./presentation-editor"
import { usePresentationStore } from "@/stores/presentation-store"

/**
 * Global mount for the full-screen slide/theme editor overlay. Rendered once (in
 * the transport bar, alongside the Theme Designer) so it appears over ANY view —
 * including the broadcast Theme Designer, from which custom song themes are
 * authored (theme-unification-plan.md, Phase 3).
 *
 * A narrow leaf: it subscribes to just `editingPresentationId`, so opening/closing
 * the editor doesn't re-render the transport bar.
 */
export function PresentationEditorHost() {
  const editingId = usePresentationStore((s) => s.editingPresentationId)
  // A theme-authoring session (legacy song `themeEditSession`, or the type-first
  // `typedThemeSession` from themeredo.md Phase 3) renders embedded inside the
  // Theme Designer, not as this global full-screen overlay — so skip it here.
  const themeEditSession = usePresentationStore((s) => s.themeEditSession)
  const typedThemeSession = usePresentationStore((s) => s.typedThemeSession)
  if (!editingId || themeEditSession || typedThemeSession) return null
  return (
    <PresentationEditor
      onClose={() => usePresentationStore.getState().discardDraft()}
    />
  )
}
