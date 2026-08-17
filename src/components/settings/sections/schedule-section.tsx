import { useSettingsStore } from "@/stores"

import { ToggleCard } from "../ui/toggle-card"

export function ScheduleSection() {
  const preventDuplicateScheduleItems = useSettingsStore(
    (s) => s.preventDuplicateScheduleItems
  )
  const setPreventDuplicateScheduleItems = useSettingsStore(
    (s) => s.setPreventDuplicateScheduleItems
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Building the Schedule
        </label>

        <ToggleCard
          title="Prevent duplicate items"
          description="When something already in the schedule is added again — the same verse, slide deck, media file, or video — keep the original and flash it in the list instead of adding a second copy. Section headers are never affected, so repeated dividers still work."
          checked={preventDuplicateScheduleItems}
          onCheckedChange={setPreventDuplicateScheduleItems}
        />

        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            Which setting fits your service?
          </span>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Leave it on</span> if
            your schedule is built ahead of time by several people, or if verses
            land in it from AI detection and search during the service. Two
            operators dragging John 3:16 in from different panels then get one
            item, and the flash shows where it already is.
          </p>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Turn it off</span> if
            your order of service deliberately repeats content — a
            call-to-worship verse read again at the benediction, a bumper video
            before and after the sermon, or a song slide reprised at the end.
            With it off, every add creates its own item you can re-order and
            re-cue independently.
          </p>
        </div>
      </div>
    </div>
  )
}
