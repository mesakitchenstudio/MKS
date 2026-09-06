import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getAdminSession } from "@/lib/auth";
import { persistFunnelEvent } from "@/lib/funnel-analytics-server";
import { GUEST_COOKIE, GUEST_COOKIE_MAX_AGE, newGuestVisitorKey } from "@/lib/guest-analytics";
import {
  normalizeGuestVisitorKey,
  resolveGuestVisitorKey,
  shouldSkipGuestAnalyticsIngest,
} from "@/lib/guest-tracking";
import {
  isAnalyticsConsentGranted,
  parsePrivacyConsentValue,
  PRIVACY_CONSENT_COOKIE,
} from "@/lib/privacy-consent";

export const runtime = "nodejs";

type EventBody = {
  name?: string;
  recipeId?: string;
  recipeSlug?: string;
  youtubeVideoId?: string;
  targetRecipeId?: string;
  targetVideoId?: string;
  placement?: string;
  chapterLabel?: string;
  chapterTimeSeconds?: number | null;
  chapterIndex?: number | null;
  meta?: Record<string, unknown>;
  clientVisitorKey?: string;
};

async function readBody(request: Request): Promise<EventBody> {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return (await request.json()) as EventBody;
    }
    const text = await request.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as EventBody;
  } catch {
    return {};
  }
}

function setGuestCookie(response: NextResponse, visitorKey: string) {
  response.cookies.set(GUEST_COOKIE, visitorKey, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function POST(request: Request) {
  try {
    const [session, admin] = await Promise.all([auth(), getAdminSession()]);
    if (
      shouldSkipGuestAnalyticsIngest({
        email: session?.user?.email,
        staffRole: session?.staffRole,
        hasVerifiedAdminSession: Boolean(admin),
      })
    ) {
      return new NextResponse(null, { status: 204 });
    }

    const jar = await cookies();
    const consentDecision = parsePrivacyConsentValue(jar.get(PRIVACY_CONSENT_COOKIE)?.value);
    if (!isAnalyticsConsentGranted(consentDecision)) {
      return new NextResponse(null, { status: 204 });
    }

    const body = await readBody(request);
    const resolved = resolveGuestVisitorKey({
      cookieKey: jar.get(GUEST_COOKIE)?.value,
      clientVisitorKey: body.clientVisitorKey,
      generate: newGuestVisitorKey,
    });
    const visitorKey = normalizeGuestVisitorKey(resolved.visitorKey);
    if (!visitorKey || !body.name) {
      return new NextResponse(null, { status: 204 });
    }

    await persistFunnelEvent({
      visitorKey,
      name: body.name,
      recipeId: body.recipeId,
      recipeSlug: body.recipeSlug,
      youtubeVideoId: body.youtubeVideoId,
      targetRecipeId: body.targetRecipeId,
      targetVideoId: body.targetVideoId,
      placement: body.placement,
      chapterLabel: body.chapterLabel,
      chapterTimeSeconds: body.chapterTimeSeconds,
      chapterIndex: body.chapterIndex,
      meta: body.meta,
    });

    const response = new NextResponse(null, { status: 204 });
    setGuestCookie(response, visitorKey);
    return response;
  } catch (error) {
    console.error("[funnel-analytics] persist failed", error);
    // Fail open — never block the visitor.
    return new NextResponse(null, { status: 204 });
  }
}
