import { useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useShortcutsStore } from "@/stores/shortcuts-store"
import {
  SHORTCUTS,
  CATEGORY_ORDER,
  type ShortcutCategory,
  type ShortcutDef,
} from "@/lib/keyboard/registry"
import { formatChord } from "@/lib/keyboard/match"

/** Detect macOS once for the modifier glyph (⌘ vs Ctrl). */
function detectIsMac(): boolean {
  if (typeof navigator === "undefined") return false
  return /mac/i.test(navigator.userAgent)
}

function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-foreground shadow-sm">
      {children}
    </kbd>
  )
}

/** One shortcut row: label + description on the left, key caps on the right. */
function ShortcutRow({ def, isMac }: { def: ShortcutDef; isMac: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <div className="text-sm text-foreground">{def.label}</div>
        <div className="truncate text-xs text-muted-foreground">
          {def.description}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {def.chords.map((chord, ci) => (
          <span key={ci} className="flex items-center gap-1">
            {ci > 0 && (
              <span className="text-[0.625rem] text-muted-foreground">or</span>
            )}
            {formatChord(chord, isMac).map((cap, ki) => (
              <KeyCap key={ki}>{cap}</KeyCap>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * The `?` cheat-sheet overlay. Rendered entirely from `lib/keyboard/registry` —
 * the single source of truth — so it always lists every shortcut, global and
 * contextual alike, grouped by category. Toggled by the `?` global shortcut and
 * the transport-bar keyboard button (both via `useShortcutsStore`).
 */
export function KeyboardShortcutsOverlay() {
  const open = useShortcutsStore((s) => s.overlayOpen)
  const setOpen = useShortcutsStore((s) => s.setOverlayOpen)
  const isMac = useMemo(() => detectIsMac(), [])

  const byCategory = useMemo(() => {
    const groups = new Map<ShortcutCategory, ShortcutDef[]>()
    for (const cat of CATEGORY_ORDER) groups.set(cat, [])
    for (const s of SHORTCUTS) groups.get(s.category)?.push(s)
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      items: groups.get(cat) ?? [],
    })).filter((g) => g.items.length > 0)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts are ignored while you're typing in a field.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {byCategory.map(({ category, items }) => (
            <section key={category}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </h3>
              <div className="divide-y divide-border/60">
                {items.map((def) => (
                  <ShortcutRow key={def.id} def={def} isMac={isMac} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
