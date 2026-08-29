import { ApiError } from "@google/genai";

export type AiGeminiErrorCode =
  | "GEMINI_CONFIGURATION_ERROR"
  | "GEMINI_AUTH_FAILED"
  | "GEMINI_RATE_LIMIT"
  | "GEMINI_TIMEOUT"
  | "VIDEO_INPUT_FAILED"
  | "VIDEO_UNAVAILABLE"
  | "VIDEO_UNSUPPORTED"
  | "INVALID_YOUTUBE_URL"
  | "RECIPE_SCHEMA_GENERATION_FAILED"
  | "RECIPE_SCHEMA_EMPTY"
  | "RECIPE_SCHEMA_MALFORMED"
  | "GEMINI_MODEL_ERROR"
  | "GEMINI_UNKNOWN_ERROR";

export type AiGeminiError = {
  code: AiGeminiErrorCode;
  message: string;
  stage: "config" | "video_probe" | "recipe_schema" | "unknown";
  httpStatus?: number;
  detail?: string;
};

function friendlyMessage(code: AiGeminiErrorCode): string {
  switch (code) {
    case "GEMINI_CONFIGURATION_ERROR":
      return "Gemini is not configured on the server.";
    case "GEMINI_AUTH_FAILED":
      return "Could not connect to Gemini.";
    case "GEMINI_RATE_LIMIT":
      return "Gemini rate limit reached. Try again in a few minutes.";
    case "GEMINI_TIMEOUT":
      return "Gemini timed out while analyzing the video.";
    case "VIDEO_INPUT_FAILED":
      return "Could not analyze this video.";
    case "VIDEO_UNAVAILABLE":
      return "This YouTube video is private, unavailable, or blocked.";
    case "VIDEO_UNSUPPORTED":
      return "This YouTube video format is not supported for analysis.";
    case "INVALID_YOUTUBE_URL":
      return "Enter a valid YouTube watch, youtu.be, or Shorts URL.";
    case "RECIPE_SCHEMA_GENERATION_FAILED":
      return "Gemini read the video but could not generate valid recipe data.";
    case "RECIPE_SCHEMA_EMPTY":
      return "Gemini returned an empty recipe response.";
    case "RECIPE_SCHEMA_MALFORMED":
      return "Gemini returned recipe data in an unexpected format.";
    case "GEMINI_MODEL_ERROR":
      return "The configured Gemini model could not complete this request.";
    default:
      return "Could not analyze the video with Gemini.";
  }
}

export function buildAiGeminiError(
  code: AiGeminiErrorCode,
  stage: AiGeminiError["stage"],
  overrides?: Partial<Pick<AiGeminiError, "message" | "httpStatus" | "detail">>,
): AiGeminiError {
  return {
    code,
    stage,
    message: overrides?.message ?? friendlyMessage(code),
    httpStatus: overrides?.httpStatus,
    detail: overrides?.detail,
  };
}

export function mapGeminiException(
  error: unknown,
  stage: AiGeminiError["stage"],
): AiGeminiError {
  const httpStatus = error instanceof ApiError ? error.status : undefined;
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  const lower = message.toLowerCase();

  if (httpStatus === 401 || httpStatus === 403 || lower.includes("api key") || lower.includes("permission denied")) {
    return buildAiGeminiError("GEMINI_AUTH_FAILED", stage, { httpStatus, detail: message });
  }
  if (httpStatus === 429 || lower.includes("rate") || lower.includes("quota")) {
    return buildAiGeminiError("GEMINI_RATE_LIMIT", stage, { httpStatus, detail: message });
  }
  if (httpStatus === 404 || lower.includes("not found") || lower.includes("video not found")) {
    return buildAiGeminiError("VIDEO_UNAVAILABLE", stage, { httpStatus, detail: message });
  }
  if (lower.includes("private") || lower.includes("unavailable") || lower.includes("region")) {
    return buildAiGeminiError("VIDEO_UNAVAILABLE", stage, { httpStatus, detail: message });
  }
  if (lower.includes("timeout") || lower.includes("deadline") || lower.includes("timed out")) {
    return buildAiGeminiError("GEMINI_TIMEOUT", stage, { httpStatus, detail: message });
  }
  if (lower.includes("unsupported") || lower.includes("invalid video")) {
    return buildAiGeminiError("VIDEO_UNSUPPORTED", stage, { httpStatus, detail: message });
  }
  if (lower.includes("model") && (lower.includes("not found") || lower.includes("invalid"))) {
    return buildAiGeminiError("GEMINI_MODEL_ERROR", stage, { httpStatus, detail: message });
  }
  if (stage === "recipe_schema" && (lower.includes("schema") || lower.includes("json"))) {
    return buildAiGeminiError("RECIPE_SCHEMA_GENERATION_FAILED", stage, { httpStatus, detail: message });
  }
  if (stage === "video_probe") {
    return buildAiGeminiError("VIDEO_INPUT_FAILED", stage, { httpStatus, detail: message });
  }
  return buildAiGeminiError("GEMINI_UNKNOWN_ERROR", stage, { httpStatus, detail: message });
}

export function logGeminiFailure(input: {
  stage: AiGeminiError["stage"];
  code: AiGeminiErrorCode;
  model: string;
  videoId?: string;
  httpStatus?: number;
  detail?: string;
}) {
  console.error("Gemini recipe assistant failed", {
    stage: input.stage,
    code: input.code,
    model: input.model,
    videoId: input.videoId,
    httpStatus: input.httpStatus,
    detail: input.detail,
  });
}
