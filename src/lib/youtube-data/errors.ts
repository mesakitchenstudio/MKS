export type YouTubeDataErrorCode =
  | "missing_api_key"
  | "missing_channel_id"
  | "quota_exceeded"
  | "api_disabled"
  | "invalid_api_key"
  | "channel_unavailable"
  | "video_unavailable"
  | "network_failure"
  | "api_error";

export class YouTubeDataError extends Error {
  code: YouTubeDataErrorCode;
  httpStatus?: number;

  constructor(code: YouTubeDataErrorCode, message: string, httpStatus?: number) {
    super(message);
    this.name = "YouTubeDataError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function mapYouTubeApiError(status: number, body: string): YouTubeDataError {
  const lower = body.toLowerCase();
  if (status === 403 && (lower.includes("quota") || lower.includes("exceeded"))) {
    return new YouTubeDataError("quota_exceeded", "YouTube Data API quota exceeded.", status);
  }
  if (status === 403 && lower.includes("disabled")) {
    return new YouTubeDataError("api_disabled", "YouTube Data API is disabled for this project.", status);
  }
  if (status === 400 && lower.includes("key")) {
    return new YouTubeDataError("invalid_api_key", "YouTube API key is invalid.", status);
  }
  if (status === 401 || status === 403) {
    return new YouTubeDataError("invalid_api_key", "YouTube API key was rejected.", status);
  }
  if (status === 404) {
    return new YouTubeDataError("channel_unavailable", "YouTube channel or resource was not found.", status);
  }
  return new YouTubeDataError("api_error", `YouTube API request failed (${status}).`, status);
}
