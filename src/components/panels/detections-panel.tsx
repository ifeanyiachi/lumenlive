import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { PanelHeader } from "@/components/ui/panel-header"
import { ConfidenceDot } from "@/components/ui/confidence-dot"
import { Button } from "@/components/ui/button"
import { EyeIcon, PlayIcon, PlusIcon } from "lucide-react"
import { detectionActions } from "@/hooks/use-detection"
import { useQueueStore, useBibleStore, useDetectionStore } from "@/stores"
import { presentDetectionLive, previewDetection } from "@/hooks/use-broadcast"
import { useCan } from "@/stores/entitlements-store"
import { requireFeature } from "@/components/entitlements/require-feature"
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
  direct: { bg: "bg-green-500/15", text: "text-green-600", label: "Direct" },
  semantic: {
    bg: "bg-indigo-500/15",
    text: "text-indigo-300",
    label: "Semantic",
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
            : () => requireFeature("detection_actions", "AI detection actions")
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
      <PanelHeader title={t("detections.title")}>
        <button
          onClick={() => detectionActions.clearDetections()}
          className="text-[0.625rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("detections.clearAll")}
        </button>
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
            className="sticky top-0 z-10 w-full border-b border-indigo-500/20 bg-indigo-500/15 px-3 py-1.5 text-center text-xs font-medium text-indigo-300 backdrop-blur-sm transition-colors hover:bg-indigo-500/25"
          >
            {t("detections.pending", { count: pendingCount })}
          </button>
        )}
        <div className="flex flex-col gap-0">
          {detections.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {t("detections.empty")}
            </p>
          )}
          {detections.map((detection, i) => (
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
