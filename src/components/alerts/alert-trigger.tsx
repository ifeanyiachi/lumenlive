import { useState } from "react"
import { useTranslation } from "react-i18next"
import { BellIcon, SendIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useAlertStore } from "@/stores/alert-store"
import { useBroadcastStore } from "@/stores"
import { AlertTemplatesManager } from "@/components/alerts/alert-templates-manager"
import { StageMonitorControls } from "@/components/broadcast/stage-monitor-controls"
import { StageMonitorGroupsDialog } from "@/components/broadcast/stage-monitor-groups-dialog"
import { requireFeature } from "@/components/entitlements/require-feature"
import { cn } from "@/lib/utils"

export function AlertTrigger() {
  const { t } = useTranslation("alerts")
  const templates = useAlertStore((s) => s.templates)
  const activeAlerts = useAlertStore((s) => s.activeAlerts)
  // A live stage cue (on any monitor) also warrants the badge now that the
  // stage-monitor inputs live inside this popover.
  const hasStageCue = useBroadcastStore(
    (s) =>
      Object.values(s.stageMessages).some((v) => v != null) ||
      Object.values(s.stageAnnouncements).some((v) => v != null)
  )
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [managerOpen, setManagerOpen] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)

  const hasActive = activeAlerts.length > 0

  return (
    <>
      <Popover
        open={popoverOpen}
        onOpenChange={(open) => {
          // On-screen alerts are a Starter capability; gate the whole panel so a
          // Free operator can't send an alert (the stage-monitor controls inside
          // are separately Pro-gated by whether stage output exists).
          if (
            open &&
            !requireFeature("alerts", "On-screen alerts", () =>
              setPopoverOpen(true)
            )
          )
            return
          setPopoverOpen(open)
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("trigger.title")}
            aria-label={t("trigger.title")}
            data-tour="alerts"
            className="relative"
          >
            <BellIcon className="size-3.5" />
            {(hasActive || hasStageCue) && (
              <span
                className={cn(
                  "absolute -top-0.5 -right-0.5 size-2 rounded-full",
                  // Red = audience alert on air; amber = private stage cue only.
                  hasActive ? "bg-red-500" : "bg-amber-500"
                )}
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">
                {t("trigger.sendAlert")}
              </span>
              {hasActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[0.625rem] text-red-400"
                  onClick={() => useAlertStore.getState().dismissAll()}
                >
                  {t("trigger.dismissAll")}
                </Button>
              )}
            </div>
          </div>

          <div className="flex max-h-64 flex-col overflow-y-auto p-1.5">
            {templates.map((template) => (
              <div key={template.id} className="flex flex-col">
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                    expandedId === template.id && "bg-accent"
                  )}
                  onClick={() => {
                    if (expandedId === template.id) {
                      setExpandedId(null)
                      setMessage("")
                    } else {
                      setExpandedId(template.id)
                      setMessage("")
                    }
                  }}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: template.backgroundColor }}
                  />
                  <span className="flex-1 truncate text-foreground">
                    {template.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-5 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      useAlertStore
                        .getState()
                        .showAlert(template.id, template.name)
                    }}
                    title={t("trigger.quickSend")}
                  >
                    <SendIcon className="size-2.5" />
                  </Button>
                </button>

                {expandedId === template.id && (
                  <div className="flex items-center gap-1 px-2 pb-1.5">
                    <Input
                      autoFocus
                      className="h-7 flex-1 text-xs"
                      aria-label={t("trigger.customMessage")}
                      placeholder={t("trigger.customMessagePlaceholder")}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && message.trim()) {
                          useAlertStore
                            .getState()
                            .showAlert(template.id, message.trim())
                          setMessage("")
                          setExpandedId(null)
                        }
                      }}
                    />
                    <Button
                      size="icon-sm"
                      className="size-7"
                      aria-label={t("trigger.send")}
                      disabled={!message.trim()}
                      onClick={() => {
                        useAlertStore
                          .getState()
                          .showAlert(template.id, message.trim())
                        setMessage("")
                        setExpandedId(null)
                      }}
                    >
                      <SendIcon className="size-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-border p-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={() => setManagerOpen(true)}
            >
              {t("trigger.manageTemplates")}
            </Button>
          </div>

          {/* Private stage-monitor cues — self-hides when no stage output exists. */}
          <StageMonitorControls onManageGroups={() => setGroupsOpen(true)} />
        </PopoverContent>
      </Popover>

      <AlertTemplatesManager open={managerOpen} onOpenChange={setManagerOpen} />
      {/* Rendered outside the popover so it survives the popover closing. */}
      <StageMonitorGroupsDialog
        open={groupsOpen}
        onOpenChange={setGroupsOpen}
      />
    </>
  )
}
