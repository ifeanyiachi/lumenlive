import {
  XIcon,
  GridIcon,
  Undo2Icon,
  Redo2Icon,
  DownloadIcon,
  UploadIcon,
  FileTextIcon,
  SaveIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SlideThemePicker } from "@/components/slides/slide-theme-picker"
import { usePresentationStore } from "@/stores/presentation-store"
import {
  exportAllSlidesAsPdf,
  exportCurrentSlideAsPdf,
} from "@/lib/slide-pdf-export"
import { downloadJson, pickJsonFile } from "@/lib/slides/slide-io"
import type { Presentation } from "@/types/slide"

/**
 * Editor top bar: deck/theme name, undo/redo, grid toggle, and — for decks
 * only (not single-slide themes) — the theme picker, JSON/PDF export, JSON
 * import, plus Cancel/Save. Store mutations go through `getState()` so this
 * component holds no orchestration logic beyond wiring.
 */
export function EditorToolbar({
  draft,
  activeSlideIndex,
  themeMode,
  showGrid,
  setShowGrid,
  onClose,
}: {
  draft: Presentation
  activeSlideIndex: number
  themeMode: boolean
  showGrid: boolean
  setShowGrid: (updater: (v: boolean) => boolean) => void
  onClose: () => void
}) {
  return (
    <div className="flex h-11 items-center justify-between border-b border-border px-4">
      <Input
        value={draft.name}
        onChange={(e) => {
          const store = usePresentationStore.getState()
          if (store.draftPresentation) {
            usePresentationStore.setState({
              draftPresentation: {
                ...store.draftPresentation,
                name: e.target.value,
              },
            })
          }
        }}
        className="h-7 w-64 text-sm font-medium"
        placeholder={themeMode ? "Theme name" : "Presentation name"}
      />
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          title="Undo (Ctrl+Z)"
          onClick={() => usePresentationStore.getState().undo()}
        >
          <Undo2Icon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Redo (Ctrl+Y)"
          onClick={() => usePresentationStore.getState().redo()}
        >
          <Redo2Icon className="size-3.5" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          variant={showGrid ? "default" : "ghost"}
          size="icon-sm"
          title="Toggle grid"
          onClick={() => setShowGrid((v) => !v)}
        >
          <GridIcon className="size-3.5" />
        </Button>
        {!themeMode && (
          <>
            <SlideThemePicker />
            <div className="mx-1 h-5 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon-sm"
              title="Export presentation"
              onClick={() => {
                if (!draft) return
                const json = usePresentationStore
                  .getState()
                  .exportPresentation(draft.id)
                if (!json) return
                downloadJson(json, `${draft.name || "presentation"}.json`)
                toast.success("Presentation exported as JSON")
              }}
            >
              <DownloadIcon className="size-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" title="Export as PDF">
                  <FileTextIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={async () => {
                    if (!draft) return
                    await exportCurrentSlideAsPdf(draft, activeSlideIndex)
                    toast.success("Slide exported as PDF")
                  }}
                >
                  Export current slide
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (!draft) return
                    await exportAllSlidesAsPdf(draft)
                    toast.success("All slides exported as PDF")
                  }}
                >
                  Export all slides
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Import presentation"
              onClick={() => {
                pickJsonFile((json) =>
                  usePresentationStore.getState().importPresentation(json)
                )
              }}
            >
              <UploadIcon className="size-3.5" />
            </Button>
          </>
        )}
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            usePresentationStore.getState().discardDraft()
            onClose()
          }}
        >
          <XIcon className="mr-1.5 size-3" />
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => {
            const store = usePresentationStore.getState()
            const d = store.draftPresentation
            if (!d) return
            const name = d.name.trim()
            if (!name) {
              toast.error("Enter a presentation name before saving")
              return
            }
            // Presentation names must be unique (case-insensitive) across the library.
            const nameTaken = store.presentations.some(
              (p) =>
                p.id !== d.id &&
                p.name.trim().toLowerCase() === name.toLowerCase()
            )
            if (nameTaken) {
              toast.error(`A presentation named “${name}” already exists`)
              return
            }
            store.saveDraft()
            toast.success(themeMode ? "Theme saved" : "Presentation saved")
          }}
        >
          <SaveIcon className="mr-1.5 size-3" />
          Save
        </Button>
      </div>
    </div>
  )
}
