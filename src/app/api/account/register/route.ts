import { NextResponse } from "next/server";
import { registerEmailUser } from "@/lib/accounts";
import {
  isValidSignupEmail,
  MEMBER_EXISTING_ACCOUNT_API_ERROR,
  MEMBER_GOOGLE_ONLY_ACCOUNT_API_ERROR,
  MEMBER_PASSWORD_MIN_LENGTH,
} from "@/lib/auth-credentials";
import { subscribeNewsletterServer } from "@/lib/newsletter-subscribe";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    email?: string;
    password?: string;
    notify?: boolean;
  };
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }
  if (!isValidSignupEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (password.length < MEMBER_PASSWORD_MIN_LENGTH) {
    return NextResponse.json(
      { error: `Use at least ${MEMBER_PASSWORD_MIN_LENGTH} characters.` },
      { status: 400 },
    );
  }
  try {
    const user = await registerEmailUser({
      name,
      email,
      password,
    });

    // Same NewsletterSubscriber lifecycle as footer / profile (not User.notify).
    if (Boolean(body.notify)) {
      const subscription = await subscribeNewsletterServer(user.email, "signup");
      if (!subscription.ok) {
        console.error("Member signup newsletter opt-in failed", {
          reason: subscription.message,
        });
      }
    }

    return NextResponse.json({ email: user.email, name: user.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create account.";
    const status =
      message === MEMBER_EXISTING_ACCOUNT_API_ERROR ||
      message === MEMBER_GOOGLE_ONLY_ACCOUNT_API_ERROR ||
      message.includes("already exists")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
