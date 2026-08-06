import { useBroadcastStore } from "@/stores"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { MonitorIcon, MegaphoneIcon, XIcon } from "lucide-react"

/**
 * Operator inputs for the two presenter-facing stage-monitor text zones:
 *
 * - **Stage Message** — a short, urgent cue TO the person on stage ("WRAP UP",
 *   "MIC IS HOT"). Rendered as a bold amber panel on the stage layout's
 *   `messages` zone.
 * - **Announcement** — a longer, calmer note for them to read/relay. Rendered
 *   in the `announcement` zone.
 *
 * Both are private to the stage monitor — unlike audience alerts, nothing here
 * touches the broadcast feed. Text binds live: as the operator types, the value
 * flows straight to any stage output via `setStageMessage` /
 * `setStageAnnouncement` (each calls `syncStageOutput`). Hidden entirely unless
 * a stage output exists, so it never clutters a single-screen setup.
 */
export function StageMonitorControls() {
  const hasStageOutput = useBroadcastStore((s) =>
    s.outputs.some((o) => o.mode === "stage")
  )
  const message = useBroadcastStore((s) => s.stageMessage)
  const announcement = useBroadcastStore((s) => s.stageAnnouncement)

  if (!hasStageOutput) return null

  const setMessage = (v: string) =>
    useBroadcastStore.getState().setStageMessage(v.trim() ? v : null)
  const setAnnouncement = (v: string) =>
    useBroadcastStore.getState().setStageAnnouncement(v.trim() ? v : null)

  return (
    <div className="shrink-0 space-y-2 border-t border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <MonitorIcon className="size-3.5 text-muted-foreground" />
        <span className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
          Stage monitor
        </span>
      </div>

      <div className="relative">
        <Input
          value={message ?? ""}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Stage message — e.g. WRAP UP (private to stage)"
          className="h-8 pr-7 text-xs"
        />
        {message && (
          <button
            type="button"
            onClick={() => setMessage("")}
            title="Clear stage message"
            className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute top-2 left-2.5 flex items-center gap-1 text-muted-foreground">
          <MegaphoneIcon className="size-3" />
        </div>
        <Textarea
          value={announcement ?? ""}
          onChange={(e) => setAnnouncement(e.target.value)}
          placeholder="Announcement — a longer note for the presenter to read"
          rows={2}
          className="min-h-14 resize-none pt-2 pr-7 pl-7 text-xs"
        />
        {announcement && (
          <button
            type="button"
            onClick={() => setAnnouncement("")}
            title="Clear announcement"
            className="absolute top-2 right-1.5 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
