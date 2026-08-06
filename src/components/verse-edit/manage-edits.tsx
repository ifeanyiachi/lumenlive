import { useState, useMemo, useCallback } from "react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PencilIcon, Trash2Icon, SearchIcon } from "lucide-react"
import { useVerseEditStore } from "@/stores/verse-edit-store"
import type { VerseEdit } from "@/types/verse-edit"
import { cn } from "@/lib/utils"

type SortMode = "recent" | "book-order"

function parseEditKey(key: string) {
  const [, bookNumber, chapter, verse] = key.split(":").map(Number)
  return { bookNumber, chapter, verse }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

interface ManageEditsProps {
  onEditVerse?: (editKey: string) => void
}

export function ManageEdits({ onEditVerse }: ManageEditsProps) {
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortMode>("recent")
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  const edits = useVerseEditStore((s) => s.edits)
  const deleteEdit = useVerseEditStore((s) => s.deleteEdit)
  const clearAllEdits = useVerseEditStore((s) => s.clearAllEdits)

  const editList = useMemo(() => {
    let list = Object.values(edits)

    if (search.length >= 2) {
      const q = search.toLowerCase()
      list = list.filter(
        (e) =>
          e.reference.toLowerCase().includes(q) ||
          e.originalText.toLowerCase().includes(q)
      )
    }

    if (sort === "recent") {
      list.sort((a, b) => b.updatedAt - a.updatedAt)
    } else {
      list.sort((a, b) => {
        const pa = parseEditKey(a.key)
        const pb = parseEditKey(b.key)
        return (
          pa.bookNumber - pb.bookNumber ||
          pa.chapter - pb.chapter ||
          pa.verse - pb.verse
        )
      })
    }

    return list
  }, [edits, search, sort])

  const editCount = Object.keys(edits).length
  const deletingEdit = deletingKey ? edits[deletingKey] : null

  const handleDelete = useCallback(() => {
    if (deletingKey) {
      deleteEdit(deletingKey)
      setDeletingKey(null)
    }
  }, [deletingKey, deleteEdit])

  const handleClearAll = useCallback(() => {
    clearAllEdits()
    setConfirmClearAll(false)
  }, [clearAllEdits])

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by reference or text..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 text-xs"
        />
      </div>

      {/* Sort + count + clear */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Sort:</span>
          <Button
            variant={sort === "recent" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 text-xs"
            onClick={() => setSort("recent")}
          >
            Most Recent
          </Button>
          <Button
            variant={sort === "book-order" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 text-xs"
            onClick={() => setSort("book-order")}
          >
            Book Order
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {editCount} saved
          </span>
          {editCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-destructive hover:text-destructive"
              onClick={() => setConfirmClearAll(true)}
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Edit list */}
      <div className="flex max-h-[380px] flex-col gap-0 overflow-y-auto rounded-lg border border-border">
        {editList.length === 0 && (
          <p className="p-6 text-center text-xs text-muted-foreground">
            {search ? "No matching edits found" : "No saved edits yet"}
          </p>
        )}
        {editList.map((edit: VerseEdit) => (
          <div
            key={edit.key}
            className={cn(
              "group flex items-start gap-3 border-b border-border px-3 py-2.5 transition-colors last:border-b-0",
              onEditVerse && "cursor-pointer hover:bg-muted/50"
            )}
            onClick={() => onEditVerse?.(edit.key)}
          >
            <PencilIcon className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{edit.reference}</span>
                <span className="shrink-0 text-[0.625rem] text-muted-foreground">
                  {formatDate(edit.updatedAt)}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {edit.originalText.length > 80
                  ? edit.originalText.slice(0, 80) + "..."
                  : edit.originalText}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Delete edit"
              className="mt-0.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                setDeletingKey(edit.key)
              }}
            >
              <Trash2Icon className="size-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Delete single confirmation */}
      <Dialog
        open={!!deletingKey}
        onOpenChange={(open) => {
          if (!open) setDeletingKey(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Delete Saved Edit</DialogTitle>
            <DialogDescription className="text-xs">
              Delete saved formatting for &ldquo;{deletingEdit?.reference}
              &rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear all confirmation */}
      <Dialog open={confirmClearAll} onOpenChange={setConfirmClearAll}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Clear All Saved Edits</DialogTitle>
            <DialogDescription className="text-xs">
              This will delete all {editCount} saved edits. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" size="sm" onClick={handleClearAll}>
              Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
