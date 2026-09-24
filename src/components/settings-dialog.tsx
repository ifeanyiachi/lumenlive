import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { SettingsIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useSettingsDialogStore } from "@/lib/settings-dialog"
import type { SettingsSection } from "@/lib/settings-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { getSettingsSections } from "@/components/settings/settings-sections"

/**
 * Settings shell: sidebar navigation + the active section body. All section
 * content lives in `components/settings/sections/**`, registered once in
 * `SETTINGS_SECTIONS`; this component only owns the dialog chrome and wiring to
 * the dialog store.
 */
export function SettingsDialog() {
  const { t } = useTranslation("settings")
  const open = useSettingsDialogStore((s) => s.isOpen)
  const activeSection = useSettingsDialogStore((s) => s.activeSection)
  const setActiveSection = useSettingsDialogStore((s) => s.setActiveSection)
  const openSettingsFn = useSettingsDialogStore((s) => s.openSettings)
  const closeSettings = useSettingsDialogStore((s) => s.closeSettings)

  const sections = getSettingsSections(t)
  const section =
    sections.find((candidate) => candidate.id === activeSection) ?? sections[0]
  const ActiveContent = section.Component

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          openSettingsFn()
        } else {
          closeSettings()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("dialog.buttonLabel")}
          title={t("dialog.buttonTitle")}
          data-tour="settings"
        >
          <SettingsIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-hidden p-0 md:max-h-[600px] md:max-w-[800px] lg:max-w-[900px]">
        <DialogTitle className="sr-only">{t("dialog.title")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("dialog.description")}
        </DialogDescription>
        <SidebarProvider className="min-h-0 items-start">
          <Sidebar collapsible="none" className="hidden md:flex">
            <div className="flex h-14 items-center border-r border-b border-border px-4">
              {t("dialog.title")}
            </div>
            <SidebarContent className="border-r border-border">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {sections.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={item.id === activeSection}
                          onClick={() => setActiveSection(item.id)}
                        >
                          {item.icon}
                          <span>{item.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <main className="flex h-[min(580px,calc(100dvh-1rem))] min-h-0 flex-1 flex-col overflow-hidden">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border">
              <div className="flex min-w-0 flex-1 items-center gap-2 px-3 md:hidden">
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {t("dialog.title")}
                </span>
                <span className="text-muted-foreground/50">/</span>
                <Select
                  value={activeSection}
                  onValueChange={(value) =>
                    setActiveSection(value as SettingsSection)
                  }
                >
                  <SelectTrigger className="h-8 min-w-0 flex-1 border-0 bg-transparent px-2 text-xs font-medium shadow-none focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="hidden items-center gap-2 px-4 md:flex">
                {section.title}
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <ActiveContent />
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}
