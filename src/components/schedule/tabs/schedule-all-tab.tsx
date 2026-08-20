import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import {
  TrashIcon,
  PlayIcon,
  SettingsIcon,
  SkipBackIcon,
  SkipForwardIcon,
  GripVerticalIcon,
  ChevronRightIcon,
  ListIcon,
  LayoutGridIcon,
  ImageIcon as LucideImageIcon,
  LocateIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useScheduleStore } from "@/stores/schedule-store"
import { usePresentationStore } from "@/stores/presentation-store"
import { useSettingsStore, useSongStore } from "@/stores"
import { useOsFileDrop } from "@/hooks/use-os-file-drop"
import { isEditableTarget } from "@/lib/dom/is-editable-target"
import { addAssetsToSchedule } from "@/lib/schedule-media"
import {
  generateSlidesFromSong,
  resolveSongSlideOptions,
} from "@/lib/song/song-to-slides"
import { useDropZone, useDragStore, type DragKind } from "@/stores/drag-store"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  TYPE_ICONS,
  TYPE_LABELS,
  QUICK_ACTIONS,
  type QuickAction,
} from "@/components/schedule/schedule-utils"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SlideStrip } from "@/components/schedule/slide-strip"
import { ScheduleItemThumbnail } from "@/components/schedule/schedule-item-thumbnail"
import { handleScheduleDrop } from "@/lib/schedule-drop"
import type {
  ScheduleItem,
  SlideScheduleItem,
  SongScheduleItem,
} from "@/types/schedule"
import type { Presentation } from "@/types/slide"

type ViewMode = "list" | "thumbnail"

export function ScheduleAllTab({
  onEditProperties,
  onStageNewItem,
}: {
  onEditProperties: (item: ScheduleItem) => void
  onStageNewItem: (item: ScheduleItem) => void
}) {
  const schedules = useScheduleStore((s) => s.schedules)
  const activeScheduleId = useScheduleStore((s) => s.activeScheduleId)
  const activeItemIndex = useScheduleStore((s) => s.activeItemIndex)
  const activeSlideIndex = useScheduleStore((s) => s.activeSlideIndex)
  const selectedItemId = useScheduleStore((s) => s.selectedItemId)
  const highlightedId = useScheduleStore((s) => s.highlightedId)
  const presentations = usePresentationStore((s) => s.presentations)
  const customSlideThemes = useThemesStore((s) => s.customThemes)
  const songs = useSongStore((s) => s.songs)
  const songSlideDefaults = useSettingsStore((s) => s.songSlideDefaults)
  const [editingName, setEditingName] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [confirmClear, setConfirmClear] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  // Insertion point (0..items.length) for an external quick-add drag hovering
  // the list. Drives the same indicator line as internal reordering and the
  // position the payload lands at. The ref mirrors it so the drop handler can
  // read the latest value without re-registering the zone.
  const [externalDropIndex, setExternalDropIndex] = useState<number | null>(
    null
  )
  const externalDropIndexRef = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const { isOver: fileDragOver, dropHandlers: mediaDropHandlers } =
    useOsFileDrop(dropZoneRef, {
      accept: ["image", "video", "audio"],
      onDrop: (assets) => addAssetsToSchedule(assets),
    })

  const store = useScheduleStore.getState()
  const activeSchedule = schedules.find((sc) => sc.id === activeScheduleId)

  // Index presentations by id once per change, so each slide row is an O(1)
  // lookup instead of an O(presentations) find inside the items map.
  const presById = useMemo(() => {
    const m = new Map<string, (typeof presentations)[number]>()
    for (const p of presentations) m.set(p.id, p)
    return m
  }, [presentations])

  // A song item expands into a multi-slide deck at go-live exactly like a
  // grouped slide deck. Generate that deck here too (keyed by schedule-item id)
  // so the row can show the same expand chevron, slide-count badge, and slide
  // strip — otherwise the operator sees one row and can't tell it holds more
  // than the first slide. The generator is deterministic, so this preview deck
  // matches the go-live deck slide-for-slide (only the random ids differ).
  const songDeckByItemId = useMemo(() => {
    const m = new Map<string, Presentation>()
    const items = activeSchedule?.items ?? []
    const songById = new Map(songs.map((s) => [s.id, s]))
    for (const item of items) {
      if (item.type !== "song") continue
      const si = item as SongScheduleItem
      const song = songById.get(si.songId)
      if (!song) continue
      const arrangement =
        (si.arrangementId
          ? song.arrangements.find((a) => a.id === si.arrangementId)
          : undefined) ??
        song.arrangements.find((a) => a.isDefault) ??
        song.arrangements[0]
      if (!arrangement) continue
      const base = resolveSongSlideOptions(songSlideDefaults, song.slideOptions)
      const options = si.themeId ? { ...base, themeId: si.themeId } : base
      m.set(
        item.id,
        generateSlidesFromSong(
          song,
          arrangement,
          options,
          undefined,
          undefined,
          customSlideThemes
        )
      )
    }
    return m
  }, [activeSchedule?.items, songs, songSlideDefaults, customSlideThemes])

  const toggleExpanded = useCallback((itemId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }, [])

  // Auto-expand the active item when it becomes active, if it's a slide.
  // Adjusted during render (rather than in an effect) to avoid cascading renders.
  const [prevActiveItemIndex, setPrevActiveItemIndex] =
    useState(activeItemIndex)
  if (prevActiveItemIndex !== activeItemIndex) {
    setPrevActiveItemIndex(activeItemIndex)
    if (activeItemIndex !== null && activeSchedule) {
      const item = activeSchedule.items[activeItemIndex]
      if (item?.type === "slide") {
        setExpandedIds((prev) =>
          prev.has(item.id) ? prev : new Set(prev).add(item.id)
        )
      }
    }
  }

  const scrollToActiveItem = useCallback(() => {
    if (activeItemIndex === null || !activeSchedule) return
    const item = activeSchedule.items[activeItemIndex]
    if (!item) return
    document
      .querySelector(`[data-schedule-item-id="${item.id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [activeItemIndex, activeSchedule])

  // Auto-scroll to active item when it changes (prev/next navigation).
  useEffect(() => {
    scrollToActiveItem()
  }, [scrollToActiveItem])

  // Bring a flash-highlighted duplicate into view so the flash is never missed.
  useEffect(() => {
    if (!highlightedId) return
    document
      .querySelector(`[data-schedule-item-id="${highlightedId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [highlightedId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeSchedule) return
      // Don't hijack arrow keys while the operator is typing in a field.
      if (isEditableTarget(e.target)) return
      // Up/Down move the selection through the schedule list (staging each item
      // into the Program preview), replacing the prev/next buttons. preventDefault
      // stops the arrow keys from scrolling the list instead. Skip when the book
      // search panel is focused — it owns the arrows for verse navigation.
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (document.activeElement?.closest('[data-slot="search-panel"]'))
          return
        e.preventDefault()
        const items = activeSchedule.items
        if (e.key === "ArrowDown") {
          let next = (activeItemIndex ?? -1) + 1
          while (next < items.length && items[next].type === "header") next++
          if (next < items.length)
            void useScheduleStore.getState().goToItem(next)
        } else {
          let prev = (activeItemIndex ?? items.length) - 1
          while (prev >= 0 && items[prev].type === "header") prev--
          if (prev >= 0) void useScheduleStore.getState().goToItem(prev)
        }
        return
      }
      // Left/Right step slides within a deck-bearing item (slide groups and
      // songs), matching the prev/next transport buttons. Leaving other item
      // types alone avoids clashing with the media panel's own Left/Right.
      if (activeItemIndex === null) return
      const item = activeSchedule.items[activeItemIndex]
      if (item?.type !== "slide" && item?.type !== "song") return
      // Read the store lazily in the handler so this effect doesn't depend on
      // (and re-bind the listener for) the store reference.
      if (e.key === "ArrowRight") {
        e.preventDefault()
        useScheduleStore.getState().nextItem()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        useScheduleStore.getState().prevItem()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeItemIndex, activeSchedule])

  const handleAddAction = (action: QuickAction) => {
    if (!activeScheduleId) return
    const item: ScheduleItem = action.build(activeSchedule?.items.length ?? 0)
    // Placeholders are unconfigured, so identical ones are not duplicates —
    // the properties modal is where they become real content.
    if (item.type === "header") {
      store.addItem(activeScheduleId, item, { dedupe: false })
      toast.success(`${TYPE_LABELS[item.type]} added`)
      return
    }
    store.addItem(activeScheduleId, item, { dedupe: false })
    onStageNewItem(item)
  }

  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    dragIndexRef.current = index
    setDraggingIndex(index)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIndexRef.current === null || !listRef.current) return
    const items = listRef.current.querySelectorAll<HTMLElement>(
      "[data-schedule-idx]"
    )
    for (const item of items) {
      const rect = item.getBoundingClientRect()
      if (e.clientY >= rect.top && e.clientY < rect.bottom) {
        const idx = Number(item.dataset.scheduleIdx)
        if (idx !== dragIndexRef.current) {
          setDragOverIndex(idx)
        } else {
          setDragOverIndex(null)
        }
        return
      }
    }
  }

  const handlePointerUp = () => {
    const from = dragIndexRef.current
    if (
      from !== null &&
      dragOverIndex !== null &&
      from !== dragOverIndex &&
      activeScheduleId
    ) {
      store.reorderItem(activeScheduleId, from, dragOverIndex)
    }
    dragIndexRef.current = null
    setDraggingIndex(null)
    setDragOverIndex(null)
  }

  // Translate a cursor Y into an insertion index (0..itemCount): the position
  // before the first row whose vertical midpoint sits below the cursor, or the
  // end of the list when the cursor is past them all. Mirrors the Y-only
  // hit-testing used by internal reordering (works in list and grid views).
  const computeInsertIndex = useCallback((clientY: number): number => {
    const container = listRef.current
    if (!container) return 0
    const rows = container.querySelectorAll<HTMLElement>("[data-schedule-idx]")
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) {
        return Number(row.dataset.scheduleIdx)
      }
    }
    return rows.length
  }, [])

  // While a quick-add drag hovers the list, track the insertion index so the
  // indicator line follows the cursor. Subscribing imperatively (not via a
  // reactive selector) keeps the ~per-pixel move updates off the render path;
  // we only re-render when the computed index actually changes.
  const ACCEPTED_KINDS: DragKind[] = useMemo(
    () => ["verses", "media", "slide", "song"],
    []
  )
  useEffect(() => {
    return useDragStore.subscribe((state) => {
      const rect = dropZoneRef.current?.getBoundingClientRect()
      const inZone =
        state.active &&
        state.payload !== null &&
        ACCEPTED_KINDS.includes(state.payload.kind) &&
        rect !== undefined &&
        state.x >= rect.left &&
        state.x <= rect.right &&
        state.y >= rect.top &&
        state.y <= rect.bottom
      if (!inZone) {
        externalDropIndexRef.current = null
        setExternalDropIndex((prev) => (prev === null ? prev : null))
        return
      }
      const idx = computeInsertIndex(state.y)
      externalDropIndexRef.current = idx
      setExternalDropIndex((prev) => (prev === idx ? prev : idx))
    })
  }, [ACCEPTED_KINDS, computeInsertIndex])

  const dragOver = useDropZone(dropZoneRef, {
    accepts: ACCEPTED_KINDS,
    onDrop: (p) => {
      handleScheduleDrop(p, externalDropIndexRef.current ?? undefined)
      externalDropIndexRef.current = null
      setExternalDropIndex(null)
    },
  })

  // Total row count, used to render the trailing indicator when a quick-add
  // drag targets the end of the list (insertion index === itemCount).
  const itemCount = activeSchedule?.items.length ?? 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Schedule selector */}
      <div className="border-b border-border p-2">
        <div className="flex items-center gap-1">
          <select
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            value={activeScheduleId ?? ""}
            onChange={(e) => store.setActiveSchedule(e.target.value || null)}
          >
            <option value="">Select a schedule...</option>
            {schedules.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Schedule name editor + view toggle */}
      {activeSchedule && (
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          {editingName ? (
            <Input
              autoFocus
              className="h-7 min-w-0 flex-1 text-xs"
              value={activeSchedule.name}
              onChange={(e) =>
                store.renameSchedule(activeScheduleId!, e.target.value)
              }
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
            />
          ) : (
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-xs font-medium text-foreground hover:text-primary"
              onClick={() => setEditingName(true)}
            >
              {activeSchedule.name}
            </button>
          )}
          {activeSchedule.items.length > 0 && (
            <button
              onClick={() => setConfirmClear(true)}
              className="shrink-0 text-[0.625rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear all
            </button>
          )}
          <div className="flex shrink-0 items-center rounded-md border border-border">
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "size-6 rounded-r-none",
                viewMode === "list" && "bg-accent"
              )}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <ListIcon className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "size-6 rounded-l-none",
                viewMode === "thumbnail" && "bg-accent"
              )}
              onClick={() => setViewMode("thumbnail")}
              title="Thumbnail view"
            >
              <LayoutGridIcon className="size-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Item list / thumbnail grid */}
      <div
        ref={dropZoneRef}
        className={cn(
          "relative min-h-0 flex-1",
          dragOver && "bg-primary/5 ring-2 ring-primary/50 ring-inset",
          fileDragOver &&
            "bg-emerald-500/5 ring-2 ring-emerald-500/50 ring-inset"
        )}
        {...mediaDropHandlers}
      >
        {fileDragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-emerald-500/5">
            <div className="flex flex-col items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <LucideImageIcon className="size-6" />
              <span className="text-xs font-medium">Drop media here</span>
            </div>
          </div>
        )}
        <ScrollArea className="size-full">
          {viewMode === "list" ? (
            <div
              ref={listRef}
              // pr-3 reserves a gutter so row action icons clear the ScrollArea's
              // overlay scrollbar (which otherwise sits on top of the gear button).
              className="flex flex-col gap-0.5 p-1.5 pr-3"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {activeSchedule?.items.map((item, index) => {
                const isSlide = item.type === "slide"
                const slidePres = isSlide
                  ? presById.get((item as SlideScheduleItem).presentationId)
                  : undefined
                const isGroupSlide =
                  isSlide && (item as SlideScheduleItem).groupSlides !== false
                // The multi-slide deck this row expands into: a grouped slide
                // presentation, or a song's generated deck. Both step the same
                // way, so the expand/badge/strip UI below is shared.
                const deck =
                  item.type === "song"
                    ? songDeckByItemId.get(item.id)
                    : isGroupSlide
                      ? slidePres
                      : undefined
                // A slide row's base index is its own slideIndex; a song always
                // starts at slide 0.
                const baseSlideIndex = isSlide
                  ? (item as SlideScheduleItem).slideIndex
                  : 0
                const hasMultipleSlides = !!deck && deck.slides.length > 1
                const isExpanded = expandedIds.has(item.id)

                // Dynamic label truncation: when the slide-count badge is shown
                // (active multi-slide item), cut the label further so the badge
                // and the trailing action icons always have room.
                const showsBadge =
                  activeItemIndex === index && hasMultipleSlides
                const labelMaxChars = showsBadge ? 18 : 25
                const displayLabel =
                  item.label.length > labelMaxChars
                    ? `${item.label.slice(0, labelMaxChars)}…`
                    : item.label

                return (
                  <div key={item.id} className="min-w-0 overflow-hidden">
                    <div
                      data-schedule-idx={index}
                      data-schedule-item-id={item.id}
                      className={cn(
                        "group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors",
                        item.type === "header"
                          ? "mt-1 border-b border-border/50 pt-3 pb-2 font-semibold tracking-wider text-muted-foreground uppercase"
                          : selectedItemId === item.id
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        activeItemIndex === index && "ring-1 ring-primary/30",
                        dragOverIndex === index &&
                          "border-t-2 border-t-primary",
                        // Quick-add drop indicator: a line before this row, or
                        // after the last row when appending to the end.
                        externalDropIndex === index &&
                          "border-t-2 border-t-primary",
                        externalDropIndex === itemCount &&
                          index === itemCount - 1 &&
                          "border-b-2 border-b-primary",
                        draggingIndex === index && "opacity-40",
                        item.id === highlightedId &&
                          "animate-pulse border border-amber-500/40 bg-amber-500/15 text-foreground"
                      )}
                      onClick={() => {
                        store.setSelectedItem(item.id)
                        if (item.type !== "header") void store.goToItem(index)
                      }}
                      onDoubleClick={() => {
                        if (item.type !== "header")
                          void store.presentLive(index)
                      }}
                    >
                      <span
                        className="flex touch-none items-center"
                        onPointerDown={(e) => handlePointerDown(e, index)}
                      >
                        <GripVerticalIcon className="size-3 shrink-0 cursor-grab text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing" />
                      </span>
                      {hasMultipleSlides && (
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground transition-transform"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleExpanded(item.id)
                          }}
                        >
                          <ChevronRightIcon
                            className={cn(
                              "size-3 transition-transform",
                              isExpanded && "rotate-90"
                            )}
                          />
                        </button>
                      )}
                      <span className="shrink-0 text-muted-foreground">
                        {TYPE_ICONS[item.type]}
                      </span>
                      <span
                        className="min-w-0 shrink truncate"
                        title={item.label}
                      >
                        {displayLabel}
                      </span>

                      {showsBadge && (
                        <Badge
                          variant="outline"
                          className="shrink-0 px-1 text-[0.5rem] tabular-nums"
                        >
                          {(activeSlideIndex ?? baseSlideIndex) + 1} /{" "}
                          {deck.slides.length}
                        </Badge>
                      )}

                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        {item.type !== "header" && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-6"
                            onClick={(e) => {
                              e.stopPropagation()
                              void store.presentLive(index)
                            }}
                            title="Send to live"
                          >
                            <PlayIcon className="size-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!activeScheduleId) return
                            if (hasMultipleSlides) {
                              if (
                                !window.confirm(
                                  `Remove "${item.label}" (${deck!.slides.length} slides) from schedule?`
                                )
                              )
                                return
                            }
                            store.removeItem(activeScheduleId, item.id)
                            toast("Item removed")
                          }}
                          title="Remove"
                        >
                          <TrashIcon className="size-3" />
                        </Button>
                        {item.type !== "header" && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-6"
                            onClick={(e) => {
                              e.stopPropagation()
                              onEditProperties(item)
                            }}
                            title="Edit properties"
                          >
                            <SettingsIcon className="size-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {isExpanded && hasMultipleSlides && deck && (
                      <SlideStrip
                        slides={deck.slides}
                        activeIndex={
                          activeItemIndex === index
                            ? (activeSlideIndex ?? baseSlideIndex)
                            : -1
                        }
                        onSlideClick={(slideIdx) => {
                          if (activeItemIndex !== index) {
                            void store.goToItem(index)
                          }
                          useScheduleStore.setState({
                            activeSlideIndex: slideIdx,
                          })
                          void store.presentItem(item)
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div
              ref={listRef}
              className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 p-2"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {activeSchedule?.items.map((item, index) => (
                <div
                  key={item.id}
                  data-schedule-idx={index}
                  data-schedule-item-id={item.id}
                  className={cn(
                    "group flex cursor-pointer flex-col overflow-hidden rounded-lg border transition-colors",
                    selectedItemId === item.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50",
                    activeItemIndex === index && "ring-1 ring-primary/30",
                    dragOverIndex === index && "border-2 border-primary",
                    // Quick-add drop indicator: a line before this cell, or
                    // after the last cell when appending to the end.
                    externalDropIndex === index &&
                      "border-t-2 border-t-primary",
                    externalDropIndex === itemCount &&
                      index === itemCount - 1 &&
                      "border-b-2 border-b-primary",
                    draggingIndex === index && "opacity-40",
                    item.id === highlightedId &&
                      "animate-pulse border-amber-500/40 bg-amber-500/15"
                  )}
                  onClick={() => {
                    store.setSelectedItem(item.id)
                    if (item.type !== "header") void store.goToItem(index)
                  }}
                  onDoubleClick={() => {
                    if (item.type !== "header") void store.presentLive(index)
                  }}
                >
                  <div className="relative">
                    <span
                      className="absolute top-1 left-1 z-10 flex touch-none items-center rounded bg-black/40 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        handlePointerDown(e, index)
                      }}
                    >
                      <GripVerticalIcon className="size-3 cursor-grab text-white active:cursor-grabbing" />
                    </span>
                    <ScheduleItemThumbnail item={item} />
                    <div className="absolute right-1 bottom-1 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {item.type !== "header" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-6 rounded bg-black/40 text-white hover:bg-black/60"
                          onClick={(e) => {
                            e.stopPropagation()
                            void store.presentLive(index)
                          }}
                          title="Send to live"
                        >
                          <PlayIcon className="size-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-6 rounded bg-black/40 text-white hover:bg-black/60"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!activeScheduleId) return
                          store.removeItem(activeScheduleId, item.id)
                          toast("Item removed")
                        }}
                        title="Remove"
                      >
                        <TrashIcon className="size-3" />
                      </Button>
                      {item.type !== "header" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-6 rounded bg-black/40 text-white hover:bg-black/60"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditProperties(item)
                          }}
                          title="Edit properties"
                        >
                          <SettingsIcon className="size-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-1.5 py-1">
                    <span className="shrink-0 text-muted-foreground">
                      {TYPE_ICONS[item.type]}
                    </span>
                    <span className="min-w-0 truncate text-[0.625rem] text-foreground">
                      {item.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeSchedule && activeSchedule.items.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Add items using the buttons below
            </p>
          )}

          {!activeSchedule && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Select or create a schedule
            </p>
          )}
        </ScrollArea>
      </div>

      {/* Add item toolbar + transport */}
      {activeSchedule && (
        <div className="border-t border-border">
          <div className="flex items-center gap-1 p-2">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.id}
                variant="ghost"
                size="sm"
                className="h-7 flex-1 gap-1 text-[0.625rem]"
                onClick={() => handleAddAction(action)}
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 border-t border-border px-2 py-1.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => store.prevItem()}
              title="Previous item"
            >
              <SkipBackIcon className="size-3.5" />
            </Button>
            <span className="text-[0.625rem] text-muted-foreground">
              {activeItemIndex !== null ? activeItemIndex + 1 : "—"} /{" "}
              {activeSchedule.items.length}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => store.nextItem()}
              title="Next item"
            >
              <SkipForwardIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={scrollToActiveItem}
              disabled={activeItemIndex === null}
              title="Go to current item"
            >
              <LocateIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all items"
        description={`Remove all ${activeSchedule?.items.length ?? 0} item${
          (activeSchedule?.items.length ?? 0) === 1 ? "" : "s"
        } from "${activeSchedule?.name ?? ""}"? This cannot be undone.`}
        confirmLabel="Clear all"
        onConfirm={() => {
          if (!activeScheduleId) return
          store.clearItems(activeScheduleId)
          toast("Schedule cleared")
        }}
      />
    </div>
  )
}
