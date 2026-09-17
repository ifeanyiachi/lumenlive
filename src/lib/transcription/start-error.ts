import { LicensingError } from "@/services/lumenbo-client"

/**
 * Turn the account-key request failure into operator-facing copy. Known backend
 * messages name safe operational causes (for example, a provider key could not
 * be minted), while the error code remains available for support.
 */
export function describeTranscriptionStartError(error: unknown): string {
  if (!(error instanceof LicensingError)) {
    return "LumenLive could not prepare transcription. Try again. If this keeps happening, contact support."
  }

  switch (error.code) {
    case "NETWORK":
      return "LumenLive could not be reached. Check your internet connection and try again. (Error: NETWORK)"
    case "UNAUTHORIZED":
      return "Your LumenLive sign-in session is no longer valid. Sign out, then sign in again. (Error: UNAUTHORIZED)"
    case "NOT_FOUND":
      return "Transcription is not available on the LumenLive server this app is using. Update the app or contact support. (Error: NOT_FOUND)"
    case "VALIDATION_ERROR":
      return "LumenLive rejected the transcription request. Check your account, then try again. (Error: VALIDATION_ERROR)"
    case "SERVICE_UNAVAILABLE":
      return `${error.message} (Error: SERVICE_UNAVAILABLE)`
    case "INTERNAL":
      return `LumenLive could not prepare a transcription key: ${error.message}. Try again shortly. (Error: INTERNAL)`
    default:
      return `LumenLive could not prepare transcription. ${error.message} (Error: ${error.code})`
  }
}
