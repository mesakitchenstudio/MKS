import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import {
  clearGuestPresenceConnection,
  GUEST_COOKIE,
  GUEST_COOKIE_MAX_AGE,
  isTrackablePublicPath,
  newGuestVisitorKey,
  upsertGuestActivity,
} from "@/lib/guest-analytics";
import {
  normalizeGuestConnectionKey,
  resolveGuestVisitorKey,
  shouldSkipGuestAnalytics,
} from "@/lib/guest-tracking";

type GuestBody = {
  path?: string;
  referer?: string;
  pageview?: boolean;
  navId?: string;
  connectionKey?: string;
  /** Shared browser-session bootstrap key from localStorage (not trusted over cookie). */
  clientVisitorKey?: string;
  disconnect?: boolean;
  immediate?: boolean;
};

async function readGuestBody(request: Request): Promise<GuestBody> {
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      return (await request.json()) as GuestBody;
    }
    const text = await request.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as GuestBody;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (
    shouldSkipGuestAnalytics({
      email: session?.user?.email,
      staffRole: session?.staffRole,
    })
  ) {
    return NextResponse.json({ ok: true, skipped: "signed-in" });
  }

  try {
    const body = await readGuestBody(request);
    const jar = await cookies();
    const resolved = resolveGuestVisitorKey({
      cookieKey: jar.get(GUEST_COOKIE)?.value,
      clientVisitorKey: body.clientVisitorKey,
      generate: newGuestVisitorKey,
    });
    const visitorKey = resolved.visitorKey;

    const connectionKey = normalizeGuestConnectionKey(body.connectionKey);

    if (body.disconnect) {
      if (connectionKey) {
        await clearGuestPresenceConnection(visitorKey, connectionKey, {
          immediate: Boolean(body.immediate),
        });
      }
      const response = NextResponse.json({ ok: true, visitorKey });
      response.cookies.set(GUEST_COOKIE, visitorKey, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: GUEST_COOKIE_MAX_AGE,
        secure: process.env.NODE_ENV === "production",
      });
      return response;
    }

    const path = String(body.path || "").trim();
    if (!isTrackablePublicPath(path)) {
      return NextResponse.json({ ok: true, skipped: "path", visitorKey });
    }

    // Heartbeats update presence only. Page views require an explicit pageview flag
    // (never inferred from a missing cookie). Identity: cookie → shared client key → new.
    // Upsert on unique visitorKey makes simultaneous tabs with the same key atomic.
    await upsertGuestActivity({
      visitorKey,
      path,
      referer: body.referer,
      headers: await headers(),
      recordPageView: Boolean(body.pageview),
      navId: body.navId,
      connectionKey,
    });

    const response = NextResponse.json({ ok: true, visitorKey });
    response.cookies.set(GUEST_COOKIE, visitorKey, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: GUEST_COOKIE_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    console.error("Could not record guest analytics", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
