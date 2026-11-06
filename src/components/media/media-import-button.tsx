import { LoaderIcon, UploadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMediaImport, MEDIA_ACCEPT } from "@/hooks/use-media-import"
import { useTranslation } from "react-i18next"

export function MediaImportButton() {
  const { t } = useTranslation("media")
  const {
    fileInputRef,
    isImporting,
    startImport,
    handleFileChange,
    needsFileInput,
  } = useMediaImport()

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={startImport}
        disabled={isImporting}
      >
        {isImporting ? (
          <LoaderIcon className="size-3 animate-spin" />
        ) : (
          <UploadIcon className="size-3" />
        )}
        {isImporting ? t("importing") : t("import")}
      </Button>
      {needsFileInput && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={MEDIA_ACCEPT}
          onChange={handleFileChange}
          className="hidden"
        />
      )}
    </>
  )
}
