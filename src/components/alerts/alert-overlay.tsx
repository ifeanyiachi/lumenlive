import { useAlertStore } from "@/stores/alert-store"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Operator confirmation toasts for alerts that are live on the audience output.
 * This is deliberately NOT a mirror of the alert's on-screen appearance — the
 * faithful preview lives in the live-display panel (see `AlertPreviewOverlay`),
 * matching how ProPresenter/EasyWorship keep the alert off the operator's
 * workspace and only on the audience feed. Here we show a small, dismissable
 * chip per active alert so the operator can confirm what went out and pull it
 * back, without a full banner covering the controls.
 */
export function AlertOverlay() {
  const activeAlerts = useAlertStore((s) => s.activeAlerts)
  const templates = useAlertStore((s) => s.templates)

  if (activeAlerts.length === 0) return null

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-40 flex max-w-sm flex-col gap-2">
      {activeAlerts.map((alert) => {
        const template = templates.find((t) => t.id === alert.templateId)

        return (
          <div
            key={alert.id}
            className="pointer-events-auto flex items-center gap-2.5 rounded-lg border border-border bg-card py-2 pr-1.5 pl-3 shadow-lg animate-in duration-200 fade-in slide-in-from-right-4"
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: template?.backgroundColor ?? "#dc2626" }}
            />
            <div className="flex min-w-0 flex-col">
              <span className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
                Live · {template?.name ?? "Alert"}
              </span>
              <span className="truncate text-sm font-medium text-foreground">
                {alert.message}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss alert"
              className="ml-auto shrink-0"
              onClick={() => useAlertStore.getState().dismissAlert(alert.id)}
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
