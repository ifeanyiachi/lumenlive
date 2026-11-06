import { useBroadcastStore } from "@/stores"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  PlusIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  UnlockIcon,
  Trash2Icon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { ZoneSource } from "@/types/stage-layout"
import { useTranslation } from "react-i18next"

// The typed data sources an operator can drop onto a stage layout. Current /
// Clock / Notes / Timer / Stage Message / Announcement render live; Playlist
// renders from the schedule feed and Spacer is a visual-only placeholder.
const ZONE_SOURCES: { source: ZoneSource; labelKey: string }[] = [
  { source: "current", labelKey: "stageZones.sources.current" },
  { source: "clock", labelKey: "stageZones.sources.clock" },
  { source: "notes", labelKey: "stageZones.sources.notes" },
  { source: "timer", labelKey: "stageZones.sources.timer" },
  { source: "messages", labelKey: "stageZones.sources.messages" },
  { source: "announcement", labelKey: "stageZones.sources.announcement" },
  { source: "playlist", labelKey: "stageZones.sources.playlist" },
  { source: "spacer", labelKey: "stageZones.sources.spacer" },
]

export function StageZoneList() {
  const { t } = useTranslation("broadcast")
  const draft = useBroadcastStore((s) => s.draftStageLayout)
  const selectedZone = useBroadcastStore((s) => s.selectedZone)
  if (!draft) return null

  // Show layers top-of-stack first (reverse of the render order).
  const order = [...draft.layerOrder].reverse()
  const layers = order
    .map((id) => {
      const zone = draft.zones.find((z) => z.id === id)
      const el = zone ? null : draft.elements.find((e) => e.id === id)
      return zone ?? el
    })
    .filter((x): x is NonNullable<typeof x> => x != null)

  const move = (id: string, dir: -1 | 1) => {
    // layerOrder is bottom→top; the list is rendered reversed, so moving a row
    // "up" (dir = 1) means moving it *later* in layerOrder (higher index), and
    // "down" (dir = -1) means earlier. Hence `to = i + dir`.
    const i = draft.layerOrder.indexOf(id)
    const to = i + dir
    if (i < 0 || to < 0 || to >= draft.layerOrder.length) return
    useBroadcastStore.getState().reorderStageLayers(i, to)
  }

  return (
    <div className="flex min-h-0 flex-col border-b border-border">
      <div className="flex h-11 shrink-0 items-center justify-between px-3">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("stageZones.title")}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7">
              <PlusIcon className="size-3.5" />
              {t("stageZones.add")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {ZONE_SOURCES.map(({ source, labelKey }) => (
              <DropdownMenuItem
                key={source}
                onClick={() => useBroadcastStore.getState().addZone(source)}
              >
                {t(labelKey)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="max-h-56 min-h-0">
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          {layers.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t("stageZones.empty")}
            </p>
          )}
          {layers.map((layer) => {
            const isSel = layer.id === selectedZone
            const store = useBroadcastStore.getState
            return (
              <div
                key={layer.id}
                onClick={() => store().setSelectedZone(layer.id)}
                className={cn(
                  "group flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                  isSel
                    ? "bg-primary/15 text-foreground ring-1 ring-primary/40"
                    : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{layer.name}</span>
                <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("stageZones.moveUp")}
                    onClick={(e) => {
                      e.stopPropagation()
                      move(layer.id, 1)
                    }}
                  >
                    <ChevronUpIcon className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("stageZones.moveDown")}
                    onClick={(e) => {
                      e.stopPropagation()
                      move(layer.id, -1)
                    }}
                  >
                    <ChevronDownIcon className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={layer.locked ? t("unlock") : t("lock")}
                    onClick={(e) => {
                      e.stopPropagation()
                      store().toggleZoneLocked(layer.id)
                    }}
                  >
                    {layer.locked ? (
                      <LockIcon className="size-3" />
                    ) : (
                      <UnlockIcon className="size-3" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("delete")}
                    onClick={(e) => {
                      e.stopPropagation()
                      store().removeZone(layer.id)
                    }}
                  >
                    <Trash2Icon className="size-3" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={layer.visible ? t("hide") : t("show")}
                  className="shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    store().toggleZoneVisibility(layer.id)
                  }}
                >
                  {layer.visible ? (
                    <EyeIcon className="size-3" />
                  ) : (
                    <EyeOffIcon className="size-3 text-muted-foreground/50" />
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
