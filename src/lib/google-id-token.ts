import { OAuth2Client } from "google-auth-library";
import { GOOGLE_ONETAP_PROVIDER_ID } from "@/lib/google-onetap";

export type VerifiedGoogleIdToken = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string;
};

function googleAudienceClientId() {
  return process.env.AUTH_GOOGLE_ID?.trim() || "";
}

/** True when Mesa can verify One Tap / GIS ID tokens (same Web client as OAuth). */
export function isGoogleIdTokenAuthConfigured() {
  return Boolean(googleAudienceClientId());
}

/**
 * Server-side Google ID token verification for One Tap / GIS credentials.
 * Validates signature, issuer, audience (AUTH_GOOGLE_ID), expiry, and email_verified.
 */
export async function verifyGoogleIdToken(
  idToken: string,
): Promise<VerifiedGoogleIdToken | null> {
  const audience = googleAudienceClientId();
  const token = idToken.trim();
  if (!audience || !token) return null;

  try {
    const client = new OAuth2Client(audience);
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience,
    });
    const payload = ticket.getPayload();
    if (!payload) return null;

    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!sub || !email) return null;
    if (payload.email_verified !== true) return null;

    const iss = String(payload.iss || "");
    if (iss !== "accounts.google.com" && iss !== "https://accounts.google.com") {
      return null;
    }

    return {
      sub,
      email,
      emailVerified: true,
      name: typeof payload.name === "string" ? payload.name.trim() : "",
      picture: typeof payload.picture === "string" ? payload.picture.trim() : "",
    };
  } catch {
    return null;
  }
}

export { GOOGLE_ONETAP_PROVIDER_ID };
