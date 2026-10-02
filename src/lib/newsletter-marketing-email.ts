/**
 * Phase 12E — Newsletter marketing email transport boundary.
 * Reuses Resend infrastructure without changing transactional call sites.
 */

import {
  isTransactionalEmailConfigured,
  sendTransactionalEmailDetailed,
  type SendTransactionalEmailResult,
} from "@/lib/email";

export type SendNewsletterMarketingEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
};

export type NewsletterMarketingMailer = (
  input: SendNewsletterMarketingEmailInput,
) => Promise<SendTransactionalEmailResult>;

export function isNewsletterMarketingEmailConfigured() {
  return isTransactionalEmailConfigured();
}

/**
 * Dedicated marketing/newsletter send path.
 * Same Resend adapter as transactional mail; callers attach List-Unsubscribe headers.
 */
export async function sendNewsletterMarketingEmailDetailed(
  input: SendNewsletterMarketingEmailInput,
): Promise<SendTransactionalEmailResult> {
  return sendTransactionalEmailDetailed({
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    headers: input.headers,
  });
}
