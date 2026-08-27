export type NewsletterResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; message: string };

export function validateNewsletterEmail(raw: string) {
  const email = raw.trim().toLowerCase();
  if (!email) {
    return { ok: false as const, message: "Enter your email address." };
  }
  if (email.length > 254) {
    return { ok: false as const, message: "That email address looks too long." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, message: "Enter a valid email address." };
  }
  return { ok: true as const, email };
}

/** Client helper — posts to the server subscribe API (persists in the database). */
export async function subscribeToNewsletter(email: string): Promise<NewsletterResult> {
  const validated = validateNewsletterEmail(email);
  if (!validated.ok) return validated;

  try {
    const response = await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: validated.email }),
    });
    const data = (await response.json()) as NewsletterResult;
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        message:
          !data.ok && "message" in data
            ? data.message
            : "We could not save your subscription. Please try again in a moment.",
      };
    }
    return data;
  } catch {
    return {
      ok: false,
      message: "We could not save your subscription. Please try again in a moment.",
    };
  }
}
