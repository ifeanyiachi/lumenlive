import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FolderOpenIcon } from "lucide-react"
import { useSettingsStore } from "@/stores"
import { useTranslation } from "react-i18next"

import { useMediaLibraryPath } from "../hooks/use-media-library-path"

export function MediaLibrarySection() {
  const { t } = useTranslation("settings")
  const mediaImportMode = useSettingsStore((s) => s.mediaImportMode)
  const setMediaImportMode = useSettingsStore((s) => s.setMediaImportMode)

  const { libraryPath, openFolder } = useMediaLibraryPath()

  return (
    <div className="flex flex-col gap-6">
      {/* Import storage mode */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("mediaLibrary.whenImporting")}
        </label>

        <RadioGroup
          value={mediaImportMode}
          onValueChange={(v) => setMediaImportMode(v as "reference" | "copy")}
          className="gap-3"
        >
          {/* Reference (default) */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary/20 ${
              mediaImportMode !== "reference"
                ? "hover:border-muted-foreground/25"
                : ""
            }`}
          >
            <RadioGroupItem value="reference" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">
                {t("mediaLibrary.reference.title")}
              </span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                {t("mediaLibrary.reference.description")}
              </p>
            </div>
          </label>

          {/* Copy into library */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary/20 ${
              mediaImportMode !== "copy"
                ? "hover:border-muted-foreground/25"
                : ""
            }`}
          >
            <RadioGroupItem value="copy" className="mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">
                {t("mediaLibrary.copy.title")}
              </span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                {t("mediaLibrary.copy.description")}
              </p>
            </div>
          </label>
        </RadioGroup>

        <p className="text-[0.625rem] text-muted-foreground">
          {t("mediaLibrary.appliesFromNow")}
        </p>
      </div>

      {/* Library folder */}
      {libraryPath && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("mediaLibrary.folder")}
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[0.625rem] text-muted-foreground">
              {libraryPath}
            </code>
            <Button variant="outline" size="sm" onClick={openFolder}>
              <FolderOpenIcon className="mr-1.5 size-3.5" />
              {t("mediaLibrary.open")}
            </Button>
          </div>
          <p className="text-[0.625rem] text-muted-foreground">
            {t("mediaLibrary.folderDescription")}
          </p>
        </div>
      )}
    </div>
  )
}
