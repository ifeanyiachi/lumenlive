import { toast } from "sonner"
import { isMissingCommand } from "./tauri-env"

/**
 * Report a broadcast-output operation failure: always log it, but only toast the
 * user for a genuine runtime failure — a "command not registered yet" error
 * (common during a dev build) is expected noise and stays in the console.
 */
export function reportOutputError(message: string, error: unknown): void {
  console.error(message, error)
  if (!isMissingCommand(error)) {
    toast.error(message, { description: String(error) })
  }
}
