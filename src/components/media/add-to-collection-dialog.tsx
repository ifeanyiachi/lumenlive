import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMediaStore } from "@/stores/media-store"
import { FolderIcon, PlusIcon } from "lucide-react"

interface AddToCollectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assetIds: string[]
}

export function AddToCollectionDialog({
  open,
  onOpenChange,
  assetIds,
}: AddToCollectionDialogProps) {
  const collections = useMediaStore((s) => s.collections)
  const [newName, setNewName] = useState("")

  const handleAddTo = (collectionId: string) => {
    useMediaStore.getState().addAssetsToCollection(collectionId, assetIds)
    onOpenChange(false)
  }

  const handleCreateAndAdd = () => {
    if (!newName.trim()) return
    const col = useMediaStore.getState().createCollection(newName)
    useMediaStore.getState().addAssetsToCollection(col.id, assetIds)
    setNewName("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to Collection</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[240px]">
          {collections.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<FolderIcon />}
              title="No collections yet — create one below"
            />
          ) : (
            <div className="flex flex-col gap-0.5 p-0.5">
              {collections.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => handleAddTo(col.id)}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
                >
                  <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-xs">{col.name}</span>
                  <Badge variant="secondary" className="text-[0.6rem]">
                    {col.assetIds.length}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2">
          <Input
            placeholder="New collection..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateAndAdd()
            }}
            className="h-8 flex-1 text-xs"
          />
          <Button
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={!newName.trim()}
            onClick={handleCreateAndAdd}
          >
            <PlusIcon className="size-3" />
            New
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
