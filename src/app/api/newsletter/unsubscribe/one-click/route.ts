import { NextResponse } from "next/server";
import { looksLikeSignedNewsletterUnsubscribeToken } from "@/lib/newsletter-unsubscribe";
import { unsubscribeNewsletterByToken } from "@/lib/newsletter-subscribe";

export const dynamic = "force-dynamic";

/**
 * RFC 8058 one-click unsubscribe (signed v1 tokens only).
 * Human GET at /newsletter/unsubscribe continues to accept legacy + signed.
 *
 * Body must be application/x-www-form-urlencoded with List-Unsubscribe=One-Click.
 * No login. No subscriber details in the response.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const rawToken = String(url.searchParams.get("token") ?? "").trim();

  // One-click is signed-token authority only — never expand to legacy hash tokens.
  if (!rawToken || !looksLikeSignedNewsletterUnsubscribeToken(rawToken)) {
    return new NextResponse(null, { status: 400 });
  }

  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return new NextResponse(null, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const oneClick = String(form.get("List-Unsubscribe") ?? "").trim();
  if (oneClick !== "One-Click") {
    return new NextResponse(null, { status: 400 });
  }

  const result = await unsubscribeNewsletterByToken(rawToken);
  if (!result.ok) {
    // Generic failure — do not distinguish missing vs invalid for enumeration.
    return new NextResponse(null, { status: 400 });
  }

  // Idempotent success for both fresh and already-unsubscribed.
  return new NextResponse(null, { status: 200 });
}
