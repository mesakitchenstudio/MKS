/**
 * Newsletter unsubscribe tokens — legacy hash + signed recurring-safe v1.
 *
 * Legacy (welcome): random plaintext → store SHA-256 only → GET unsubscribe.
 * Signed v1 (campaigns): HMAC over subscriber ID — no DB write, no hash rotation.
 *
 * Do not import signing secret into Client Components.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { siteUrl } from "@/lib/email";

export type NewsletterSubscriberStatus = "active" | "unsubscribed";

export const NEWSLETTER_UNSUBSCRIBE_SIGNED_VERSION = "v1";
export const NEWSLETTER_UNSUBSCRIBE_PURPOSE = "newsletter-unsubscribe";
export const NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV =
  "NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET";
/** Minimum UTF-8 length for a production-capable signing secret. */
export const NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_MIN_LENGTH = 32;
/** Upper bound for any unsubscribe token accepted from the public web. */
export const NEWSLETTER_UNSUBSCRIBE_TOKEN_MAX_LENGTH = 512;

export function hashNewsletterUnsubscribeToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Cryptographically random unsubscribe token (hex). Store only the hash. */
export function createNewsletterUnsubscribeToken() {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashNewsletterUnsubscribeToken(token),
  };
}

export function buildNewsletterUnsubscribeUrl(token: string, baseUrl = siteUrl()) {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Future campaign List-Unsubscribe one-click URL (signed token only). */
export function buildNewsletterOneClickUnsubscribeUrl(token: string, baseUrl = siteUrl()) {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/api/newsletter/unsubscribe/one-click?token=${encodeURIComponent(token)}`;
}

/**
 * Pure header builder for future marketing sends when one-click is available.
 * Does not call any provider.
 */
export function buildNewsletterUnsubscribeHeaders(input: {
  humanUnsubscribeUrl: string;
  oneClickUnsubscribeUrl?: string | null;
}): Record<string, string> {
  const human = String(input.humanUnsubscribeUrl ?? "").trim();
  if (!human) return {};
  const oneClick = String(input.oneClickUnsubscribeUrl ?? "").trim();
  if (oneClick) {
    return {
      "List-Unsubscribe": `<${oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }
  return {
    "List-Unsubscribe": `<${human}>`,
  };
}

export function isActiveNewsletterStatus(status: string | null | undefined) {
  return (status || "active") === "active";
}

/**
 * Server-only signing secret. No AUTH_SECRET / ADMIN_SECRET fallback.
 * Missing or too-short → null (signed tokens unavailable; legacy still works).
 */
export function getNewsletterUnsubscribeSigningSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = String(env[NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV] ?? "").trim();
  if (!value) return null;
  if (value.length < NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_MIN_LENGTH) return null;
  return value;
}

function safeEqualUtf8(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  const size = Math.max(left.length, right.length, 1);
  const paddedLeft = Buffer.alloc(size);
  const paddedRight = Buffer.alloc(size);
  left.copy(paddedLeft);
  right.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && left.length === right.length;
}

function encodeSubscriberId(subscriberId: string): string {
  return Buffer.from(subscriberId, "utf8").toString("base64url");
}

function decodeSubscriberId(encoded: string): string | null {
  try {
    const id = Buffer.from(encoded, "base64url").toString("utf8");
    if (!id || id.length > 80) return null;
    // Reject control chars / whitespace in IDs.
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
    return id;
  } catch {
    return null;
  }
}

function canonicalSignedPayload(subscriberId: string): string {
  return `${NEWSLETTER_UNSUBSCRIBE_PURPOSE}:${NEWSLETTER_UNSUBSCRIBE_SIGNED_VERSION}:${subscriberId}`;
}

function signCanonical(subscriberId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(canonicalSignedPayload(subscriberId), "utf8")
    .digest("base64url");
}

/** True when the token is in the signed v1 wire format (prefix-based; no legacy fallback). */
export function looksLikeSignedNewsletterUnsubscribeToken(token: string): boolean {
  const raw = String(token ?? "").trim();
  return raw.startsWith(`${NEWSLETTER_UNSUBSCRIBE_SIGNED_VERSION}.`);
}

export type BuildSignedNewsletterUnsubscribeTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: "secret_missing" | "invalid_subscriber_id" };

/**
 * Stateless signed unsubscribe token. No DB. No hash rotation. Deterministic.
 */
export function buildSignedNewsletterUnsubscribeToken(input: {
  subscriberId: string;
  secret?: string | null;
}): BuildSignedNewsletterUnsubscribeTokenResult {
  const subscriberId = String(input.subscriberId ?? "").trim();
  if (!subscriberId || subscriberId.length > 80 || !/^[A-Za-z0-9_-]+$/.test(subscriberId)) {
    return { ok: false, reason: "invalid_subscriber_id" };
  }
  const secret =
    input.secret === undefined
      ? getNewsletterUnsubscribeSigningSecret()
      : String(input.secret ?? "").trim() || null;
  if (!secret || secret.length < NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_MIN_LENGTH) {
    return { ok: false, reason: "secret_missing" };
  }
  const token = [
    NEWSLETTER_UNSUBSCRIBE_SIGNED_VERSION,
    encodeSubscriberId(subscriberId),
    signCanonical(subscriberId, secret),
  ].join(".");
  return { ok: true, token };
}

export type VerifySignedNewsletterUnsubscribeTokenResult =
  | { valid: true; subscriberId: string }
  | { valid: false };

/**
 * Verify a signed v1 unsubscribe token. Never throws on malformed public input.
 * Tokens that look signed but fail MAC are invalid — no legacy downgrade.
 */
export function verifySignedNewsletterUnsubscribeToken(
  token: string,
  secret?: string | null,
): VerifySignedNewsletterUnsubscribeTokenResult {
  const raw = String(token ?? "").trim();
  if (!raw || raw.length > NEWSLETTER_UNSUBSCRIBE_TOKEN_MAX_LENGTH) {
    return { valid: false };
  }
  if (!looksLikeSignedNewsletterUnsubscribeToken(raw)) {
    return { valid: false };
  }

  const parts = raw.split(".");
  if (parts.length !== 3) {
    return { valid: false };
  }
  const [version, encodedId, signature] = parts;
  if (version !== NEWSLETTER_UNSUBSCRIBE_SIGNED_VERSION) {
    return { valid: false };
  }
  if (!encodedId || !signature) {
    return { valid: false };
  }
  // Reject signature that is not base64url-ish.
  if (!/^[A-Za-z0-9_-]+$/.test(signature) || signature.length < 20 || signature.length > 128) {
    return { valid: false };
  }

  const subscriberId = decodeSubscriberId(encodedId);
  if (!subscriberId) {
    return { valid: false };
  }

  const resolvedSecret =
    secret === undefined
      ? getNewsletterUnsubscribeSigningSecret()
      : String(secret ?? "").trim() || null;
  if (!resolvedSecret || resolvedSecret.length < NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_MIN_LENGTH) {
    return { valid: false };
  }

  const expected = signCanonical(subscriberId, resolvedSecret);
  if (!safeEqualUtf8(signature, expected)) {
    return { valid: false };
  }
  return { valid: true, subscriberId };
}

export type ResolveNewsletterUnsubscribeTokenResult =
  | { kind: "signed"; subscriberId: string }
  | { kind: "legacy"; token: string }
  | { kind: "invalid" };

/**
 * Dual resolver: signed v1 first (fail-closed), else legacy hex bearer.
 */
export function resolveNewsletterUnsubscribeToken(
  rawToken: string,
  secret?: string | null,
): ResolveNewsletterUnsubscribeTokenResult {
  const token = String(rawToken ?? "").trim();
  if (!token || token.length > NEWSLETTER_UNSUBSCRIBE_TOKEN_MAX_LENGTH) {
    return { kind: "invalid" };
  }

  if (looksLikeSignedNewsletterUnsubscribeToken(token)) {
    const verified = verifySignedNewsletterUnsubscribeToken(token, secret);
    if (!verified.valid) return { kind: "invalid" };
    return { kind: "signed", subscriberId: verified.subscriberId };
  }

  // Legacy random hex tokens (welcome flow).
  if (token.length < 32 || token.length > 128) {
    return { kind: "invalid" };
  }
  if (!/^[a-fA-F0-9]+$/.test(token)) {
    return { kind: "invalid" };
  }
  return { kind: "legacy", token };
}
