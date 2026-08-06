import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { MonitorPlayIcon, ListPlusIcon } from "lucide-react"
import { toast } from "sonner"
import type { Verse, OriginalWord, LexiconEntry } from "@/types"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useBroadcastStore } from "@/stores"
import { useScheduleStore } from "@/stores/schedule-store"
import {
  buildLexiconSlide,
  buildLexiconScheduleItem,
} from "@/lib/lexicon-slide"
import { decodePartOfSpeech } from "@/lib/morph"
import { chipEnglishWord } from "@/lib/lexicon-gloss"

interface LexiconBarProps {
  verse: Verse
}

export function LexiconBar({ verse }: LexiconBarProps) {
  const [words, setWords] = useState<OriginalWord[]>([])
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState(false)
  // Shared lexicon cache so repeated word clicks don't re-fetch
  const [lexCache] = useState(() => new Map<string, LexiconEntry>())

  const isHebrew = verse.book_number <= 39
  const reference = `${verse.book_name} ${verse.chapter}:${verse.verse}`

  useEffect(() => {
    // Reset to the loading state for the newly selected verse before fetching.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true)
    setEmpty(false)
    setWords([])
    /* eslint-enable react-hooks/set-state-in-effect */
    invoke<OriginalWord[]>("get_verse_words", {
      bookNumber: verse.book_number,
      chapter: verse.chapter,
      verse: verse.verse,
      // Pass the English text so each word can be aligned to its in-context
      // English word (shown as the chip's first line).
      englishText: verse.text,
    })
      .then((result) => {
        setWords(result)
        setEmpty(result.length === 0)
        setLoading(false)
      })
      .catch((err) => {
        console.error("[LexiconBar] get_verse_words:", err)
        setEmpty(true)
        setLoading(false)
      })
  }, [verse.book_number, verse.chapter, verse.verse, verse.text])

  async function fetchEntry(strongNum: string): Promise<LexiconEntry | null> {
    if (lexCache.has(strongNum)) return lexCache.get(strongNum) ?? null
    try {
      const entry = await invoke<LexiconEntry | null>("get_lexicon_entry", {
        strongNumber: strongNum,
      })
      if (entry) lexCache.set(strongNum, entry)
      return entry ?? null
    } catch {
      return null
    }
  }

  if (loading) {
    return (
      <div className="flex gap-1.5 overflow-x-auto pt-2 pb-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-[68px] w-14 shrink-0 animate-pulse rounded-md bg-muted"
          />
        ))}
      </div>
    )
  }

  if (empty) {
    return (
      <p className="pt-2 text-xs text-muted-foreground italic">
        No {isHebrew ? "Hebrew" : "Greek"} interlinear data. Run{" "}
        <code className="rounded bg-muted px-1">bun run setup:lexicon</code> to
        import it.
      </p>
    )
  }

  return (
    <div
      className="flex gap-1.5 overflow-x-auto pt-2 pb-1"
      dir={isHebrew ? "rtl" : "ltr"}
    >
      {words.map((w) => (
        <WordChip
          key={w.position}
          word={w}
          isHebrew={isHebrew}
          reference={reference}
          fetchEntry={fetchEntry}
        />
      ))}
    </div>
  )
}

interface WordChipProps {
  word: OriginalWord
  isHebrew: boolean
  reference: string
  fetchEntry: (strong: string) => Promise<LexiconEntry | null>
}

function WordChip({ word, isHebrew, reference, fetchEntry }: WordChipProps) {
  const [entry, setEntry] = useState<LexiconEntry | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const activeScheduleId = useScheduleStore((s) => s.activeScheduleId)

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next && entry === undefined && word.strong_number) {
      const result = await fetchEntry(word.strong_number)
      setEntry(result ?? null)
    }
  }

  function handleGoLive() {
    useBroadcastStore
      .getState()
      .setLiveSlide(
        buildLexiconSlide(word, entry ?? null, reference, isHebrew),
        "manual"
      )
    toast.success(`Projecting ${word.word}`)
    setOpen(false)
  }

  function handleAddToSchedule() {
    const scheduleStore = useScheduleStore.getState()
    const scheduleId = scheduleStore.activeScheduleId
    if (!scheduleId) {
      toast.error("Select or create a schedule first")
      return
    }
    const schedule = scheduleStore.getActiveSchedule()
    const item = buildLexiconScheduleItem(
      word,
      entry ?? null,
      reference,
      isHebrew,
      schedule?.items.length ?? 0
    )
    const added = scheduleStore.addItem(scheduleId, item)
    if (added) toast.success(`Added ${word.word} to schedule`)
    else toast.info("Already in the schedule")
    setOpen(false)
  }

  // Chip content is always Latin script (English word / transliteration /
  // Strong's), so it renders left-to-right even inside the RTL Hebrew strip —
  // otherwise the English text would be laid out right-to-left.
  const englishWord = chipEnglishWord(word, isHebrew)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          dir="ltr"
          className={cn(
            "flex shrink-0 cursor-pointer flex-col items-center gap-0.5 rounded-md border border-border bg-card px-2 py-1.5 transition-colors",
            "max-w-[120px] min-w-[56px] hover:border-primary/50 hover:bg-primary/5",
            open && "border-primary/50 bg-primary/5"
          )}
        >
          {englishWord && (
            <span
              className="line-clamp-2 text-center text-[11px] leading-tight font-medium text-foreground"
              title={englishWord}
            >
              {englishWord}
            </span>
          )}
          {word.translit && (
            <span className="text-[10px] leading-none text-muted-foreground italic">
              {word.translit}
            </span>
          )}
          {word.strong_number && (
            <span className="rounded bg-primary/20 px-1 py-0.5 font-mono text-[9px] text-primary">
              {word.strong_number}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent side="top" align="center" className="w-72">
        {!word.strong_number ? (
          <p className="text-xs text-muted-foreground">
            No Strong's number for this word.
          </p>
        ) : entry === undefined ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !entry ? (
          <p className="text-xs text-muted-foreground">
            No definition found for {word.strong_number}.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-base leading-tight font-medium">
                  {entry.lemma ?? word.word}
                </p>
                {entry.translit && (
                  <p className="text-xs text-muted-foreground italic">
                    {entry.translit}
                  </p>
                )}
                {entry.pronunciation && (
                  <p className="text-xs text-muted-foreground">
                    {entry.pronunciation}
                  </p>
                )}
                {decodePartOfSpeech(word.morph, isHebrew) && (
                  <p className="text-xs text-muted-foreground">
                    {decodePartOfSpeech(word.morph, isHebrew)}
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded bg-primary/20 px-1.5 py-0.5 font-mono text-xs text-primary">
                {word.strong_number}
              </span>
            </div>
            {entry.definition && (
              <div>
                <p className="mb-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Definition
                </p>
                <p className="text-xs">{entry.definition}</p>
              </div>
            )}
            {entry.kjv_usage && (
              <div>
                <p className="mb-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  KJV Usage
                </p>
                <p className="text-xs text-muted-foreground">
                  {entry.kjv_usage}
                </p>
              </div>
            )}
            {entry.derivation && (
              <div>
                <p className="mb-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Word Origin
                </p>
                <p className="text-xs text-muted-foreground">
                  {entry.derivation}
                </p>
              </div>
            )}
            <div className="mt-1 flex gap-1.5 border-t border-border pt-2">
              <Button
                size="sm"
                className="h-7 flex-1 gap-1.5 bg-primary text-xs text-primary-foreground hover:bg-primary/90"
                onClick={handleGoLive}
              >
                <MonitorPlayIcon className="size-3" />
                Go Live
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 flex-1 gap-1.5 text-xs"
                onClick={handleAddToSchedule}
                disabled={!activeScheduleId}
                title={
                  activeScheduleId
                    ? "Add this Lexical Summary to the schedule"
                    : "Select or create a schedule first"
                }
              >
                <ListPlusIcon className="size-3" />
                Add to Schedule
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
