import { useBroadcastStore } from "@/stores/broadcast-store"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TextProperties } from "@/components/broadcast/text-properties"
import { BackgroundProperties } from "@/components/broadcast/background-properties"
import { LayoutProperties } from "@/components/broadcast/layout-properties"
import { TransitionProperties } from "@/components/broadcast/transition-properties"
import { ThemeLayerList } from "@/components/broadcast/theme-layer-list"
import { ElementProperties } from "@/components/broadcast/element-properties"

export function PropertiesPanel() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const selectedElement = useBroadcastStore((s) => s.selectedElement)

  if (!draftTheme) {
    return (
      <div className="flex h-full flex-col items-center justify-center border-l border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Select a theme to edit</p>
      </div>
    )
  }

  const selectedCustomElement =
    selectedElement &&
    selectedElement !== "verse" &&
    selectedElement !== "reference"
      ? (draftTheme.elements ?? []).find((e) => e.id === selectedElement)
      : null

  const subtitle =
    selectedElement === "verse"
      ? "Editing verse properties"
      : selectedElement === "reference"
        ? "Editing reference properties"
        : selectedCustomElement
          ? `Editing ${selectedCustomElement.name.toLowerCase()}`
          : "Select an element or use tabs below"

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-card">
      {/* Header */}
      <div className="flex h-14 flex-col gap-0.5 border-b border-border px-4 py-2">
        <h3 className="truncate text-sm font-semibold">{draftTheme.name}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      {/* Tabs */}
      <Tabs
        defaultValue="layers"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 px-4 pt-3">
          <TabsList variant="default" className="w-full">
            <TabsTrigger value="layers">Layers</TabsTrigger>
            <TabsTrigger value="background">Background</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
            <TabsTrigger value="transition">Transition</TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="layers" className="mt-0 p-4">
            <ThemeLayerList />
            <div className="mt-4 border-t border-border pt-4">
              {selectedCustomElement ? (
                <ElementProperties />
              ) : (
                <TextProperties />
              )}
            </div>
          </TabsContent>
          <TabsContent value="background" className="mt-0 p-4">
            <BackgroundProperties />
          </TabsContent>
          <TabsContent value="layout" className="mt-0 p-4">
            <LayoutProperties />
          </TabsContent>
          <TabsContent value="transition" className="mt-0 p-4">
            <TransitionProperties />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  )
}
