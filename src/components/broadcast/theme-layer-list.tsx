import { useCallback, useRef, useState } from "react"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SquareIcon,
  TypeIcon,
  BookOpenIcon,
  ImageIcon,
  PentagonIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  UnlockIcon,
  Trash2Icon,
  GripVerticalIcon,
  PlusIcon,
  LinkIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { ThemeElement } from "@/types/broadcast"

const FIXED_REGION_META: Record<
  string,
  { label: string; icon: typeof SquareIcon }
> = {
  textArea: { label: "Text Area", icon: SquareIcon },
  verse: { label: "Verse", icon: TypeIcon },
  reference: { label: "Reference", icon: BookOpenIcon },
}

const FIXED_IDS = new Set(["textArea", "verse", "reference"])

function isFixedRegion(id: string): boolean {
  return FIXED_IDS.has(id)
}

function elementIcon(el: ThemeElement) {
  return el.type === "image" ? ImageIcon : PentagonIcon
}

export function ThemeLayerList() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const selectedElement = useBroadcastStore((s) => s.selectedElement)
  const regionLocked = useBroadcastStore((s) => s.regionLocked)
  const regionHidden = useBroadcastStore((s) => s.regionHidden)

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const store = useBroadcastStore.getState

  // Declared before the early return below so hook order stays stable
  // across renders (rules-of-hooks).
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      e.preventDefault()
      e.stopPropagation()
      setDragIndex(index)
      setDropIndex(index)

      let currentDrop = index

      const onMove = (ev: PointerEvent) => {
        if (!listRef.current) return
        const rows = listRef.current.querySelectorAll("[data-layer-row]")
        let closest = index
        let minDist = Infinity
        rows.forEach((row, i) => {
          const rect = row.getBoundingClientRect()
          const mid = rect.top + rect.height / 2
          const dist = Math.abs(ev.clientY - mid)
          if (dist < minDist) {
            minDist = dist
            closest = i
          }
        })
        currentDrop = closest
        setDropIndex(closest)
      }

      const onUp = () => {
        document.removeEventListener("pointermove", onMove)
        document.removeEventListener("pointerup", onUp)
        setDragIndex(null)
        setDropIndex(null)
        if (currentDrop !== index) {
          store().reorderLayers(index, currentDrop)
        }
      }

      document.addEventListener("pointermove", onMove)
      document.addEventListener("pointerup", onUp)
    },
    [store]
  )

  if (!draftTheme) return null

  const layerOrder = draftTheme.layerOrder ?? ["textArea", "verse", "reference"]
  const elementsMap = new Map((draftTheme.elements ?? []).map((e) => [e.id, e]))

  const getSelectedId = (layerId: string): string | null => {
    return layerId === "textArea" ? null : layerId
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          Layers
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Add layer"
              className="size-5"
            >
              <PlusIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => store().addElement("image")}>
              <ImageIcon className="mr-2 size-3.5" />
              Image
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => store().addElement("shape")}>
              <PentagonIcon className="mr-2 size-3.5" />
              Shape
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div ref={listRef} className="space-y-0.5">
        {layerOrder.map((layerId, index) => {
          const fixed = isFixedRegion(layerId)
          const meta = fixed ? FIXED_REGION_META[layerId] : null
          const element = fixed ? null : elementsMap.get(layerId)

          if (!fixed && !element) return null

          const Icon = fixed ? meta!.icon : elementIcon(element!)
          const label = fixed ? meta!.label : element!.name
          const selectId = getSelectedId(layerId)
          const isSelected = selectedElement === selectId

          const isHidden = fixed
            ? regionHidden.has(layerId as "textArea" | "verse" | "reference")
            : !element!.visible
          const isLocked = fixed
            ? regionLocked.has(layerId as "textArea" | "verse" | "reference")
            : element!.locked

          const isDragging = dragIndex === index
          const isDropTarget =
            dropIndex === index && dragIndex !== null && dragIndex !== dropIndex

          return (
            <div
              key={layerId}
              data-layer-row
              className={cn(
                "group mx-1 flex h-8 cursor-pointer items-center gap-1 rounded px-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                isDragging && "opacity-40",
                isDropTarget && "border-t-2 border-primary"
              )}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`Select ${label} layer`}
              onClick={() => store().setSelectedElement(selectId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  store().setSelectedElement(selectId)
                }
              }}
            >
              {/* Drag handle */}
              <span
                className="flex shrink-0 cursor-grab items-center active:cursor-grabbing"
                onPointerDown={(e) => handlePointerDown(e, index)}
              >
                <GripVerticalIcon className="size-3 opacity-0 group-hover:opacity-60" />
              </span>

              <Icon className="size-3.5 shrink-0" />
              <span
                className={cn(
                  "flex-1 truncate",
                  isHidden && "line-through opacity-50"
                )}
              >
                {label}
              </span>
              {!fixed && element!.type === "shape" && element!.maskTargetId && (
                <span title={`Masking: ${element!.maskTargetId}`}>
                  <LinkIcon className="size-3 shrink-0 text-blue-400" />
                </span>
              )}

              {/* Lock */}
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-5 opacity-0 group-hover:opacity-100 data-[state=on]:opacity-100"
                data-state={isLocked ? "on" : "off"}
                aria-pressed={isLocked}
                aria-label={isLocked ? `Unlock ${label}` : `Lock ${label}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (fixed) {
                    store().toggleRegionLocked(
                      layerId as "textArea" | "verse" | "reference"
                    )
                  } else {
                    store().toggleElementLocked(layerId)
                  }
                }}
                title={isLocked ? "Unlock" : "Lock"}
              >
                {isLocked ? (
                  <LockIcon className="size-3 text-amber-500" />
                ) : (
                  <UnlockIcon className="size-3" />
                )}
              </Button>

              {/* Visibility */}
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-5 opacity-0 group-hover:opacity-100 data-[state=on]:opacity-100"
                data-state={isHidden ? "on" : "off"}
                aria-pressed={isHidden}
                aria-label={isHidden ? `Show ${label}` : `Hide ${label}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (fixed) {
                    store().toggleRegionHidden(
                      layerId as "textArea" | "verse" | "reference"
                    )
                  } else {
                    store().toggleElementVisibility(layerId)
                  }
                }}
                title={isHidden ? "Show" : "Hide"}
              >
                {isHidden ? (
                  <EyeOffIcon className="size-3 text-amber-500" />
                ) : (
                  <EyeIcon className="size-3" />
                )}
              </Button>

              {/* Delete — only for custom elements */}
              {!fixed && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-5 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    store().removeElement(layerId)
                  }}
                  title="Delete layer"
                >
                  <Trash2Icon className="size-3" />
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
