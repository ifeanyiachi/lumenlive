import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTranslation } from "react-i18next"
import { OutputsPanel } from "@/components/broadcast/outputs-panel"
import { GlobalSettings } from "@/components/broadcast/global-settings"

/**
 * Broadcast Settings dialog. Two tabs:
 *  - **Outputs** — a sidebar of every output (Main, Alternate, and any added
 *    Program/Stage outputs) beside a detail pane; add / rename / remove / route all
 *    happen inline here (this replaced the separate Output Manager modal).
 *  - **Global** — settings shared by every output: the clear/idle background and
 *    the holding image.
 */
export function BroadcastSettings({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation("broadcast")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[min(760px,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] grid-rows-[auto_1fr] gap-0 overflow-hidden p-0 sm:max-w-[1120px]"
        showCloseButton={true}
      >
        <DialogHeader className="border-b border-border/70 px-7 pt-6 pr-16 pb-5">
          <DialogTitle className="text-xl">{t("title")}</DialogTitle>
          <DialogDescription>{t("configureOutputs")}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="outputs" className="min-h-0 min-w-0 gap-0">
          <TabsList
            variant="line"
            className="mx-7 mt-2 h-8 shrink-0 gap-4 bg-transparent p-0"
          >
            <TabsTrigger
              value="outputs"
              className="h-8 rounded-none px-0 py-1 text-xs after:bottom-[-1px]"
            >
              {t("outputsTab")}
            </TabsTrigger>
            <TabsTrigger
              value="global"
              className="h-8 rounded-none px-0 py-1 text-xs after:bottom-[-1px]"
            >
              {t("globalTab")}
            </TabsTrigger>
          </TabsList>

          <div className="mt-2 min-h-0 flex-1 overflow-hidden border-t border-border/70">
            {/* forceMount both panels so the Main/Alt output controllers (and any
                in-progress NDI/display state they hold) survive tab switches for
                the dialog's lifetime — Radix hides the inactive one. */}
            <TabsContent
              value="outputs"
              forceMount
              className="h-full min-h-0 data-[state=inactive]:hidden"
            >
              <OutputsPanel open={open} />
            </TabsContent>
            <TabsContent
              value="global"
              forceMount
              className="h-full min-h-0 data-[state=inactive]:hidden"
            >
              <GlobalSettings />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
