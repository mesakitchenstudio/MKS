import "server-only";

import { getDb } from "@/lib/db";
import { sendTransactionalEmail, studioInboxEmail } from "@/lib/email";
import { validateNewsletterEmail, type NewsletterResult } from "@/lib/newsletter";

export async function subscribeNewsletterServer(
  email: string,
  source = "site",
): Promise<NewsletterResult> {
  const validated = validateNewsletterEmail(email);
  if (!validated.ok) return validated;

  try {
    const db = getDb();
    const existing = await db.newsletterSubscriber.findUnique({
      where: { email: validated.email },
    });
    if (existing) {
      return { ok: true, duplicate: true };
    }

    await db.newsletterSubscriber.create({
      data: { email: validated.email, source },
    });

    const inbox = studioInboxEmail();
    void sendTransactionalEmail({
      to: inbox,
      subject: `Newsletter signup: ${validated.email}`,
      html: `<p>New newsletter subscriber.</p><p><strong>${validated.email}</strong></p><p>Source: ${source}</p>`,
    });

    return { ok: true };
  } catch (error) {
    console.error("Newsletter subscribe failed", error);
    return {
      ok: false,
      message: "We could not save your subscription. Please try again in a moment.",
    };
  }
}

export async function submitContactMessage(input: {
  name: string;
  email: string;
  message: string;
}) {
  const name = input.name.trim();
  const emailCheck = validateNewsletterEmail(input.email);
  const message = input.message.trim();

  if (!name) {
    return { ok: false as const, message: "Enter your name." };
  }
  if (!emailCheck.ok) {
    return emailCheck;
  }
  if (message.length < 10) {
    return { ok: false as const, message: "Please write a little more in your message." };
  }
  if (message.length > 5000) {
    return { ok: false as const, message: "That message is a bit long. Try a shorter note." };
  }

  try {
    const db = getDb();
    await db.contactMessage.create({
      data: {
        name,
        email: emailCheck.email,
        message,
      },
    });

    const inbox = studioInboxEmail();
    const emailed = await sendTransactionalEmail({
      to: inbox,
      replyTo: emailCheck.email,
      subject: `Contact form: ${name}`,
      html: `<p><strong>${name}</strong> &lt;${emailCheck.email}&gt;</p><p>${message.replace(/\n/g, "<br>")}</p>`,
    });

    return { ok: true as const, emailed };
  } catch (error) {
    console.error("Contact message failed", error);
    return {
      ok: false as const,
      message: "We could not send your note. Please try again in a moment.",
    };
  }
}
