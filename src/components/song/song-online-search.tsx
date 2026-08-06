import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  SearchIcon,
  Loader2Icon,
  DownloadIcon,
  PlusIcon,
  MusicIcon,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSongStore } from "@/stores/song-store"
import { useSettingsStore } from "@/stores/settings-store"
import {
  searchOnlineLyrics,
  fetchOnlineLyrics,
} from "@/services/song-search-gateway"
import { importOnlineSong } from "@/lib/song/import/from-online"
import type { LyricsContent, LyricsHit } from "@/types/lyrics"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Provider ids → display labels for the source badge. */
const SOURCE_LABELS: Record<string, string> = {
  lrclib: "LRCLIB",
  genius: "Genius",
}

const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s

const PREVIEW_LINES = 26

/**
 * Search public lyric sources and add a result to the library. A two-pane
 * browser: the fan-out search fills the results list (left); selecting a hit
 * fetches its full lyrics into the preview pane (right), where "Import to
 * Library" parses them into sections (`importOnlineSong`) and selects the song
 * so its detail page opens.
 * Fetched lyrics are cached per hit so re-selecting is instant and Import reuses
 * the preview without a second round-trip.
 */
export function SongOnlineSearchDialog({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<LyricsHit[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [preview, setPreview] = useState<LyricsContent | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const [importing, setImporting] = useState(false)
  const cache = useRef<Map<number, LyricsContent>>(new Map())
  // Monotonic id so a slow earlier search can't overwrite a newer one's results
  // (real-time typing fires overlapping requests).
  const searchSeq = useRef(0)

  const reset = () => {
    setQuery("")
    setHits(null)
    setSelected(null)
    setPreview(null)
    setPreviewError(false)
    setImporting(false)
    cache.current.clear()
    searchSeq.current++
  }

  const runSearch = async (raw: string) => {
    const q = raw.trim()
    if (q.length < 2) {
      searchSeq.current++
      setSearching(false)
      setHits(null)
      setSelected(null)
      return
    }
    const seq = ++searchSeq.current
    setSearching(true)
    cache.current.clear()
    try {
      // Genius search needs an access key; read it at call time (not subscribed)
      // so a key added mid-session takes effect on the next keystroke.
      const geniusToken = useSettingsStore.getState().geniusApiKey
      const res = await searchOnlineLyrics(q, undefined, geniusToken)
      if (seq !== searchSeq.current) return // a newer search superseded this one
      setHits(res.hits)
      setSelected(res.hits.length > 0 ? 0 : null)
      for (const err of res.errors) {
        console.warn(`[lyrics] ${err.source}: ${err.message}`)
      }
    } catch (e) {
      if (seq === searchSeq.current) {
        toast.error("Online search failed")
        console.error(e)
      }
    } finally {
      if (seq === searchSeq.current) setSearching(false)
    }
  }

  // Real-time search: debounce keystrokes (350ms) so a search fires as the user
  // types, without a button press. The cleanup cancels the pending timer, and
  // `searchSeq` discards any in-flight response the next keystroke supersedes.
  useEffect(() => {
    const handle = setTimeout(() => void runSearch(query), 350)
    return () => clearTimeout(handle)
  }, [query])

  // Load the selected hit's full lyrics into the preview pane (cached per hit).
  // When there's no selection the preview isn't rendered (see `activeHit`), so
  // we simply don't run — no need to clear state from inside the effect.
  useEffect(() => {
    if (selected === null || !hits) return
    const cached = cache.current.get(selected)
    if (cached) {
      setPreview(cached)
      setPreviewError(false)
      setPreviewLoading(false)
      return
    }
    let cancelled = false
    setPreview(null)
    setPreviewError(false)
    setPreviewLoading(true)
    fetchOnlineLyrics(hits[selected])
      .then((content) => {
        if (cancelled) return
        cache.current.set(selected, content)
        setPreview(content)
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected, hits])

  const importSelected = async () => {
    if (selected === null || !hits) return
    setImporting(true)
    try {
      const content =
        cache.current.get(selected) ?? (await fetchOnlineLyrics(hits[selected]))
      const song = importOnlineSong(content)
      const store = useSongStore.getState()
      store.addSong(song)
      // Land on the song's detail page (selection drives the right pane);
      // deliberately NOT opening the full-screen editor.
      store.setSelectedSong(song.id)
      toast.success(`Imported "${song.title}"`)
      onOpenChange(false)
      reset()
    } catch (e) {
      toast.error("Could not import those lyrics")
      console.error(e)
      setImporting(false)
    }
  }

  const activeHit = selected !== null && hits ? hits[selected] : null
  // When the lyrics fetch failed and the hit carries no embedded lyrics
  // (only LRCLIB embeds them in search results), Import would repeat the exact
  // request that just failed — disable it instead of promising it might work.
  const importUnavailable =
    previewError &&
    activeHit !== null &&
    !activeHit.plainLyrics &&
    !activeHit.syncedLyrics

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="flex h-[80vh] max-h-[680px] w-[92vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {/* Search header */}
        <div className="border-b border-border px-5 pt-5 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DownloadIcon className="size-4" />
              Search Online Lyrics
            </DialogTitle>
            <DialogDescription className="sr-only">
              Search public lyric sources by title, artist, or a line of lyrics,
              then import a result into your song library.
            </DialogDescription>
          </DialogHeader>

          <div className="relative mt-3">
            <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search by title, artist, or a lyric line…"
              aria-label="Search query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pr-9 pl-8"
            />
            {searching && (
              <Loader2Icon className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Searches LRCLIB and Genius as you type. Lyric-line phrases are
            matched by Genius (add a Genius key in Settings → Songs) — the other
            sources match title and artist only.
          </p>
        </div>

        {/* Two-pane body: results list + preview */}
        <div className="flex min-h-0 flex-1">
          {/* Results list */}
          <div className="w-2/5 min-w-[200px] overflow-y-auto border-r border-border">
            {searching ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Searching…
              </p>
            ) : !hits ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Search to see results.
              </p>
            ) : hits.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No results.
              </p>
            ) : (
              <ul className="flex flex-col p-1.5">
                {hits.map((hit, i) => (
                  <li key={`${hit.source}:${i}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(i)}
                      className={`flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                        selected === i ? "bg-accent" : "hover:bg-accent/50"
                      }`}
                    >
                      <span className="truncate text-sm font-medium">
                        {hit.title}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-xs text-muted-foreground">
                          {hit.artist || "Unknown artist"}
                        </span>
                        <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.625rem] tracking-wide text-muted-foreground uppercase">
                          {sourceLabel(hit.source)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Preview / detail pane */}
          <div className="flex min-h-0 flex-1 flex-col">
            {!activeHit ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <MusicIcon className="size-9 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {hits && hits.length > 0
                    ? "Select a result to preview its lyrics"
                    : "Results appear here"}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 border-b border-border px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold">
                      {activeHit.title}
                    </h2>
                    <p className="truncate text-sm text-muted-foreground">
                      {activeHit.artist || "Unknown artist"}
                      {activeHit.album ? ` · ${activeHit.album}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] tracking-wide text-muted-foreground uppercase">
                        {sourceLabel(activeHit.source)}
                      </span>
                      {activeHit.hasSynced && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] tracking-wide text-muted-foreground uppercase">
                          Synced
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void importSelected()}
                    disabled={importing || previewLoading || importUnavailable}
                    className="shrink-0"
                  >
                    {importing ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <PlusIcon className="size-4" />
                    )}
                    Import to Library
                  </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  {previewLoading ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2Icon className="size-4 animate-spin" />
                      Loading lyrics…
                    </p>
                  ) : previewError ? (
                    <p className="text-sm text-muted-foreground">
                      {importUnavailable
                        ? `${sourceLabel(activeHit.source)} has no lyrics for this song — try another result.`
                        : "Couldn't load a preview — you can still import it."}
                    </p>
                  ) : preview ? (
                    <PreviewBody content={preview} />
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer: result count */}
        {hits && hits.length > 0 && (
          <div className="border-t border-border px-5 py-2 text-center text-xs text-muted-foreground">
            {hits.length} result{hits.length === 1 ? "" : "s"}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The lyrics preview: first `PREVIEW_LINES` lines, with a truncation note. */
function PreviewBody({ content }: { content: LyricsContent }) {
  const text = content.plainLyrics.trim()
  if (!text) {
    return (
      <p className="text-sm text-muted-foreground">
        No preview text — import to see the full result.
      </p>
    )
  }
  const lines = text.split("\n")
  const shown = lines.slice(0, PREVIEW_LINES).join("\n")
  const remaining = lines.length - PREVIEW_LINES
  return (
    <>
      <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
        {shown}
      </pre>
      {remaining > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          + {remaining} more line{remaining === 1 ? "" : "s"}…
        </p>
      )}
    </>
  )
}
