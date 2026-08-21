import { useState } from "react"
import { PlusIcon, TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAlertStore } from "@/stores/alert-store"
import { FontFamilyPicker } from "@/components/shared/font-family-picker"
import { ColorSwatch } from "@/components/ui/color-swatch"
import type {
  AlertTemplate,
  AlertStyle,
  AlertPosition,
  AlertAnimation,
} from "@/types/alert"
import { cn } from "@/lib/utils"

export function AlertTemplatesManager({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const templates = useAlertStore((s) => s.templates)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = templates.find((t) => t.id === selectedId)

  const handleCreate = () => {
    const template: AlertTemplate = {
      id: crypto.randomUUID(),
      name: "New Alert",
      style: "banner",
      position: "top",
      backgroundColor: "#2563eb",
      textColor: "#ffffff",
      fontSize: 32,
      duration: 10000,
      animation: "fade",
    }
    useAlertStore.getState().createTemplate(template)
    setSelectedId(template.id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Alert Templates</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4" style={{ minHeight: 360 }}>
          {/* Left: template list — sticky so it stays in view while the taller
              editor pane scrolls the dialog. */}
          <div className="sticky top-0 flex w-48 shrink-0 flex-col self-start rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
              <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                Templates
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New template"
                onClick={handleCreate}
              >
                <PlusIcon className="size-3" />
              </Button>
            </div>
            <div className="flex flex-1 flex-col gap-0.5 p-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                    selectedId === t.id
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  onClick={() => setSelectedId(t.id)}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: t.backgroundColor }}
                  />
                  <span className="truncate">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: template editor */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {selected ? (
              <TemplateEditor template={selected} />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-xs text-muted-foreground">
                  Select a template to edit
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TemplateEditor({ template }: { template: AlertTemplate }) {
  const update = (updates: Partial<AlertTemplate>) =>
    useAlertStore.getState().updateTemplate(template.id, updates)

  return (
    <>
      <FieldGroup label="Name">
        <Input
          className="h-7 text-xs"
          value={template.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </FieldGroup>

      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="Style">
          <select
            className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
            value={template.style}
            onChange={(e) => update({ style: e.target.value as AlertStyle })}
          >
            <option value="banner">Banner</option>
            <option value="lower-third">Lower Third</option>
            <option value="fullscreen">Fullscreen</option>
          </select>
        </FieldGroup>

        <FieldGroup label="Position">
          <select
            className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
            value={template.position}
            onChange={(e) =>
              update({ position: e.target.value as AlertPosition })
            }
          >
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>
        </FieldGroup>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="Background Color">
          <div className="flex items-center gap-2">
            <ColorSwatch
              className="size-7"
              value={template.backgroundColor}
              onChange={(backgroundColor) => update({ backgroundColor })}
            />
            <Input
              className="h-7 flex-1 text-xs"
              value={template.backgroundColor}
              onChange={(e) => update({ backgroundColor: e.target.value })}
            />
          </div>
        </FieldGroup>

        <FieldGroup label="Text Color">
          <div className="flex items-center gap-2">
            <ColorSwatch
              className="size-7"
              value={template.textColor}
              onChange={(textColor) => update({ textColor })}
            />
            <Input
              className="h-7 flex-1 text-xs"
              value={template.textColor}
              onChange={(e) => update({ textColor: e.target.value })}
            />
          </div>
        </FieldGroup>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="Font Size (px)">
          <Input
            type="number"
            className="h-7 text-xs"
            value={template.fontSize}
            min={12}
            max={120}
            onChange={(e) => update({ fontSize: Number(e.target.value) })}
          />
        </FieldGroup>

        <FieldGroup label="Duration (seconds)">
          <Input
            type="number"
            className="h-7 text-xs"
            value={template.duration / 1000}
            min={0}
            step={1}
            onChange={(e) =>
              update({ duration: Number(e.target.value) * 1000 })
            }
          />
        </FieldGroup>
      </div>

      <FieldGroup label="Animation">
        <select
          className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
          value={template.animation}
          onChange={(e) =>
            update({ animation: e.target.value as AlertAnimation })
          }
        >
          <option value="fade">Fade</option>
          <option value="slide">Slide</option>
          <option value="none">None</option>
        </select>
      </FieldGroup>

      {/* Font */}
      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="Font Family">
          <FontFamilyPicker
            value={template.fontFamily ?? "Inter"}
            onChange={(v) => update({ fontFamily: v })}
          />
        </FieldGroup>
        <FieldGroup label="Font Weight">
          <select
            className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
            value={String(template.fontWeight ?? 600)}
            onChange={(e) => update({ fontWeight: Number(e.target.value) })}
          >
            <option value="400">Regular</option>
            <option value="500">Medium</option>
            <option value="600">Semibold</option>
            <option value="700">Bold</option>
            <option value="800">Extra Bold</option>
          </select>
        </FieldGroup>
      </div>

      {/* Text Shadow */}
      <FieldGroup label="Text Shadow">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <ColorSwatch
              className="size-6"
              value={template.textShadow?.color ?? "#000000"}
              onChange={(color) =>
                update({
                  textShadow: {
                    offsetX: template.textShadow?.offsetX ?? 2,
                    offsetY: template.textShadow?.offsetY ?? 2,
                    blur: template.textShadow?.blur ?? 4,
                    color,
                  },
                })
              }
            />
            <span className="text-[0.625rem] text-muted-foreground">Blur</span>
            <div className="w-20">
              <Slider
                value={[template.textShadow?.blur ?? 0]}
                onValueChange={([v]) =>
                  update({
                    textShadow: {
                      offsetX: template.textShadow?.offsetX ?? 2,
                      offsetY: template.textShadow?.offsetY ?? 2,
                      blur: v,
                      color: template.textShadow?.color ?? "#000000",
                    },
                  })
                }
                min={0}
                max={20}
                step={1}
              />
            </div>
            {template.textShadow && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-5"
                onClick={() => update({ textShadow: undefined })}
                title="Remove shadow"
              >
                <TrashIcon className="size-2.5" />
              </Button>
            )}
          </div>
        </div>
      </FieldGroup>

      {/* Text Outline */}
      <FieldGroup label="Text Outline">
        <div className="flex items-center gap-2">
          <ColorSwatch
            className="size-6"
            value={template.outline?.color ?? "#000000"}
            onChange={(color) =>
              update({
                outline: {
                  width: template.outline?.width ?? 2,
                  color,
                },
              })
            }
          />
          <span className="text-[0.625rem] text-muted-foreground">Width</span>
          <div className="w-20">
            <Slider
              value={[template.outline?.width ?? 0]}
              onValueChange={([v]) =>
                update({
                  outline: {
                    width: v,
                    color: template.outline?.color ?? "#000000",
                  },
                })
              }
              min={0}
              max={8}
              step={0.5}
            />
          </div>
          {template.outline && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-5"
              onClick={() => update({ outline: undefined })}
              title="Remove outline"
            >
              <TrashIcon className="size-2.5" />
            </Button>
          )}
        </div>
      </FieldGroup>

      {/* Icon */}
      <FieldGroup label="Icon (emoji or text)">
        <Input
          className="h-7 text-xs"
          value={template.icon ?? ""}
          placeholder="e.g. 🔔 or ⚠️"
          onChange={(e) => update({ icon: e.target.value || undefined })}
        />
      </FieldGroup>

      {/* Preview */}
      <FieldGroup label="Preview">
        <div
          className="relative overflow-hidden rounded-md border border-border bg-black/80"
          style={{ height: 120 }}
        >
          <AlertPreview template={template} />
        </div>
      </FieldGroup>

      <Button
        variant="destructive"
        size="sm"
        className="h-7 self-start text-xs"
        onClick={() => useAlertStore.getState().deleteTemplate(template.id)}
      >
        <TrashIcon className="mr-1.5 size-3" />
        Delete Template
      </Button>
    </>
  )
}

function AlertPreview({ template }: { template: AlertTemplate }) {
  const isTop = template.position === "top"
  const isFullscreen = template.style === "fullscreen"
  const isLowerThird = template.style === "lower-third"

  const shadowStr = template.textShadow
    ? `${template.textShadow.offsetX}px ${template.textShadow.offsetY}px ${template.textShadow.blur}px ${template.textShadow.color}`
    : undefined

  const outlineStr = template.outline
    ? `-1px -1px 0 ${template.outline.color}, 1px -1px 0 ${template.outline.color}, -1px 1px 0 ${template.outline.color}, 1px 1px 0 ${template.outline.color}`
    : undefined

  const combinedShadow =
    [shadowStr, outlineStr].filter(Boolean).join(", ") || undefined

  return (
    <div
      className="absolute flex items-center justify-center gap-2 px-4"
      style={{
        left: 0,
        right: 0,
        ...(isFullscreen
          ? { top: 0, bottom: 0 }
          : isTop
            ? { top: 0, height: isLowerThird ? "33%" : 40 }
            : { bottom: 0, height: isLowerThird ? "33%" : 40 }),
        backgroundColor: template.backgroundColor,
        color: template.textColor,
        fontSize: Math.min(template.fontSize * 0.4, 20),
        fontWeight: template.fontWeight ?? 600,
        fontFamily: template.fontFamily ?? "Inter",
        textShadow: combinedShadow,
      }}
    >
      {template.icon && <span>{template.icon}</span>}
      {template.name}
    </div>
  )
}
