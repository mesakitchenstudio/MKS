import { getDb } from "@/lib/db";
import { validateNewsletterEmail } from "@/lib/newsletter";
import {
  subscribeNewsletterServer,
  unsubscribeNewsletterByEmail,
  type SubscribeNewsletterDeps,
} from "@/lib/newsletter-subscribe";
import { isActiveNewsletterStatus } from "@/lib/newsletter-unsubscribe";

/**
 * NewsletterSubscriber is the sole source of truth for member email-update consent.
 * User.notify is legacy and must not drive this UI.
 */
export async function isMemberNewsletterSubscribed(sessionEmail: string): Promise<boolean> {
  const validated = validateNewsletterEmail(sessionEmail);
  if (!validated.ok) return false;

  const row = await getDb().newsletterSubscriber.findUnique({
    where: { email: validated.email },
    select: { status: true },
  });
  if (!row) return false;
  return isActiveNewsletterStatus(row.status);
}

export type SetMemberNewsletterPreferenceResult =
  | { ok: true; subscribed: boolean }
  | { ok: false; message: string };

/**
 * Opt-in/out for the authenticated member email only.
 * Opt-in uses the shared subscribe lifecycle (source "profile").
 * Opt-out uses authenticated email unsubscribe (no fabricated token).
 */
export async function setMemberNewsletterPreference(
  sessionEmail: string,
  subscribed: boolean,
  deps: SubscribeNewsletterDeps = {},
): Promise<SetMemberNewsletterPreferenceResult> {
  const validated = validateNewsletterEmail(sessionEmail);
  if (!validated.ok) {
    return { ok: false, message: validated.message };
  }

  if (subscribed) {
    const result = await subscribeNewsletterServer(validated.email, "profile", deps);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return { ok: true, subscribed: true };
  }

  const result = await unsubscribeNewsletterByEmail(validated.email);
  if (!result.ok) {
    return { ok: false, message: "Could not update your preference." };
  }
  return { ok: true, subscribed: false };
}
