import { useMemo } from "react"
import { PlusIcon, TrashIcon, MonitorIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useBroadcastStore } from "@/stores"
import { cn } from "@/lib/utils"

/**
 * CRUD for named stage-monitor groups — sets of presenter screens the operator
 * can cue in one shot ("Musicians", "Hosts"). Membership toggles are the stage
 * outputs currently configured; a group can be empty (no-op target) until
 * monitors are added. Deleting an output elsewhere scrubs it from every group
 * (see broadcast-store `removeOutput`), so this list never shows stale ids.
 */
export function StageMonitorGroupsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // Stable slice + useMemo — a `.filter()` selector returns a new array each
  // render and loops zustand v5's plain useSyncExternalStore.
  const outputs = useBroadcastStore((s) => s.outputs)
  const stageOutputs = useMemo(
    () => outputs.filter((o) => o.mode === "stage"),
    [outputs]
  )
  const groups = useBroadcastStore((s) => s.stageMonitorGroups)

  const toggleMember = (groupId: string, outputId: string) => {
    const store = useBroadcastStore.getState()
    const group = store.stageMonitorGroups.find((g) => g.id === groupId)
    if (!group) return
    const outputIds = group.outputIds.includes(outputId)
      ? group.outputIds.filter((id) => id !== outputId)
      : [...group.outputIds, outputId]
    store.updateStageMonitorGroup(groupId, { outputIds })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stage monitor groups</DialogTitle>
          <DialogDescription>
            Name a set of presenter screens so you can send a stage cue to all
            of them at once.
          </DialogDescription>
        </DialogHeader>

        {stageOutputs.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            No stage monitors yet. In Broadcast settings, add a display and set
            its mode to <span className="font-medium">Stage</span> to build
            groups.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No groups yet. Add one below.
              </p>
            )}

            {groups.map((group) => (
              <div
                key={group.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={group.name}
                    onChange={(e) =>
                      useBroadcastStore
                        .getState()
                        .updateStageMonitorGroup(group.id, {
                          name: e.target.value,
                        })
                    }
                    placeholder="Group name"
                    className="h-8 flex-1 text-xs"
                    aria-label="Group name"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Delete group"
                    onClick={() =>
                      useBroadcastStore
                        .getState()
                        .removeStageMonitorGroup(group.id)
                    }
                  >
                    <TrashIcon className="size-3.5" />
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {stageOutputs.map((output) => {
                    const active = group.outputIds.includes(output.id)
                    return (
                      <button
                        key={output.id}
                        type="button"
                        onClick={() => toggleMember(group.id, output.id)}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center gap-1 rounded-md border px-2 py-1 text-[0.6875rem] transition-colors",
                          active
                            ? "border-primary/50 bg-primary/15 text-foreground"
                            : "border-border text-muted-foreground hover:bg-accent"
                        )}
                      >
                        <MonitorIcon className="size-3" />
                        {output.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 self-start text-xs"
              onClick={() =>
                useBroadcastStore
                  .getState()
                  .addStageMonitorGroup("New group", [])
              }
            >
              <PlusIcon className="size-3.5" />
              Add group
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
