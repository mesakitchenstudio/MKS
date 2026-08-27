export type NewsletterResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; message: string };

const STORAGE_KEY = "mesa-newsletter";

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

/** Provider boundary — swap implementation when ESP is connected. */
export async function subscribeToNewsletter(email: string): Promise<NewsletterResult> {
  const validated = validateNewsletterEmail(email);
  if (!validated.ok) return validated;

  try {
    if (typeof window === "undefined") {
      return { ok: true };
    }
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as string[];
    const duplicate = existing.includes(validated.email);
    if (!duplicate) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, validated.email]));
    }
    return { ok: true, duplicate };
  } catch {
    return {
      ok: false,
      message: "We could not save your subscription. Please try again in a moment.",
    };
  }
}
