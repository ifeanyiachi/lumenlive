import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { PanelHeader } from "@/components/ui/panel-header"
import { ConfidenceDot } from "@/components/ui/confidence-dot"
import { Button } from "@/components/ui/button"
import {
  EyeIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { detectionActions } from "@/hooks/use-detection"
import { useQueueStore, useBibleStore, useDetectionStore } from "@/stores"
import { presentDetectionLive, previewDetection } from "@/hooks/use-broadcast"
import { useCan } from "@/stores/entitlements-store"
import { requireFeature } from "@/components/entitlements/require-feature"
import { cn } from "@/lib/utils"
import type { DetectionResult } from "@/types"

// While the operator interacts with the panel it pauses (buffers) updates so
// the list doesn't reorder under the cursor. Auto-resume fires only once the
// cursor has LEFT the panel and this many ms pass with no scroll/hover — any
// interaction resets the timer.
const RESUME_IDLE_MS = 5000

const SOURCE_COLORS: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  direct: { bg: "bg-ai-direct/15", text: "text-ai-direct", label: "Direct" },
  semantic: {
    bg: "bg-ai-semantic/15",
    text: "text-ai-semantic",
    label: "Semantic",
  },
}

type DetectionFilter = "all" | DetectionResult["source"]

const DETECTION_FILTERS: readonly DetectionFilter[] = [
  "all",
  "direct",
  "semantic",
]

const FILTER_STYLES: Record<DetectionFilter, { active: string }> = {
  all: {
    active: "bg-background text-foreground shadow-sm",
  },
  direct: {
    active: "bg-ai-direct/15 text-ai-direct shadow-sm",
  },
  semantic: {
    active: "bg-ai-semantic/15 text-ai-semantic shadow-sm",
  },
}

function SourceBadge({ source }: { source: string }) {
  const { t } = useTranslation("panels")
  const style = SOURCE_COLORS[source] ?? {
    bg: "bg-muted",
    text: "text-muted-foreground",
    label: source,
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[0.5625rem] font-medium tracking-wider uppercase ${style.bg} ${style.text}`}
    >
      {source in SOURCE_COLORS ? t(`detections.${source}`) : style.label}
    </span>
  )
}

function DetectionCard({ detection }: { detection: DetectionResult }) {
  const { t } = useTranslation("panels")
  // Acting on a detection (Present / Preview / Queue) is a paid capability: Free
  // still SEES the detections stream but can't push them anywhere. The buttons
  // render disabled and a click anywhere on the row's action group raises the
  // upgrade prompt instead (disabled buttons pass the click to the wrapper).
  const canActions = useCan("detection_actions")
  // Present goes straight to the audience for AI detections (the one exception
  // to the stage-then-take flow); it also mirrors the verse into selection/search.
  const handlePresent = () => presentDetectionLive(detection)
  // Preview stages the verse into the Program preview without going live.
  const handlePreview = () => previewDetection(detection)

  return (
    <div className="border-b border-border p-3 last:border-0">
      <div className="flex items-center gap-2">
        <ConfidenceDot confidence={detection.confidence} />
        <SourceBadge source={detection.source} />
        <span className="text-sm font-semibold text-foreground">
          {detection.verse_ref}
        </span>
      </div>

      {detection.verse_text && (
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {detection.verse_text}
        </p>
      )}

      <div
        className="mt-2 flex gap-2"
        onClick={
          canActions
            ? undefined
            : () =>
                requireFeature(
                  "detection_actions",
                  "AI detection actions",
                  handlePresent
                )
        }
      >
        <Button
          size="sm"
          className="gap-1"
          onClick={handlePresent}
          disabled={!canActions}
        >
          <PlayIcon className="size-3" />
          {t("detections.present")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={handlePreview}
          disabled={!canActions}
        >
          <EyeIcon className="size-3" />
          {t("detections.preview")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={!canActions}
          onClick={() => {
            useQueueStore.getState().addItem({
              id: crypto.randomUUID(),
              verse: {
                id: 0,
                translation_id: useBibleStore.getState().activeTranslationId,
                book_number: detection.book_number,
                book_name: detection.book_name,
                book_abbreviation: "",
                chapter: detection.chapter,
                verse: detection.verse,
                text: detection.verse_text,
              },
              reference: detection.verse_ref,
              confidence: detection.confidence,
              source:
                detection.source === "direct" ? "ai-direct" : "ai-semantic",
              added_at: Date.now(),
            })
          }}
        >
          <PlusIcon className="size-3" />
          {t("detections.queue")}
        </Button>
      </div>
    </div>
  )
}

export function DetectionsPanel() {
  const { t } = useTranslation("panels")
  const detections = useDetectionStore((s) => s.detections)
  const pendingCount = useDetectionStore((s) => s.pendingCount)
  const [activeFilter, setActiveFilter] = useState<DetectionFilter>("all")

  const visibleDetections =
    activeFilter === "all"
      ? detections
      : detections.filter((detection) => detection.source === activeFilter)

  const scrollRef = useRef<HTMLDivElement>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoveringRef = useRef(false)

  const clearIdle = () => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current)
      idleTimer.current = null
    }
  }
  // Arm the auto-resume: flush the buffer after RESUME_IDLE_MS of inactivity,
  // but only if the cursor is still away (guards against a stray timer firing
  // mid-read if the operator moved back over the panel).
  const armIdle = () => {
    clearIdle()
    idleTimer.current = setTimeout(() => {
      if (!hoveringRef.current) useDetectionStore.getState().resume()
    }, RESUME_IDLE_MS)
  }

  // Clear any pending timer on unmount.
  useEffect(() => clearIdle, [])

  const handleEnter = () => {
    hoveringRef.current = true
    clearIdle()
    useDetectionStore.getState().pause()
  }
  const handleLeave = () => {
    hoveringRef.current = false
    armIdle()
  }
  const handleScroll = () => {
    useDetectionStore.getState().pause()
    // Scroll without hover (e.g. trackpad fling as the cursor exits) still
    // arms auto-resume; scroll while hovering waits for the cursor to leave.
    if (!hoveringRef.current) armIdle()
  }
  const flushNow = () => {
    clearIdle()
    useDetectionStore.getState().resume()
    scrollRef.current?.scrollTo({ top: 0 })
  }

  return (
    <div
      data-slot="detections-panel"
      className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <PanelHeader title={t("detections.title")} className="gap-2">
        <div
          aria-label={t("detections.filterLabel")}
          className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5"
          role="group"
        >
          {DETECTION_FILTERS.map((filter) => {
            const style = FILTER_STYLES[filter]
            const label =
              filter === "all" ? t("detections.all") : t(`detections.${filter}`)

            return (
              <button
                key={filter}
                type="button"
                aria-pressed={activeFilter === filter}
                aria-label={t("detections.filterBy", { source: label })}
                className={cn(
                  "rounded px-1.5 py-1 text-[0.5625rem] font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  activeFilter === filter
                    ? style.active
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setActiveFilter(filter)}
              >
                {label}
              </button>
            )
          })}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => detectionActions.clearDetections()}
          aria-label={t("detections.clearAll")}
          title={t("detections.clearAll")}
          className="text-muted-foreground hover:text-foreground"
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </PanelHeader>

      <div
        ref={scrollRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {pendingCount > 0 && (
          <button
            onClick={flushNow}
            className="sticky top-0 z-10 w-full border-b border-primary/20 bg-primary/10 px-3 py-1.5 text-center text-xs font-medium text-primary backdrop-blur-sm transition-colors hover:bg-primary/20"
          >
            {t("detections.pending", { count: pendingCount })}
          </button>
        )}
        <div className="flex flex-col gap-0">
          {visibleDetections.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {detections.length === 0
                ? t("detections.empty")
                : t("detections.emptyFiltered", {
                    source:
                      activeFilter === "all"
                        ? t("detections.all")
                        : t(`detections.${activeFilter}`),
                  })}
            </p>
          )}
          {visibleDetections.map((detection, i) => (
            <DetectionCard
              key={`${detection.verse_ref}-${i}`}
              detection={detection}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
