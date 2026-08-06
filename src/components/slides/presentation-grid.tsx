import { useMemo, useRef, useState } from "react"
import { PresentationIcon, PlusIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { PanelHeader } from "@/components/ui/panel-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PresentationCard } from "@/components/slides/presentation-card"
import { usePresentationStore } from "@/stores/presentation-store"
import { importPptxFile } from "@/lib/pptx-import-runner"

export function PresentationGrid() {
  const allPresentations = usePresentationStore((s) => s.presentations)
  const searchQuery = usePresentationStore((s) => s.searchQuery)
  const selectedId = usePresentationStore((s) => s.selectedPresentationId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const presentations = useMemo(() => {
    if (!searchQuery.trim()) return allPresentations
    const q = searchQuery.toLowerCase()
    return allPresentations.filter((p) => p.name.toLowerCase().includes(q))
  }, [allPresentations, searchQuery])

  const handleCreate = () => {
    const id = usePresentationStore.getState().createPresentation()
    usePresentationStore.getState().setSelectedPresentation(id)
  }

  const handleEdit = (id: string) => {
    usePresentationStore.getState().startEditing(id)
  }

  const handleImportPptx = async (file: File) => {
    setImporting(true)
    try {
      const id = await importPptxFile(file)
      usePresentationStore.getState().setSelectedPresentation(id)
      toast.success(`Imported "${file.name}"`)
    } catch (err) {
      toast.error(
        `Import failed: ${err instanceof Error ? err.message : "unknown error"}`
      )
    } finally {
      setImporting(false)
    }
  }

  return (
    <div
      data-slot="presentation-grid"
      className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <PanelHeader
        title="Presentations"
        icon={<PresentationIcon className="size-3.5" />}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pptx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (file) void handleImportPptx(file)
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
          title="Import a PowerPoint (.pptx) file"
        >
          <UploadIcon className="size-3" />
          {importing ? "Importing…" : "Import"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={handleCreate}
        >
          <PlusIcon className="size-3" />
          New
        </Button>
      </PanelHeader>

      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Input
          placeholder="Search presentations..."
          value={searchQuery}
          onChange={(e) =>
            usePresentationStore.getState().setSearchQuery(e.target.value)
          }
          className="h-7 flex-1 text-xs"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {presentations.length === 0 ? (
          <EmptyState
            size="lg"
            live={!!searchQuery}
            icon={<PresentationIcon />}
            title={
              searchQuery ? "No matching presentations" : "No presentations yet"
            }
            description={
              !searchQuery
                ? 'Click "New" to create your first presentation'
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 p-3">
            {presentations.map((p) => (
              <PresentationCard
                key={p.id}
                presentation={p}
                selected={selectedId === p.id}
                onSelect={() =>
                  usePresentationStore.getState().setSelectedPresentation(p.id)
                }
                onEdit={() => handleEdit(p.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
