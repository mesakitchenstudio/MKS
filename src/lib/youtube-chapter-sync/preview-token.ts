import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ChapterBlockReplacementStrategy } from "@/lib/youtube-chapter-sync/types";

export type ChapterSyncPreviewPayload = {
  v: 1;
  previewId: string;
  recipeId: string;
  videoId: string;
  introLabel: string;
  beforeHash: string;
  remoteEtag: string | null;
  canonicalFingerprint: string;
  replacementStrategy: ChapterBlockReplacementStrategy;
  expiresAt: number;
};

const PREVIEW_TTL_MS = 30 * 60 * 1000;

function secret(): string {
  const value = process.env.ADMIN_SECRET?.trim();
  if (!value) {
    throw new Error("ADMIN_SECRET is not set");
  }
  return value;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  const size = Math.max(left.length, right.length, 1);
  const paddedLeft = Buffer.alloc(size);
  const paddedRight = Buffer.alloc(size);
  left.copy(paddedLeft);
  right.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && left.length === right.length;
}

export function createChapterSyncPreviewToken(
  input: Omit<ChapterSyncPreviewPayload, "v" | "previewId" | "expiresAt"> & {
    previewId?: string;
    ttlMs?: number;
  },
): { previewId: string; token: string; expiresAt: number } {
  const previewId = input.previewId ?? randomBytes(12).toString("hex");
  const expiresAt = Date.now() + (input.ttlMs ?? PREVIEW_TTL_MS);
  const payload: ChapterSyncPreviewPayload = {
    v: 1,
    previewId,
    recipeId: input.recipeId,
    videoId: input.videoId,
    introLabel: input.introLabel,
    beforeHash: input.beforeHash,
    remoteEtag: input.remoteEtag,
    canonicalFingerprint: input.canonicalFingerprint,
    replacementStrategy: input.replacementStrategy,
    expiresAt,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${payloadB64}.${sign(payloadB64)}`;
  return { previewId, token, expiresAt };
}

export function verifyChapterSyncPreviewToken(
  token: string,
): { ok: true; payload: ChapterSyncPreviewPayload } | { ok: false; reason: string } {
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) {
    return { ok: false, reason: "Invalid preview token." };
  }
  let expectedSecret: string;
  try {
    expectedSecret = secret();
  } catch {
    return { ok: false, reason: "Preview verification is not configured." };
  }
  const expected = createHmac("sha256", expectedSecret).update(payloadB64).digest("hex");
  if (!safeEqual(signature, expected)) {
    return { ok: false, reason: "Preview token signature is invalid." };
  }
  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString(),
    ) as ChapterSyncPreviewPayload;
    if (payload.v !== 1) {
      return { ok: false, reason: "Unsupported preview token version." };
    }
    if (!payload.previewId || !payload.recipeId || !payload.videoId) {
      return { ok: false, reason: "Preview token is missing required fields." };
    }
    if (Date.now() >= payload.expiresAt) {
      return { ok: false, reason: "This preview has expired. Generate a new preview." };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "Preview token could not be parsed." };
  }
}

const previewTokenById = new Map<string, { token: string; expiresAt: number }>();

export function storePreviewToken(previewId: string, token: string, expiresAt: number) {
  previewTokenById.set(previewId, { token, expiresAt });
  if (previewTokenById.size > 500) {
    const now = Date.now();
    for (const [id, row] of previewTokenById) {
      if (row.expiresAt <= now) previewTokenById.delete(id);
    }
  }
}

export function resolvePreviewToken(previewId: string): string | null {
  const row = previewTokenById.get(previewId);
  if (!row) return null;
  if (Date.now() >= row.expiresAt) {
    previewTokenById.delete(previewId);
    return null;
  }
  return row.token;
}

export function clearPreviewToken(previewId: string) {
  previewTokenById.delete(previewId);
}

export function clearAllPreviewTokensForTests() {
  previewTokenById.clear();
}
