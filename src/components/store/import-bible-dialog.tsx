import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useResourceStore } from "@/stores/resource-store"
import { deriveMetaFromFileName, type ImportMetadata } from "@/lib/bible-import"
import {
  pickImportFile,
  type ImportResult,
} from "@/services/bible-import-gateway"

/**
 * Bring-your-own Bible import dialog. The user picks a file first; the code and
 * title are prefilled from the filename (still editable), then the file is built
 * into a new custom translation.
 *
 * Errors and the success summary are shown inline here — the store's
 * `importBible` rejects on failure rather than routing to the page banner, so
 * the modal owns its own feedback. Supported files: .txt / .csv / .bib (parsed
 * in-app) and .sqlite (read in Rust); .docx / .pdf are reported as unsupported.
 */
export function ImportBibleDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation("store")
  const [path, setPath] = useState<string | null>(null)
  const [abbreviation, setAbbreviation] = useState("")
  const [title, setTitle] = useState("")
  const [language, setLanguage] = useState("en")
  const [license, setLicense] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const reset = () => {
    setPath(null)
    setAbbreviation("")
    setTitle("")
    setLanguage("en")
    setLicense("")
    setBusy(false)
    setError(null)
    setResult(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (busy) return // don't close mid-import
    if (!next) reset()
    onOpenChange(next)
  }

  /** Open the OS picker and prefill code/title from the chosen filename. */
  const handleChooseFile = async () => {
    setError(null)
    const chosen = await pickImportFile()
    if (!chosen) return // picker dismissed
    const { abbreviation: code, title: name } = deriveMetaFromFileName(chosen)
    setPath(chosen)
    setAbbreviation(code)
    setTitle(name)
  }

  const fileName = path ? (path.split(/[\\/]/).pop() ?? path) : null
  const canSubmit =
    path !== null && abbreviation.trim() !== "" && title.trim() !== "" && !busy

  const handleImport = async () => {
    if (!path) return
    setError(null)
    setResult(null)
    const metadata: ImportMetadata = {
      abbreviation: abbreviation.trim(),
      title: title.trim(),
      language: language.trim() || "en",
      license: license.trim() || t("importBible.userProvidedLicense"),
    }
    setBusy(true)
    try {
      const imported = await useResourceStore
        .getState()
        .importBible(metadata, path)
      setResult(imported)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("importBible.title")}</DialogTitle>
          <DialogDescription>
            {t("importBible.descriptionStart")} <code>.txt</code>,{" "}
            <code>.csv</code>, <code>.bib</code>, or <code>.sqlite</code>{" "}
            {t("importBible.descriptionEnd")}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>
              {t("importBible.success", {
                title: result.title,
                abbreviation: result.abbreviation,
                verses: result.verseCount,
                books: result.bookCount,
              })}
              {result.skipped > 0
                ? t("importBible.skipped", { count: result.skipped })
                : ""}
              {t("importBible.availableNow")}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-1">
            {/* File chooser */}
            <div className="flex items-center gap-2">
              <Button
                variant={path ? "outline" : "default"}
                onClick={handleChooseFile}
                disabled={busy}
                className="shrink-0"
              >
                <FileText />
                {path
                  ? t("importBible.changeFile")
                  : t("importBible.chooseFile")}
              </Button>
              {fileName && (
                <span
                  className="min-w-0 truncate text-xs text-muted-foreground"
                  title={path ?? undefined}
                >
                  {fileName}
                </span>
              )}
            </div>

            {path && (
              <>
                <Field
                  label={t("importBible.code")}
                  hint={t("importBible.fromFilename")}
                >
                  <Input
                    value={abbreviation}
                    onChange={(e) => setAbbreviation(e.target.value)}
                    placeholder={t("importBible.codePlaceholder")}
                    maxLength={16}
                    disabled={busy}
                  />
                </Field>
                <Field
                  label={t("importBible.titleLabel")}
                  hint={t("importBible.fromFilename")}
                >
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("importBible.titlePlaceholder")}
                    disabled={busy}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label={t("importBible.language")}
                    hint={t("importBible.codeOrName")}
                  >
                    <Input
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      placeholder="en"
                      disabled={busy}
                    />
                  </Field>
                  <Field
                    label={t("importBible.license")}
                    hint={t("common.optional")}
                  >
                    <Input
                      value={license}
                      onChange={(e) => setLicense(e.target.value)}
                      placeholder={t("importBible.personalCopy")}
                      disabled={busy}
                    />
                  </Field>
                </div>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span className="min-w-0 break-words">{error}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => handleOpenChange(false)}>
              {t("common.done")}
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={busy}
              >
                {t("common.cancel")}
              </Button>
              <Button onClick={handleImport} disabled={!canSubmit}>
                {busy ? (
                  <>
                    <Loader2 className="animate-spin" /> {t("common.importing")}
                  </>
                ) : (
                  <>
                    <Upload /> {t("common.import")}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">
        {label}
        {hint && (
          <span className="ml-1.5 font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  )
}
