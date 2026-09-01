export type ChapterSyncApplySuccess = {
  ok: true;
  status: "synced" | "already_in_sync";
  lastSyncedAt: string;
  warning?: string;
  verified?: boolean;
  metadataStored?: boolean;
};

export type ChapterSyncApplyFailure = {
  ok: false;
  code: string;
  message: string;
};

export type ChapterSyncApplyParsed = ChapterSyncApplySuccess | ChapterSyncApplyFailure;

export function chapterSyncApplyErrorMessage(code: string | undefined, fallback?: string): string {
  switch (code) {
    case "remote_drift":
      return "The YouTube description changed after this preview was generated.";
    case "oauth_write":
    case "oauth_error":
      return "YouTube authorization has expired. Reconnect YouTube.";
    case "verify_failed":
      return "Mesa could not verify the YouTube update.";
    case "preview_invalid":
    case "preview_mismatch":
      return "This preview is no longer valid. Generate a new preview.";
    case "canonical_changed":
    case "export_changed":
    case "strategy_changed":
    case "block_changed":
      return "The YouTube description changed after this preview was generated.";
    case "not_ready":
      return fallback ?? "YouTube export is not ready.";
    case "disabled":
      return "YouTube chapter sync is not enabled.";
    case "network":
      return "Could not reach Mesa. Check your connection and try again.";
    case "invalid_json":
      return "Unexpected server response. Try again.";
    default:
      return fallback ?? "YouTube rejected the update.";
  }
}

export function parseChapterSyncApplyPayload(body: unknown): ChapterSyncApplyParsed {
  if (!body || typeof body !== "object") {
    return {
      ok: false,
      code: "invalid_json",
      message: chapterSyncApplyErrorMessage("invalid_json"),
    };
  }
  const row = body as Record<string, unknown>;
  if (row.ok === true) {
    const lastSyncedAt = String(row.lastSyncedAt ?? "").trim();
    const status = row.status === "already_in_sync" ? "already_in_sync" : "synced";
    return {
      ok: true,
      status,
      lastSyncedAt: lastSyncedAt || new Date().toISOString(),
      warning: row.warning ? String(row.warning) : undefined,
      verified: row.verified === true,
      metadataStored: row.metadataStored !== false,
    };
  }
  const code = String(row.code ?? "apply_failed");
  const message = chapterSyncApplyErrorMessage(
    code,
    row.error ? String(row.error) : row.message ? String(row.message) : undefined,
  );
  return { ok: false, code, message };
}

export function parseChapterSyncApplyHttpResponse(input: {
  ok: boolean;
  status: number;
  body: unknown;
}): ChapterSyncApplyParsed {
  const parsed = parseChapterSyncApplyPayload(input.body);
  if (!input.ok && parsed.ok) {
    return {
      ok: false,
      code: input.status === 409 ? "remote_drift" : input.status === 403 ? "oauth_error" : "apply_failed",
      message: chapterSyncApplyErrorMessage(
        input.status === 409 ? "remote_drift" : input.status === 403 ? "oauth_error" : undefined,
      ),
    };
  }
  if (!input.ok && !parsed.ok) {
    if (input.status >= 500) {
      return {
        ok: false,
        code: parsed.code,
        message: chapterSyncApplyErrorMessage(undefined),
      };
    }
    return parsed;
  }
  if (!input.ok) {
    return {
      ok: false,
      code: "apply_failed",
      message: chapterSyncApplyErrorMessage(undefined),
    };
  }
  return parsed;
}

/** Prevent duplicate in-flight apply requests from rapid clicks. */
export function createChapterSyncApplyFlightGuard() {
  let inFlight = false;
  return {
    tryAcquire(): boolean {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    release() {
      inFlight = false;
    },
    isInFlight() {
      return inFlight;
    },
  };
}

export type ChapterSyncApplyUiState = {
  confirmOpen: boolean;
  applying: boolean;
  modalError: string | null;
  successMessage: string | null;
  lastSyncedAt: string | null;
};

export function chapterSyncApplyUiStart(): Pick<ChapterSyncApplyUiState, "applying" | "modalError"> {
  return { applying: true, modalError: null };
}

export function chapterSyncApplyUiSuccess(input: {
  lastSyncedAt: string;
  warning?: string;
}): Partial<ChapterSyncApplyUiState> {
  const syncedAt = new Date(input.lastSyncedAt);
  const formatted = Number.isNaN(syncedAt.getTime())
    ? input.lastSyncedAt
    : syncedAt.toLocaleString();
  return {
    confirmOpen: false,
    applying: false,
    modalError: null,
    successMessage: input.warning
      ? input.warning
      : `YouTube chapters updated successfully. Last synced: ${formatted}.`,
    lastSyncedAt: input.lastSyncedAt,
  };
}

export function chapterSyncApplyUiFailure(message: string): Partial<ChapterSyncApplyUiState> {
  return {
    applying: false,
    modalError: message,
  };
}
