export class YouTubeAnalyticsError extends Error {
  code:
    | "not_configured"
    | "not_connected"
    | "oauth_denied"
    | "oauth_state"
    | "token_exchange"
    | "refresh_failed"
    | "revoked"
    | "channel_mismatch"
    | "quota"
    | "api_error"
    | "empty";

  constructor(
    code: YouTubeAnalyticsError["code"],
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "YouTubeAnalyticsError";
    this.code = code;
  }
}

export function analyticsErrorMessage(error: unknown): string {
  if (error instanceof YouTubeAnalyticsError) {
    if (error.detail && !error.message.includes(error.detail)) {
      return `${error.message} ${error.detail}`.trim();
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "YouTube Analytics request failed.";
}
