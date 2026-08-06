import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMediaStore } from "@/stores/media-store"
import {
  FolderIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  CheckIcon,
  XIcon,
} from "lucide-react"

interface CollectionManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CollectionManagerDialog({
  open,
  onOpenChange,
}: CollectionManagerDialogProps) {
  const collections = useMediaStore((s) => s.collections)
  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")

  const handleCreate = () => {
    if (!newName.trim()) return
    useMediaStore.getState().createCollection(newName)
    setNewName("")
  }

  const handleStartRename = (id: string, currentName: string) => {
    setEditingId(id)
    setEditingName(currentName)
  }

  const handleConfirmRename = () => {
    if (editingId && editingName.trim()) {
      useMediaStore.getState().renameCollection(editingId, editingName)
    }
    setEditingId(null)
    setEditingName("")
  }

  const handleCancelRename = () => {
    setEditingId(null)
    setEditingName("")
  }

  const handleDelete = (id: string) => {
    useMediaStore.getState().deleteCollection(id)
    if (editingId === id) {
      setEditingId(null)
      setEditingName("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Collections</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[320px]">
          {collections.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <FolderIcon className="size-8 opacity-40" />
              <p className="text-xs">No collections yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 p-0.5">
              {collections.map((col) => (
                <div
                  key={col.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
                >
                  <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />

                  {editingId === col.id ? (
                    <>
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleConfirmRename()
                          if (e.key === "Escape") handleCancelRename()
                        }}
                        className="h-6 flex-1 text-xs"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Confirm rename"
                        onClick={handleConfirmRename}
                        disabled={!editingName.trim()}
                      >
                        <CheckIcon className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Cancel rename"
                        onClick={handleCancelRename}
                      >
                        <XIcon className="size-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-xs">
                        {col.name}
                      </span>
                      <Badge variant="secondary" className="text-[0.6rem]">
                        {col.assetIds.length}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Rename ${col.name}`}
                        onClick={() => handleStartRename(col.id, col.name)}
                      >
                        <PencilIcon className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${col.name}`}
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(col.id)}
                      >
                        <TrashIcon className="size-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2">
          <Input
            placeholder="New collection name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate()
            }}
            className="h-8 flex-1 text-xs"
          />
          <Button
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={!newName.trim()}
            onClick={handleCreate}
          >
            <PlusIcon className="size-3" />
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
