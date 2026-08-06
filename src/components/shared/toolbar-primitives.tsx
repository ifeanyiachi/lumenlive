import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border" />
}

export function ToolbarToggle({
  active,
  onClick,
  icon: Icon,
  title,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  title: string
}) {
  return (
    <Button
      variant={active ? "default" : "ghost"}
      size="icon-sm"
      className="size-7"
      onClick={onClick}
      title={title}
    >
      <Icon className="size-3.5" />
    </Button>
  )
}

export function ToolbarAlignButton({
  active,
  onClick,
  icon: Icon,
  title,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  title: string
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn("size-7", active && "bg-accent text-accent-foreground")}
      onClick={onClick}
      title={title}
    >
      <Icon className="size-3.5" />
    </Button>
  )
}
