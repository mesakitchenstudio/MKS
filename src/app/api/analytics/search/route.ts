import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getAdminSession } from "@/lib/auth";
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
import { persistSearchEvent } from "@/lib/search-analytics-server";

export const runtime = "nodejs";

type SearchBody = {
  queryRaw?: string;
  queryNorm?: string;
  resultCount?: number;
  zeroResult?: boolean;
  placement?: string;
  filters?: Record<string, string | number | boolean | null | undefined>;
  clientVisitorKey?: string;
};

async function readBody(request: Request): Promise<SearchBody> {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return (await request.json()) as SearchBody;
    }
    const text = await request.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as SearchBody;
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
    if (!visitorKey) {
      return new NextResponse(null, { status: 204 });
    }

    await persistSearchEvent({
      visitorKey,
      queryRaw: body.queryRaw,
      queryNorm: body.queryNorm,
      resultCount: body.resultCount,
      zeroResult: body.zeroResult,
      placement: body.placement,
      filters: body.filters,
    });

    const response = new NextResponse(null, { status: 204 });
    setGuestCookie(response, visitorKey);
    return response;
  } catch (error) {
    console.error("[search-analytics] persist failed", error);
    return new NextResponse(null, { status: 204 });
  }
}
