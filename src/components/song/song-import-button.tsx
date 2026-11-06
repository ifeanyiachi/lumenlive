import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  DownloadIcon,
  FileUpIcon,
  ClipboardPasteIcon,
  FolderInputIcon,
  PackageIcon,
  GitBranchIcon,
  Loader2Icon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSongStore } from "@/stores/song-store"
import {
  importSongFromText,
  importSongAs,
  type ImportableFormat,
} from "@/lib/song/import"
import { importSongsFromQsp } from "@/lib/song/import/quelea-pack"
import { importSongsFromPack } from "@/lib/song/import/from-pack"
import { stampImportBatch, packLabelFromUrl } from "@/lib/song/community-packs"
import { formatNumber } from "@/lib/i18n/format"
import {
  pickAndReadSongFiles,
  pickAndReadSongPacks,
  readSongFolder,
} from "@/services/song-import-gateway"
import { fetchSongPack } from "@/services/song-pack-gateway"
import type { Song } from "@/types/song"

/** Competitor formats offered explicitly (ambiguous to auto-detect). */
const IMPORT_AS: { format: ImportableFormat; label: string }[] = [
  { format: "propresenter", label: "ProPresenter (.pro4–6)…" },
  { format: "quelea", label: "Quelea song XML…" },
]

/**
 * Song import entry point for the library header. Two paths:
 *  • "From file…" — the Tauri file picker (gateway), parsing each selection by
 *    detected format and batch-adding via `addSongs`.
 *  • "Paste lyrics…" — a dialog for pasted text (plain / ChordPro / OpenLyrics,
 *    auto-detected), which works even in the browser.
 */
export function SongImportButton() {
  const { t } = useTranslation("song")
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteTitle, setPasteTitle] = useState("")
  const [pasteText, setPasteText] = useState("")
  const [packOpen, setPackOpen] = useState(false)
  const [packUrl, setPackUrl] = useState("")
  const [packBusy, setPackBusy] = useState(false)
  const [packReceived, setPackReceived] = useState(0)

  const handleFileImport = async () => {
    const files = await pickAndReadSongFiles()
    if (files.length === 0) return
    const songs = files
      .map((f) => importSongFromText(f.name, f.text))
      .filter((s): s is NonNullable<typeof s> => s !== null)
    if (songs.length === 0) {
      toast.error(t("import.noFiles"))
      return
    }
    useSongStore.getState().addSongs(songs)
    useSongStore.getState().setSelectedSong(songs[0].id)
    toast.success(t("import.imported", { count: songs.length }))
  }

  const handleFolderImport = async () => {
    const setProgress = useSongStore.getState().setImportProgress
    setProgress({ current: 0, total: 1, label: t("import.scanningFolder") })
    const result = await readSongFolder((read, total) =>
      setProgress({ current: read, total, label: t("import.readingFiles") })
    )
    if (!result) {
      setProgress(null)
      return
    }

    const { textFiles, zipFiles } = result
    const grand = textFiles.length + zipFiles.length
    const songs: Song[] = []
    let done = 0
    for (const f of textFiles) {
      const song = importSongFromText(f.name, f.text)
      if (song) songs.push(song)
      done += 1
      setProgress({ current: done, total: grand, label: t("import.importing") })
    }
    for (const z of zipFiles) {
      songs.push(...(await importSongsFromQsp(z.bytes)))
      done += 1
      setProgress({ current: done, total: grand, label: t("import.importing") })
    }
    setProgress(null)

    if (songs.length === 0) {
      toast.error(t("import.noFolderSongs"))
      return
    }
    useSongStore.getState().addSongs(songs)
    useSongStore.getState().setSelectedSong(songs[0].id)
    toast.success(t("import.imported", { count: songs.length }))
  }

  const handlePackImport = async () => {
    const packs = await pickAndReadSongPacks()
    if (packs.length === 0) return
    const setProgress = useSongStore.getState().setImportProgress
    const songs: Song[] = []
    let done = 0
    for (const pack of packs) {
      songs.push(...(await importSongsFromQsp(pack.bytes)))
      done += 1
      setProgress({
        current: done,
        total: packs.length,
        label: t("import.importingPacks"),
      })
    }
    setProgress(null)
    if (songs.length === 0) {
      toast.error(t("import.noPacks"))
      return
    }
    useSongStore.getState().addSongs(songs)
    useSongStore.getState().setSelectedSong(songs[0].id)
    toast.success(t("import.imported", { count: songs.length }))
  }

  const handleCommunityPack = async () => {
    const url = packUrl.trim()
    if (!url || packBusy) return
    setPackBusy(true)
    setPackReceived(0)
    try {
      const bytes = await fetchSongPack(url, ({ received }) =>
        setPackReceived(received)
      )
      const parsed = await importSongsFromPack(bytes)
      if (parsed.length === 0) {
        toast.error(t("import.noPackSongs"))
        return
      }
      // Tag the batch (id = the source URL) so it shows in the Store as an
      // installed pack and can be uninstalled as a group.
      const songs = stampImportBatch(parsed, url, packLabelFromUrl(url))
      useSongStore.getState().addSongs(songs)
      useSongStore.getState().setSelectedSong(songs[0].id)
      toast.success(t("import.importedFromPack", { count: songs.length }))
      setPackOpen(false)
      setPackUrl("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("import.packFailed"))
    } finally {
      setPackBusy(false)
    }
  }

  const handleImportAs = async (format: ImportableFormat) => {
    const files = await pickAndReadSongFiles()
    if (files.length === 0) return
    const songs = files
      .map((f) => importSongAs(format, f.name, f.text))
      .filter((s): s is NonNullable<typeof s> => s !== null)
    if (songs.length === 0) {
      toast.error(t("import.noFiles"))
      return
    }
    useSongStore.getState().addSongs(songs)
    useSongStore.getState().setSelectedSong(songs[0].id)
    toast.success(t("import.imported", { count: songs.length }))
  }

  const handlePasteImport = () => {
    const name = pasteTitle.trim() || t("import.pastedSong")
    const song = importSongFromText(name, pasteText)
    if (!song) {
      toast.error(t("import.nothingToImport"))
      return
    }
    useSongStore.getState().addSong(song)
    useSongStore.getState().setSelectedSong(song.id)
    useSongStore.getState().openEditor(song.id)
    setPasteOpen(false)
    setPasteTitle("")
    setPasteText("")
    toast.success(t("import.importedTitle", { title: song.title }))
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
          >
            <DownloadIcon className="size-3" />
            {t("import.button")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            className="text-xs"
            onClick={() => void handleFileImport()}
          >
            <FileUpIcon className="mr-1.5 size-3.5" />
            {t("import.fromFile")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={() => void handleFolderImport()}
          >
            <FolderInputIcon className="mr-1.5 size-3.5" />
            {t("import.fromFolder")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={() => setPasteOpen(true)}
          >
            <ClipboardPasteIcon className="mr-1.5 size-3.5" />
            {t("import.pasteLyrics")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={() => setPackOpen(true)}
          >
            <GitBranchIcon className="mr-1.5 size-3.5" />
            {t("import.communityPack")}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[0.625rem] tracking-wider text-muted-foreground uppercase">
            {t("import.importFrom")}
          </DropdownMenuLabel>
          {IMPORT_AS.map(({ format, label }) => (
            <DropdownMenuItem
              key={format}
              className="text-xs"
              onClick={() => void handleImportAs(format)}
            >
              <FileUpIcon className="mr-1.5 size-3.5" />
              {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            className="text-xs"
            onClick={() => void handlePackImport()}
          >
            <PackageIcon className="mr-1.5 size-3.5" />
            {t("import.queleaPack")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("import.pasteTitle")}</DialogTitle>
            <DialogDescription>
              {t("import.pasteDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Input
              placeholder={t("import.songTitle")}
              aria-label={t("import.songTitle")}
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              className="h-8 text-sm"
            />
            <Textarea
              placeholder={
                "Verse 1\nLyrics line one\nLyrics line two\n\nChorus\n…"
              }
              aria-label={t("import.lyrics")}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="min-h-56 text-sm"
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPasteOpen(false)}
            >
              {t("import.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handlePasteImport}
              disabled={!pasteText.trim()}
            >
              {t("import.button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={packOpen}
        onOpenChange={(open) => {
          // Don't let a click-away close the dialog mid-download.
          if (!packBusy) setPackOpen(open)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("import.communityTitle")}</DialogTitle>
            <DialogDescription>
              {t("import.communityDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Input
              placeholder="https://github.com/owner/repo"
              aria-label={t("import.packUrl")}
              value={packUrl}
              onChange={(e) => setPackUrl(e.target.value)}
              disabled={packBusy}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCommunityPack()
              }}
              className="h-8 text-sm"
            />
            {packBusy && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin" />
                {t("import.downloadingPack", {
                  size: formatNumber(packReceived / 1_000_000, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }),
                })}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPackOpen(false)}
              disabled={packBusy}
            >
              {t("import.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleCommunityPack()}
              disabled={packBusy || !packUrl.trim()}
            >
              {packBusy ? t("import.importing") : t("import.button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
