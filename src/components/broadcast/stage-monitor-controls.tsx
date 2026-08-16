import { useMemo, useState } from "react"
import { useBroadcastStore } from "@/stores"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MonitorIcon,
  MegaphoneIcon,
  SendIcon,
  UsersIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"

/** Which monitors a cue is aimed at. */
type Target =
  | { kind: "all" }
  | { kind: "group"; id: string }
  | { kind: "output"; id: string }

type CueMap = Record<string, string | null>

const serializeTarget = (t: Target): string =>
  t.kind === "all" ? "all" : `${t.kind}:${t.id}`

const parseTarget = (v: string): Target => {
  if (v === "all") return { kind: "all" }
  const idx = v.indexOf(":")
  const kind = v.slice(0, idx)
  const id = v.slice(idx + 1)
  return kind === "group" ? { kind: "group", id } : { kind: "output", id }
}

/** Common value across the targeted monitors, or "" when they disagree (mixed). */
const sharedValue = (ids: string[], map: CueMap): string => {
  if (ids.length === 0) return ""
  const first = map[ids[0]] ?? null
  const same = ids.every((id) => (map[id] ?? null) === first)
  return same ? (first ?? "") : ""
}

const isMixed = (ids: string[], map: CueMap): boolean => {
  if (ids.length <= 1) return false
  const first = map[ids[0]] ?? null
  return !ids.every((id) => (map[id] ?? null) === first)
}

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
 * touches the broadcast feed. The operator picks a **target** (all monitors, a
 * named group, or one screen), edits a local draft, and pushes it only on submit
 * — so a half-typed cue never flashes on a presenter's screen and each screen can
 * carry its own cue. Hidden entirely unless a stage output exists.
 *
 * Lives as a section inside the Alert popover — grouping the two
 * "push a message to a screen" surfaces (audience alert vs. private stage cue)
 * in one place. `onManageGroups` opens the group editor (rendered outside the
 * popover so it survives the popover closing).
 */
export function StageMonitorControls({
  onManageGroups,
}: {
  onManageGroups?: () => void
}) {
  // Select the stable `outputs` slice and derive with useMemo — a selector that
  // returns a fresh `.filter()` array every call makes zustand v5's plain
  // useSyncExternalStore loop ("Maximum update depth exceeded").
  const outputs = useBroadcastStore((s) => s.outputs)
  const stageOutputs = useMemo(
    () => outputs.filter((o) => o.mode === "stage"),
    [outputs]
  )
  const groups = useBroadcastStore((s) => s.stageMonitorGroups)
  const stageMessages = useBroadcastStore((s) => s.stageMessages)
  const stageAnnouncements = useBroadcastStore((s) => s.stageAnnouncements)

  const [target, setTarget] = useState<Target>({ kind: "all" })
  // Local draft — decoupled from the stage until submitted. Seeded from the
  // target's shared cue; reseeded synchronously whenever the target changes.
  const [draftMessage, setDraftMessage] = useState(() =>
    sharedValue(
      stageOutputs.map((o) => o.id),
      stageMessages
    )
  )
  const [draftAnnouncement, setDraftAnnouncement] = useState(() =>
    sharedValue(
      stageOutputs.map((o) => o.id),
      stageAnnouncements
    )
  )

  if (stageOutputs.length === 0) return null

  // Fall back to "all" if the selected group/monitor was deleted underneath us.
  const validTarget =
    target.kind === "all" ||
    (target.kind === "group" && groups.some((g) => g.id === target.id)) ||
    (target.kind === "output" && stageOutputs.some((o) => o.id === target.id))
  const effTarget: Target = validTarget ? target : { kind: "all" }

  const resolveIds = (t: Target): string[] => {
    if (t.kind === "all") return stageOutputs.map((o) => o.id)
    if (t.kind === "output") return [t.id]
    const group = groups.find((g) => g.id === t.id)
    if (!group) return []
    // Keep only ids that are still stage outputs.
    const live = new Set(stageOutputs.map((o) => o.id))
    return group.outputIds.filter((id) => live.has(id))
  }

  const targetIds = resolveIds(effTarget)
  const norm = (v: string) => (v.trim() ? v : null)
  const nm = norm(draftMessage)
  const na = norm(draftAnnouncement)

  const dirty =
    targetIds.length > 0 &&
    targetIds.some(
      (id) =>
        (stageMessages[id] ?? null) !== nm ||
        (stageAnnouncements[id] ?? null) !== na
    )
  const targetHasLive = targetIds.some(
    (id) => stageMessages[id] != null || stageAnnouncements[id] != null
  )
  const messageMixed = isMixed(targetIds, stageMessages)
  const announcementMixed = isMixed(targetIds, stageAnnouncements)

  // How many monitors overall are currently showing something (across targets).
  const liveCount = stageOutputs.filter(
    (o) => stageMessages[o.id] != null || stageAnnouncements[o.id] != null
  ).length

  const targetLabel =
    effTarget.kind === "all"
      ? "all"
      : effTarget.kind === "group"
        ? (groups.find((g) => g.id === effTarget.id)?.name ?? "group")
        : (stageOutputs.find((o) => o.id === effTarget.id)?.name ?? "monitor")

  const selectTarget = (value: string) => {
    const t = parseTarget(value)
    setTarget(t)
    const ids = resolveIds(t)
    setDraftMessage(sharedValue(ids, stageMessages))
    setDraftAnnouncement(sharedValue(ids, stageAnnouncements))
  }

  const submit = () => {
    if (!dirty || targetIds.length === 0) return
    useBroadcastStore.getState().setStageCue(targetIds, nm, na)
  }

  const clearTarget = () => {
    setDraftMessage("")
    setDraftAnnouncement("")
    useBroadcastStore.getState().clearStageCue(targetIds)
  }

  // Only offer the picker when there's an actual choice to make.
  const showPicker = stageOutputs.length > 1 || groups.length > 0

  return (
    <div className="space-y-2 border-t border-border px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MonitorIcon className="size-3.5 text-muted-foreground" />
          <span className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Stage monitor
          </span>
        </div>
        {liveCount > 0 && (
          <span className="flex items-center gap-1 text-[0.5625rem] font-medium tracking-wide text-amber-400 uppercase">
            <span className="size-1.5 rounded-full bg-amber-400" />
            {liveCount} on stage
          </span>
        )}
      </div>

      {showPicker && (
        <div className="flex items-center gap-1.5">
          <Select
            value={serializeTarget(effTarget)}
            onValueChange={selectTarget}
          >
            <SelectTrigger size="sm" className="h-8 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="flex items-center gap-1.5">
                  <MonitorIcon className="size-3" />
                  All monitors
                </span>
              </SelectItem>
              {groups.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Groups</SelectLabel>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={`group:${g.id}`}>
                      <span className="flex items-center gap-1.5">
                        <UsersIcon className="size-3" />
                        {g.name || "Unnamed"}
                        <span className="text-muted-foreground">
                          ({g.outputIds.length})
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              <SelectGroup>
                <SelectLabel>Monitors</SelectLabel>
                {stageOutputs.map((o) => (
                  <SelectItem key={o.id} value={`output:${o.id}`}>
                    <span className="flex items-center gap-1.5">
                      <MonitorIcon className="size-3" />
                      {o.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {onManageGroups && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 shrink-0 text-muted-foreground"
              title="Manage groups"
              onClick={onManageGroups}
            >
              <SettingsIcon className="size-3.5" />
            </Button>
          )}
        </div>
      )}

      <div className="relative">
        <Input
          value={draftMessage}
          onChange={(e) => setDraftMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={
            messageMixed
              ? "Mixed across monitors — typing overwrites all"
              : "Stage message — e.g. WRAP UP (private to stage)"
          }
          className="h-8 pr-7 text-xs"
        />
        {draftMessage && (
          <button
            type="button"
            onClick={() => setDraftMessage("")}
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
          value={draftAnnouncement}
          onChange={(e) => setDraftAnnouncement(e.target.value)}
          placeholder={
            announcementMixed
              ? "Mixed across monitors — typing overwrites all"
              : "Announcement — a longer note for the presenter to read"
          }
          rows={2}
          className="min-h-14 resize-none pt-2 pr-7 pl-7 text-xs"
        />
        {draftAnnouncement && (
          <button
            type="button"
            onClick={() => setDraftAnnouncement("")}
            title="Clear announcement"
            className="absolute top-2 right-1.5 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          className="h-7 flex-1 gap-1.5 text-xs"
          disabled={!dirty}
          onClick={submit}
        >
          <SendIcon className="size-3" />
          {targetHasLive ? "Update" : "Send to"} {targetLabel}
        </Button>
        {targetHasLive && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={clearTarget}
            title={`Remove the cue from ${targetLabel}`}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
