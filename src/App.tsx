import { Dashboard } from "@/components/layout/dashboard"
import { useRemoteControl } from "@/hooks/use-remote-control"
import { useStageSources } from "@/hooks/use-stage-sources"
import { TutorialOverlay } from "@/components/tutorial/tutorial-overlay"
import { AlertOverlay } from "@/components/alerts/alert-overlay"
import { CountdownOverlay } from "@/components/countdown/countdown-overlay"
import { DragGhost } from "@/components/panels/drag-ghost"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { Toaster } from "sonner"

export function App() {
  useRemoteControl()
  useStageSources()
  return (
    <>
      {/* Isolate each region so a render error in one can't unmount the
          others — the live output overlays must survive a control-panel crash. */}
      <ErrorBoundary label="control panel">
        <Dashboard />
      </ErrorBoundary>
      <ErrorBoundary label="alert overlay" fallback={() => null}>
        <AlertOverlay />
      </ErrorBoundary>
      <ErrorBoundary label="countdown overlay" fallback={() => null}>
        <CountdownOverlay />
      </ErrorBoundary>
      <ErrorBoundary label="tutorial" fallback={() => null}>
        <TutorialOverlay />
      </ErrorBoundary>
      <DragGhost />
      <Toaster position="bottom-right" />
    </>
  )
}

export default App
