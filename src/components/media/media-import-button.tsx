import { PlusIcon, LoaderIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMediaImport, MEDIA_ACCEPT } from "@/hooks/use-media-import"

export function MediaImportButton() {
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
        variant="outline"
        size="sm"
        onClick={startImport}
        disabled={isImporting}
      >
        {isImporting ? (
          <LoaderIcon className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <PlusIcon className="mr-1.5 size-3.5" />
        )}
        {isImporting ? "Importing..." : "Import"}
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
