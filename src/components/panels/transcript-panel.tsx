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
import { fetchChapter } from "@/services/bible-search-gateway"
import { trackFeatureUsed } from "@/services/analytics-gateway"
import { stepVerseBy, type NavDirection } from "@/lib/search/verse-navigation"
import {
  evaluateInstantDisplay,
  initialInstantDisplayState,
  wasRecentlyDisplayed,
} from "@/lib/detection/instant-display"
import { aiMayTakeLive } from "@/lib/detection/manual-live-guard"
import {
  MIN_DIRECT_LIVE_CONFIDENCE,
  panelDetections,
  shouldAutoDisplayLive,
  shouldAutoQueue,
} from "@/lib/detection/detection-routing"
import type { DetectionResult, ReadingAdvance, Verse } from "@/types"

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
  // Stamp source "ai" so the manual-live guard can tell this from operator-placed
  // content (aitrans Phase 4). A voice command is a deliberate, high-trust call,
  // so it is allowed to override even operator-placed live (decision D).
  bs.setLiveVerse(toVerseRenderData(verse, translation), "ai")
  if (
    useSettingsStore.getState().navAutoLive &&
    aiMayTakeLive(bs.broadcastSource, false)
  ) {
    bs.takeToLive()
  }
}

/**
 * Resolve an absolute verse command ("go to the third verse" == "verse 3") by
 * jumping to that verse number within the loaded chapter. No-op when the chapter
 * has no such verse (a mishearing, or a number past the chapter's length).
 */
function presentVerseAbsolute(verseNumber: number) {
  const { currentChapter } = useBibleStore.getState()
  const target = currentChapter.find((v) => v.verse === verseNumber)
  if (target) presentNavVerse(target)
}

/**
 * Resolve a relative verse command ("next verse", "skip the next two verses").
 * Steps `count` verses from the live selection, following chapter roll-overs by
 * loading each adjacent chapter and continuing with the leftover steps. Stops on
 * the first target that lands, or silently when it runs off the end of the book.
 */
async function presentVerseRelative(direction: NavDirection, count: number) {
  const { selectedVerse, currentChapter, activeTranslationId } =
    useBibleStore.getState()

  let step = stepVerseBy(selectedVerse, currentChapter, direction, count)

  // Follow chapter boundaries: land on the edge verse of each adjacent chapter,
  // then continue stepping the remainder from there.
  while (step.kind === "cross-chapter") {
    let verses: Verse[]
    try {
      verses = await fetchChapter(
        activeTranslationId,
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

/**
 * Push a detected DIRECT verse reference to the audience: reflect it in the book
 * search (releasing any prior pin, without grabbing the arrow keys) and commit
 * it live. Shared by the finals handler and the instant (partial) path so both
 * display identically.
 */
function displayDirectVerse(hit: DetectionResult) {
  const verse: Verse = {
    id: 0,
    translation_id: useBibleStore.getState().activeTranslationId,
    book_number: hit.book_number,
    book_name: hit.book_name,
    book_abbreviation: "",
    chapter: hit.chapter,
    verse: hit.verse,
    text: hit.verse_text,
  }
  bibleActions.selectVerse(verse)
  useBibleStore.getState().setPendingNavigation({
    bookNumber: hit.book_number,
    chapter: hit.chapter,
    verse: hit.verse,
    focusPanel: false,
  })
  const translation =
    useBibleStore
      .getState()
      .translations.find((t) => t.id === verse.translation_id)?.abbreviation ??
    "KJV"
  const bs = useBroadcastStore.getState()
  // Stamp source "ai" so the manual-live guard distinguishes an AI take from an
  // operator take (aitrans Phase 4). The finals/instant callers already exclude
  // narrative mentions upstream, so a hit reaching here is high-trust and takes;
  // the guard is defence-in-depth so a low-trust hit could never clobber
  // operator-placed live (decision D).
  bs.setLiveVerse(toVerseRenderData(verse, translation), "ai")
  if (aiMayTakeLive(bs.broadcastSource, hit.narrative_mention === true)) {
    bs.takeToLive()
  }
}

/**
 * Consecutive interim transcripts a direct reference must appear in before the
 * "instant direct display" path puts it live. 1 = fire on the first complete
 * detection (truly instant). A partial reference like "John 3" is already
 * excluded upstream (it's chapter-only), so the intermediate never flashes; the
 * only residual risk is a mid-word number revision (rare), which the final
 * reconciles.
 */
const INSTANT_STABILITY_PARTIALS = 1

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
  // Stability + cooldown bookkeeping for the instant (partial) direct-display
  // path. Held in a ref so it persists across transcript events without
  // re-rendering; the finals handler reads it to avoid re-taking a verse the
  // partial path already put live.
  const instantRef = useRef(initialInstantDisplayState())

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
    const { directAutoDisplay, confidenceThreshold, cooldownMs } =
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

    // "Direct verse auto-display" gates whether a spoken reference is pushed to
    // the audience automatically. Only DIRECT references qualify — semantic
    // meaning-matches are panel-only and must never take the screen on their own
    // (`shouldAutoDisplayLive` also excludes chapter-only stubs and narrative
    // mentions). Its live-confidence guard is fixed and independent of the panel
    // slider, so surfacing more low-confidence suggestions can never weaken it.
    const directHit = detections.find((d) => shouldAutoDisplayLive(d))
    if (directAutoDisplay && directHit) {
      // Reconcile with the instant (partial) path: if that already put this
      // exact verse live from an interim, don't re-take it (would replay the
      // take). A genuinely revised reference (different verse) still displays.
      const alreadyLive = wasRecentlyDisplayed(
        instantRef.current,
        directHit.verse_ref,
        Date.now(),
        cooldownMs
      )
      if (!alreadyLive) displayDirectVerse(directHit)
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
      // ready to send even when auto-display is off. SEMANTIC hits are
      // panel-only suggestions — they never auto-queue; the operator sends them
      // deliberately from the panel.
      if (shouldAutoQueue(d)) {
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

  // Partial detections: a spoken reference detected mid-utterance (before the
  // transcript's final arrives). Always populate the AI Detections panel early
  // so the verse is available seconds sooner. Additionally, when "Instant direct
  // display" is on, put a COMPLETE + STABLE *direct* reference live straight from
  // the interim stream — removing the ~1-2s wait for the final. Semantic
  // detections are excluded (genuine guesses that need the full sentence); auto-
  // queue also stays finals-only.
  useTauriEvent<DetectionResult[]>("verse_detections_partial", (detections) => {
    const {
      directAutoDisplay,
      directInstantDisplay,
      confidenceThreshold,
      cooldownMs,
    } = useSettingsStore.getState()
    useDetectionStore
      .getState()
      .addDetections(panelDetections(detections, confidenceThreshold))
    // PHASE 3: narrative mentions never drive the instant display either (the
    // Obadiah hit actually fired from a partial). They still populate the panel
    // via addDetections above.
    const directHit = detections.find(
      (d) =>
        d.source === "direct" &&
        !d.is_chapter_only &&
        d.book_number > 0 &&
        !d.narrative_mention
    )
    if (!directHit) return

    const decision = evaluateInstantDisplay(
      instantRef.current,
      directHit.verse_ref,
      directHit.confidence,
      {
        enabled: directAutoDisplay && directInstantDisplay,
        // Fixed live-output guard, not the panel slider: a spoken reference
        // only goes live when the parse is genuinely confident, regardless of
        // how low the operator sets the panel's suggestion floor.
        confidenceThreshold: MIN_DIRECT_LIVE_CONFIDENCE,
        cooldownMs,
        stabilityCount: INSTANT_STABILITY_PARTIALS,
        now: Date.now(),
      }
    )
    instantRef.current = decision.state
    if (decision.display) displayDirectVerse(directHit)
  })

  // Reading mode navigation: auto-navigate book panel when reading mode
  // advances to a new verse (chapter commands, verse commands, text matching).
  // Does NOT add to queue — only direct/semantic feed the queue.
  useTauriEvent<ReadingAdvance>("reading_mode_verse", (advance) => {
    if (advance.book_number > 0) {
      bibleActions.selectVerse({
        id: 0,
        translation_id: useBibleStore.getState().activeTranslationId,
        book_number: advance.book_number,
        book_name: advance.book_name,
        book_abbreviation: "",
        chapter: advance.chapter,
        verse: advance.verse,
        text: advance.verse_text,
      })
      useBibleStore.getState().setPendingNavigation({
        bookNumber: advance.book_number,
        chapter: advance.chapter,
        verse: advance.verse,
      })
    }
  })

  // Spoken verse commands ("next verse", "skip the next two verses", "go to the
  // third verse", "verse 5"): the backend classifies only the *intent* — a
  // relative step or an absolute verse number. The anchor is the verse currently
  // selected on the program screen, so this works no matter how that verse got
  // there — a spoken reference, a manual book-panel pick, a queue take, or
  // reading mode. The resolved verse is staged to Program preview, or pushed
  // live when "Voice navigation goes live" (navAutoLive) is on.
  useTauriEvent<VerseCommandPayload>("verse_command", (payload) => {
    if (payload.kind === "absolute") {
      presentVerseAbsolute(payload.verse)
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
