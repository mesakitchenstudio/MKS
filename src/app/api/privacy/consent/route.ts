import { NextResponse } from "next/server";
import {
  createPrivacyConsentRecord,
  privacyConsentCookieOptions,
  PRIVACY_CONSENT_COOKIE,
  serializePrivacyConsent,
} from "@/lib/privacy-consent";
import { GUEST_COOKIE } from "@/lib/guest-analytics";

export const dynamic = "force-dynamic";

type Body = {
  analytics?: boolean;
  googleSignInEnhancements?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (
    !body ||
    typeof body.analytics !== "boolean" ||
    typeof body.googleSignInEnhancements !== "boolean"
  ) {
    return NextResponse.json({ ok: false, message: "Invalid consent payload." }, { status: 400 });
  }

  const record = createPrivacyConsentRecord({
    analytics: body.analytics,
    googleSignInEnhancements: body.googleSignInEnhancements,
  });

  const response = NextResponse.json({ ok: true, consent: record });
  const options = privacyConsentCookieOptions();
  response.cookies.set(PRIVACY_CONSENT_COOKIE, serializePrivacyConsent(record), options);

  // Expire HttpOnly guest analytics cookie when optional analytics is off.
  if (!record.analytics) {
    response.cookies.set(GUEST_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}
