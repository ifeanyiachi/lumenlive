import { useState } from "react"
import { BellIcon, SendIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useAlertStore } from "@/stores/alert-store"
import { AlertTemplatesManager } from "@/components/alerts/alert-templates-manager"
import { cn } from "@/lib/utils"

export function AlertTrigger() {
  const templates = useAlertStore((s) => s.templates)
  const activeAlerts = useAlertStore((s) => s.activeAlerts)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [managerOpen, setManagerOpen] = useState(false)

  const hasActive = activeAlerts.length > 0

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Alerts"
            data-tour="alerts"
            className="relative"
          >
            <BellIcon className="size-3.5" />
            {hasActive && (
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-500" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">
                Send Alert
              </span>
              {hasActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[0.625rem] text-red-400"
                  onClick={() => useAlertStore.getState().dismissAll()}
                >
                  Dismiss All
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
                    title="Quick send"
                  >
                    <SendIcon className="size-2.5" />
                  </Button>
                </button>

                {expandedId === template.id && (
                  <div className="flex items-center gap-1 px-2 pb-1.5">
                    <Input
                      autoFocus
                      className="h-7 flex-1 text-xs"
                      aria-label="Custom message"
                      placeholder="Custom message..."
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
                      aria-label="Send alert"
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
              Manage Templates
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <AlertTemplatesManager open={managerOpen} onOpenChange={setManagerOpen} />
    </>
  )
}
