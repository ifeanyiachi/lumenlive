import { Button } from "@/components/ui/button"
import { GraduationCapIcon } from "lucide-react"
import { useTutorialStore } from "@/stores/tutorial-store"
import { useSettingsDialogStore } from "@/lib/settings-dialog"
import { useTranslation } from "react-i18next"

export function HelpSection() {
  const { t } = useTranslation("settings")
  const closeSettings = useSettingsDialogStore((s) => s.closeSettings)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{t("help.description")}</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <GraduationCapIcon className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{t("help.tutorial.title")}</p>
              <p className="text-xs text-muted-foreground">
                {t("help.tutorial.description")}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              closeSettings()
              setTimeout(() => {
                useTutorialStore.getState().startTutorial()
              }, 300)
            }}
          >
            <GraduationCapIcon className="mr-1.5 size-3.5" />
            {t("help.tutorial.restart")}
          </Button>
        </div>
      </div>
    </div>
  )
}
