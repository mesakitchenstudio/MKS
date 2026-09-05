import { createHash, randomBytes } from "node:crypto";
import { siteUrl } from "@/lib/email";

export type NewsletterSubscriberStatus = "active" | "unsubscribed";

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

export function isActiveNewsletterStatus(status: string | null | undefined) {
  return (status || "active") === "active";
}
