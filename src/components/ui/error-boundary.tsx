import * as React from "react"
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type ErrorBoundaryProps = {
  children: React.ReactNode
  /**
   * Custom fallback. Receives the caught error and a `reset` callback that
   * clears the error and re-mounts the subtree. When omitted, a default
   * inline fallback is shown.
   */
  fallback?: (args: { error: Error; reset: () => void }) => React.ReactNode
  /** Optional label describing the region that failed (e.g. "media panel"). */
  label?: string
  /** Called when an error is caught — hook for logging/telemetry. */
  onError?: (error: Error, info: React.ErrorInfo) => void
  className?: string
}

type ErrorBoundaryState = { error: Error | null }

/**
 * Catches render-time errors in its subtree and shows a recoverable fallback
 * instead of unmounting the whole React tree. Wrap panels and overlays
 * individually so a crash in one region can't take down the live output.
 */
class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface in the devtools console; callers can add telemetry via onError.
    console.error("ErrorBoundary caught an error", error, info)
    this.props.onError?.(error, info)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) {
      return this.props.fallback({ error, reset: this.reset })
    }

    return (
      <div
        role="alert"
        className={cn(
          "flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 p-6 text-center",
          this.props.className
        )}
      >
        <TriangleAlertIcon
          aria-hidden="true"
          className="size-8 text-destructive"
        />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Something went wrong
            {this.props.label ? ` in the ${this.props.label}` : ""}.
          </p>
          <p className="max-w-[42ch] text-xs text-muted-foreground">
            {error.message || "An unexpected error occurred."}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={this.reset}>
          <RotateCcwIcon />
          Try again
        </Button>
      </div>
    )
  }
}

export { ErrorBoundary }
