import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { useTranslation } from "react-i18next"
import { PanelHeader } from "@/components/ui/panel-header"
import { LevelMeter } from "@/components/ui/level-meter"
import { Button } from "@/components/ui/button"
import { SignInPrompt } from "@/components/ui/sign-in-prompt"
import { TranscriptionBlockedPrompt } from "@/components/ui/transcription-blocked-prompt"
import type { BlockedCopy } from "@/lib/transcription/access"
import { MicIcon, MicOffIcon } from "lucide-react"
import {
  useAudioStore,
  useDetectionStore,
  useQueueStore,
  useBibleStore,
  useBroadcastStore,
  useTranscriptStore,
  useSettingsStore,
  useScheduleStore,
} from "@/stores"
import { useTauriEvent } from "@/hooks/use-tauri-event"
import { useTranscription } from "@/hooks/use-transcription"
import { bibleActions } from "@/hooks/use-bible"
import { toVerseRenderData } from "@/hooks/use-broadcast"
import { toMultiVerseRenderData } from "@/lib/multi-verse"
import { fetchChapter } from "@/services/bible-search-gateway"
import { trackFeatureUsed } from "@/services/analytics-gateway"
import { stepVerseBy, type NavDirection } from "@/lib/search/verse-navigation"
import { liveVerseAnchor } from "@/lib/voice/live-verse-anchor"
import {
  autoPreviewCandidates,
  panelDetections,
  shouldAutoQueue,
} from "@/lib/detection/detection-routing"
import type { DetectionResult, Verse } from "@/types"

/**
 * Payload of the backend `verse_command` event — a spoken command that changes
 * which verse is live. Mirrors the Rust `VerseCommand`: a relative step ("next
 * verse", "skip the next two verses") or an absolute jump ("the third verse",
 * "verse 5"). The verse to act on is resolved here against the live selection.
 */
type VerseCommandPayload =
  | { kind: "relative"; direction: NavDirection; count: number }
  | { kind: "absolute"; verse: number }

/**
 * Payload of the backend `slide_command` event — a spoken command that steps the
 * *schedule* ("next slide", "go back to the previous slide"). Mirrors the Rust
 * `SlideCommand`: intent only (direction + count). The item to act on is resolved
 * in the schedule store against the live selection, never here. Kept disjoint
 * from `verse_command`: slide commands drive the schedule list, not verses.
 */
type SlideCommandPayload = { direction: "next" | "previous"; count: number }

/**
 * Present a verse reached by spoken navigation: reflect it in the book panel and
 * stage it to Program preview — or, when "Voice navigation goes live" is on, push
 * it straight to the audience. Shared by the in-chapter and cross-chapter paths.
 */
function presentNavVerse(verse: Verse) {
  const bible = useBibleStore.getState()
  bibleActions.selectVerse(verse)
  bible.setPendingNavigation({
    bookNumber: verse.book_number,
    chapter: verse.chapter,
    verse: verse.verse,
    focusPanel: false,
  })
  const translation =
    bible.translations.find((t) => t.id === verse.translation_id)
      ?.abbreviation ?? "KJV"
  const bs = useBroadcastStore.getState()
  // Stamp voice-navigation content as AI-originated before taking it live.
  bs.setLiveVerse(toVerseRenderData(verse, translation), "ai")
  if (useSettingsStore.getState().navAutoLive) {
    bs.takeToLive()
  }
}

/**
 * Resolve an absolute verse command ("go to the third verse" == "verse 3") by
 * jumping to that verse number within the loaded chapter. No-op when the chapter
 * has no such verse (a mishearing, or a number past the chapter's length).
 */
async function presentVerseAbsolute(verseNumber: number) {
  const bible = useBibleStore.getState()
  const anchor = liveVerseAnchor(
    useBroadcastStore.getState().liveVerse,
    bible.books,
    bible.activeTranslationId
  )
  if (!anchor) return

  let chapter = bible.currentChapter
  if (
    !chapter.some(
      (verse) =>
        verse.book_number === anchor.book_number &&
        verse.chapter === anchor.chapter
    )
  ) {
    try {
      chapter = await fetchChapter(
        bible.activeTranslationId,
        anchor.book_number,
        anchor.chapter
      )
      useBibleStore.getState().setCurrentChapter(chapter)
    } catch (err) {
      console.error("[VOICE] absolute verse chapter load failed", err)
      return
    }
  }

  const target = chapter.find(
    (verse) =>
      verse.book_number === anchor.book_number &&
      verse.chapter === anchor.chapter &&
      verse.verse === verseNumber
  )
  if (target) presentNavVerse(target)
}

/**
 * Resolve a relative verse command ("next verse", "skip the next two verses").
 * Steps `count` verses from the live selection, following chapter roll-overs by
 * loading each adjacent chapter and continuing with the leftover steps. Stops on
 * the first target that lands, or silently when it runs off the end of the book.
 */
async function presentVerseRelative(direction: NavDirection, count: number) {
  const bible = useBibleStore.getState()
  const anchor = liveVerseAnchor(
    useBroadcastStore.getState().liveVerse,
    bible.books,
    bible.activeTranslationId
  )
  if (!anchor) return

  let currentChapter = bible.currentChapter
  if (
    !currentChapter.some(
      (verse) =>
        verse.book_number === anchor.book_number &&
        verse.chapter === anchor.chapter
    )
  ) {
    try {
      currentChapter = await fetchChapter(
        bible.activeTranslationId,
        anchor.book_number,
        anchor.chapter
      )
      useBibleStore.getState().setCurrentChapter(currentChapter)
    } catch (err) {
      console.error("[VOICE] live verse chapter load failed", err)
      return
    }
  }

  let step = stepVerseBy(anchor, currentChapter, direction, count)

  // Follow chapter boundaries: land on the edge verse of each adjacent chapter,
  // then continue stepping the remainder from there.
  while (step.kind === "cross-chapter") {
    let verses: Verse[]
    try {
      verses = await fetchChapter(
        bible.activeTranslationId,
        step.bookNumber,
        step.chapter
      )
    } catch (err) {
      console.error("[VOICE] verse-command chapter load failed", err)
      return
    }
    if (verses.length === 0) return // ran off the end of the book

    useBibleStore.getState().setCurrentChapter(verses)
    const edge = step.edge === "first" ? verses[0] : verses[verses.length - 1]

    if (step.remaining <= 0) {
      presentNavVerse(edge)
      return
    }
    step = stepVerseBy(edge, verses, direction, step.remaining)
  }

  if (step.kind === "verse") presentNavVerse(step.verse)
}

/**
 * Leaf component that subscribes to the audio level only. Isolated so the
 * high-frequency `audio_level` tick (many times per second during recording)
 * does NOT re-render the transcript list, connection dot, or button subtree.
 */
function AudioLevelMeter() {
  const rms = useAudioStore((s) => s.level.rms)
  return <LevelMeter level={rms} bars={6} />
}

/**
 * Leaf component that subscribes to `currentPartial`. Partials update per audio tick.
 */
function LivePartialLine({
  scrollRef,
}: {
  scrollRef: RefObject<HTMLDivElement | null>
}) {
  const currentPartial = useTranscriptStore((s) => s.currentPartial)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [currentPartial, scrollRef])

  if (!currentPartial) return null

  return (
    <p className="border-l-2 border-primary pl-2 text-base leading-relaxed text-foreground">
      {currentPartial}
      <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-primary align-middle" />
    </p>
  )
}

function detectionToVerse(hit: DetectionResult, translationId: number): Verse {
  return {
    id: 0,
    translation_id: translationId,
    book_number: hit.book_number,
    book_name: hit.book_name,
    book_abbreviation: "",
    chapter: hit.chapter,
    verse: hit.verse,
    text: hit.verse_text,
  }
}

function directVerseRenderData(
  hits: DetectionResult[],
  translationId: number,
  translation: string
) {
  const verses = hits.map((hit) => detectionToVerse(hit, translationId))
  return verses.length === 1
    ? toVerseRenderData(verses[0], translation)
    : toMultiVerseRenderData(verses, translation)
}

/** Stage finalized direct verse references in Program Preview. */
function stageDirectVerses(hits: DetectionResult[]) {
  // Never replace a preview the operator is already auditioning. The detection
  // still appears in the panel and can be queued manually for deliberate selection.
  if (useBroadcastStore.getState().previewPending) return

  const bible = useBibleStore.getState()
  const first = hits[0]
  if (!first) return
  const translation =
    bible.translations.find((t) => t.id === bible.activeTranslationId)
      ?.abbreviation ?? "KJV"
  const bs = useBroadcastStore.getState()
  bs.setLiveVerse(
    directVerseRenderData(hits, bible.activeTranslationId, translation),
    "queue"
  )
  if (first.book_number > 0) {
    bible.setPendingNavigation({
      bookNumber: first.book_number,
      chapter: first.chapter,
      verse: first.verse,
      focusPanel: false,
    })
  }
}

/**
 * Push a finalized direct verse reference straight to Live ("Direct verse to
 * live" is selected. `autoPreviewCandidates` has already screened the
 * references to high-confidence direct hits. The references still auto-queue
 * below when automatic queueing is enabled.
 */
function takeDirectVersesLive(hits: DetectionResult[]) {
  const bible = useBibleStore.getState()
  const first = hits[0]
  if (!first) return
  const translation =
    bible.translations.find((t) => t.id === bible.activeTranslationId)
      ?.abbreviation ?? "KJV"
  bibleActions.selectVerse(detectionToVerse(first, bible.activeTranslationId))
  if (first.book_number > 0) {
    bible.setPendingNavigation({
      bookNumber: first.book_number,
      chapter: first.chapter,
      verse: first.verse,
      focusPanel: false,
    })
  }
  const bs = useBroadcastStore.getState()
  bs.setLiveVerse(
    directVerseRenderData(hits, bible.activeTranslationId, translation),
    "ai"
  )
  bs.takeToLive()
}

export function TranscriptPanel() {
  const { t } = useTranslation("panels")
  const [showSignInPrompt, setShowSignInPrompt] = useState(false)
  const onSignInRequired = useCallback(() => setShowSignInPrompt(true), [])
  const [blockedCopy, setBlockedCopy] = useState<BlockedCopy | null>(null)
  const onBlocked = useCallback((copy: BlockedCopy) => setBlockedCopy(copy), [])
  const {
    segments,
    isTranscribing,
    connectionStatus,
    startTranscription,
    stopTranscription,
  } = useTranscription({ onSignInRequired, onBlocked })
  const hasPartial = useTranscriptStore((s) => s.currentPartial.length > 0)
  const scrollRef = useRef<HTMLDivElement>(null)
  useTauriEvent<{ rms: number; peak: number }>("audio_level", (payload) => {
    useAudioStore.getState().setLevel(payload)
  })

  // Listen for voice translation commands: "read in KJV", "read in Spanish"
  useTauriEvent<{ abbreviation: string; translation_id: number }>(
    "translation_command",
    (data) => {
      useBibleStore.getState().setActiveTranslation(data.translation_id)
      console.log(`[VOICE] Translation switched to ${data.abbreviation}`)
    }
  )

  // Listen for detection results from the backend. The store MERGES each batch
  // into the panel (dedup by verse_ref, re-rank re-detected verses to the top),
  // never replacing wholesale; it also buffers while the operator interacts.
  useTauriEvent<DetectionResult[]>("verse_detections", (detections) => {
    const { directVerseDestination, confidenceThreshold } =
      useSettingsStore.getState()

    // The AI Detections panel shows every DIRECT reference, plus SEMANTIC
    // guesses at or above the operator's confidence floor (the Confidence
    // Threshold slider). This is where sub-floor semantic nearest-neighbour
    // noise is dropped so it never clutters the panel — the slider's only job.
    useDetectionStore
      .getState()
      .addDetections(panelDetections(detections, confidenceThreshold))

    // Record that AI verse detection produced a result at least once this
    // session (deduped in the gateway, so this per-utterance path is cheap).
    if (detections.length > 0) trackFeatureUsed("verse_detection")

    // Finalized direct detections route the full eligible batch by the selected
    // destination: Live sends to the audience, Preview stages for a deliberate
    // take, and Detection leaves the result in the Detections panel only.
    const directHits = autoPreviewCandidates(detections)
    if (directHits.length > 0) {
      if (directVerseDestination === "live") takeDirectVersesLive(directHits)
      else if (directVerseDestination === "preview")
        stageDirectVerses(directHits)
    }

    // Auto-queue detections based on per-source settings
    for (const d of detections) {
      // Check if this detection refines an existing chapter-only queue item
      if (
        !d.is_chapter_only &&
        d.source === "direct" &&
        useQueueStore
          .getState()
          .updateEarlyRef(
            d.book_number,
            d.chapter,
            d.verse,
            d.verse_ref,
            d.verse_text
          )
      ) {
        continue
      }

      // Auto-queue DIRECT references the backend marked auto-queueable (their
      // confidence cleared the auto-queue threshold) so they are staged and
      // ready to send even when auto-preview is off. SEMANTIC hits are
      // panel-only suggestions — they never auto-queue; the operator sends them
      // deliberately from the panel. Detection-panel-only mode applies the same
      // no-automatic-side-effects rule to direct references.
      if (directVerseDestination !== "detection" && shouldAutoQueue(d)) {
        const queue = useQueueStore.getState()
        const dupIdx = d.is_chapter_only
          ? queue.items.findIndex(
              (i) =>
                i.verse.book_number === d.book_number &&
                i.verse.chapter === d.chapter
            )
          : queue.findDuplicate(d.book_number, d.chapter, d.verse)
        if (dupIdx !== -1) {
          const existing = queue.items[dupIdx]
          queue.flashItem(existing.id)
          if (!d.is_chapter_only) queue.setActive(dupIdx)
          continue
        }
        queue.addItem({
          id: crypto.randomUUID(),
          verse: {
            id: 0,
            translation_id: 1,
            book_number: d.book_number,
            book_name: d.book_name,
            book_abbreviation: "",
            chapter: d.chapter,
            verse: d.verse,
            text: d.verse_text,
          },
          reference: d.verse_ref,
          confidence: d.confidence,
          source: d.source === "direct" ? "ai-direct" : "ai-semantic",
          added_at: Date.now(),
          is_chapter_only: d.is_chapter_only,
        })
      }
    }
  })

  // Partial detections populate the AI Detections panel early, but never stage
  // Program Preview or affect Live output. Semantic previews remain useful as
  // panel-only suggestions, but direct partials are intentionally excluded:
  // Soniox may revise `John 3:1` into `John 3:11`, and both would otherwise be
  // retained as separate direct history entries. Final direct detections still
  // arrive through the authoritative `verse_detections` event above.
  useTauriEvent<DetectionResult[]>("verse_detections_partial", (detections) => {
    const { confidenceThreshold } = useSettingsStore.getState()
    const semanticPreviews = detections.filter(
      (detection) => detection.source === "semantic"
    )
    useDetectionStore
      .getState()
      .addDetections(panelDetections(semanticPreviews, confidenceThreshold))
  })

  // Spoken verse commands ("next verse", "skip the next two verses", "go to the
  // third verse", "verse 5"): the backend classifies only the *intent* — a
  // relative step or an absolute verse number. The anchor is the verse currently
  // selected on the program screen, so this works no matter how that verse got
  // there — a spoken reference, a manual book-panel pick, or a queue take. The
  // resolved verse is staged to Program preview, or pushed
  // live when "Voice navigation goes live" (navAutoLive) is on.
  useTauriEvent<VerseCommandPayload>("verse_command", (payload) => {
    if (payload.kind === "absolute") {
      void presentVerseAbsolute(payload.verse)
    } else {
      void presentVerseRelative(payload.direction, payload.count)
    }
  })

  // Spoken schedule commands ("next slide", "go back to the previous slide"):
  // the backend classifies intent only (direction + count). The store anchors on
  // the active schedule item/sub-slide and steps it, so this works no matter how
  // that slide got there — an arrow key, a click, Go Live, or a prior command.
  // The stepped slide is staged to Program preview, or pushed live when "Schedule
  // voice navigation goes live" (scheduleNavAutoLive) is on. Independent of
  // verse_command above — this drives the schedule list, not verses.
  useTauriEvent<SlideCommandPayload>("slide_command", (payload) => {
    const { scheduleNavAutoLive } = useSettingsStore.getState()
    void useScheduleStore
      .getState()
      .stepSlideByVoice(payload.direction, payload.count, scheduleNavAutoLive)
  })

  // Auto-scroll on segment additions. Partial-driven scrolling lives in
  // LivePartialLine so the panel doesn't re-render per audio tick.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [segments])

  return (
    <div
      data-slot="transcript-panel"
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <PanelHeader
        title={t("transcript.title")}
        icon={<MicIcon className="size-3" />}
      >
        <div className="flex items-end gap-2 pb-px">
          {isTranscribing && (
            <span
              className={`mb-1 size-1.5 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-emerald-500"
                  : connectionStatus === "connecting"
                    ? "animate-pulse bg-amber-500"
                    : connectionStatus === "error"
                      ? "bg-red-500"
                      : "bg-muted-foreground/40"
              }`}
              title={connectionStatus}
            />
          )}
          <AudioLevelMeter />
        </div>
      </PanelHeader>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2 p-3">
          {/* Faded top gradient */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-linear-to-b from-card to-transparent" />

          {segments.length === 0 && !hasPartial && !isTranscribing && (
            <p className="text-sm text-muted-foreground">
              {t("transcript.empty")}
            </p>
          )}

          {/* Final segments — recent ones brighter, older ones fade */}
          {segments.map((seg, idx) => {
            const distFromEnd = segments.length - 1 - idx
            const opacity =
              distFromEnd === 0
                ? "text-foreground/80"
                : distFromEnd === 1
                  ? "text-foreground/60"
                  : distFromEnd <= 3
                    ? "text-foreground/40"
                    : "text-foreground/25"
            return (
              <p
                key={seg.id}
                className={`text-sm leading-relaxed transition-colors duration-300 ${opacity}`}
              >
                {seg.text}
              </p>
            )
          })}

          {/* Partial (in-progress) text rendered by leaf subscriber */}
          <LivePartialLine scrollRef={scrollRef} />
        </div>
      </div>

      {/* Bottom control */}
      <div className="flex gap-2 border-t border-border px-3 py-2">
        {isTranscribing ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            title={t("transcript.stopTitle")}
            onClick={stopTranscription}
          >
            <MicOffIcon className="size-3" />
            {t("transcript.stop")}
          </Button>
        ) : connectionStatus === "connecting" ? (
          <Button
            variant="ghost"
            size="sm"
            disabled
            title={t("transcript.startingTitle")}
          >
            <MicIcon className="size-3" />
            {t("transcript.starting")}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            title={t("transcript.startTitle")}
            onClick={startTranscription}
          >
            <MicIcon className="size-3" />
            {t("transcript.start")}
          </Button>
        )}
      </div>

      <SignInPrompt
        open={showSignInPrompt}
        onOpenChange={setShowSignInPrompt}
      />

      <TranscriptionBlockedPrompt
        open={blockedCopy !== null}
        onOpenChange={(open) => {
          if (!open) setBlockedCopy(null)
        }}
        title={blockedCopy?.title ?? ""}
        message={blockedCopy?.message ?? ""}
      />
    </div>
  )
}
