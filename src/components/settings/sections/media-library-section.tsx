import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FolderOpenIcon } from "lucide-react"
import { useSettingsStore } from "@/stores"

import { useMediaLibraryPath } from "../hooks/use-media-library-path"

export function MediaLibrarySection() {
  const mediaImportMode = useSettingsStore((s) => s.mediaImportMode)
  const setMediaImportMode = useSettingsStore((s) => s.setMediaImportMode)

  const { libraryPath, openFolder } = useMediaLibraryPath()

  return (
    <div className="flex flex-col gap-6">
      {/* Import storage mode */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          When Importing Media
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
                Reference originals
              </span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                Keeps only a link to each file where it already lives. Uses no
                extra disk space, but a clip stops working if you move, rename,
                or delete the original — and the library can't move to another
                computer on its own.
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
                Copy into app library
              </span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                Copies each imported file into a folder LumenLive manages, so
                the library keeps working even if you move or delete the
                originals. Uses more disk space. Removing a copied item from the
                library deletes its copy.
              </p>
            </div>
          </label>
        </RadioGroup>

        <p className="text-[0.625rem] text-muted-foreground">
          This applies to files imported from now on. Media already in your
          library is left exactly as it is.
        </p>
      </div>

      {/* Library folder */}
      {libraryPath && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Library Folder
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[0.625rem] text-muted-foreground">
              {libraryPath}
            </code>
            <Button variant="outline" size="sm" onClick={openFolder}>
              <FolderOpenIcon className="mr-1.5 size-3.5" />
              Open
            </Button>
          </div>
          <p className="text-[0.625rem] text-muted-foreground">
            Where copied files are stored. Only used when "Copy into app
            library" is selected.
          </p>
        </div>
      )}
    </div>
  )
}
