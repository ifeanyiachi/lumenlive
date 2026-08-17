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
import { useSettingsDialogStore } from "@/lib/settings-dialog"

import {
  SETTINGS_SECTIONS,
  SETTINGS_SECTIONS_BY_ID,
} from "@/components/settings/settings-sections"

/**
 * Settings shell: sidebar navigation + the active section body. All section
 * content lives in `components/settings/sections/**`, registered once in
 * `SETTINGS_SECTIONS`; this component only owns the dialog chrome and wiring to
 * the dialog store.
 */
export function SettingsDialog() {
  const open = useSettingsDialogStore((s) => s.isOpen)
  const activeSection = useSettingsDialogStore((s) => s.activeSection)
  const setActiveSection = useSettingsDialogStore((s) => s.setActiveSection)
  const openSettingsFn = useSettingsDialogStore((s) => s.openSettings)
  const closeSettings = useSettingsDialogStore((s) => s.closeSettings)

  const section = SETTINGS_SECTIONS_BY_ID[activeSection]
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
          aria-label="Settings"
          data-tour="settings"
        >
          <SettingsIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden p-0 md:max-h-[600px] md:max-w-[800px] lg:max-w-[900px]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Configure audio, display mode, and API keys.
        </DialogDescription>
        <SidebarProvider className="items-start">
          <Sidebar collapsible="none" className="hidden md:flex">
            <div className="flex h-14 items-center border-r border-b border-border px-4">
              Settings
            </div>
            <SidebarContent className="border-r border-border">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {SETTINGS_SECTIONS.map((item) => (
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
          <main className="flex h-[580px] flex-1 flex-col overflow-hidden">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border">
              <div className="flex items-center gap-2 px-4">
                {section.title}
              </div>
            </header>
            <div className="flex flex-1 flex-col overflow-y-auto p-4">
              <ActiveContent />
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}
