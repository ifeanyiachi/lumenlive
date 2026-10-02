import { v1 } from "./lumenbo-client"

export type FeedbackKind = "bug" | "feature"

export interface FeedbackSubmission {
  kind: FeedbackKind
  title: string
  description: string
  steps?: string
  expected?: string
  impact?: string
  machineId: string
  organizationId?: string | null
}

export function sendFeedback(
  token: string,
  submission: FeedbackSubmission
): Promise<{ sent: boolean }> {
  return v1<{ sent: boolean }>("/v1/feedback", {
    method: "POST",
    token,
    body: submission,
  })
}
