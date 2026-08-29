import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import {
  clearGuestPresenceConnection,
  endGuestPresenceForVisitor,
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
  /** End all anonymous presence for this browser's visitor after Member auth. */
  endAllPresence?: boolean;
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
  const session = await auth();
  const body = await readGuestBody(request);
  const jar = await cookies();
  const resolved = resolveGuestVisitorKey({
    cookieKey: jar.get(GUEST_COOKIE)?.value,
    clientVisitorKey: body.clientVisitorKey,
    generate: newGuestVisitorKey,
  });
  const visitorKey = resolved.visitorKey;
  const connectionKey = normalizeGuestConnectionKey(body.connectionKey);
  const signedInMember = shouldSkipGuestAnalytics({
    email: session?.user?.email,
    staffRole: session?.staffRole,
  });

  // Known auth transition: clear anonymous Online presence immediately (keep history).
  if (body.endAllPresence) {
    if (!signedInMember) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    try {
      await endGuestPresenceForVisitor(visitorKey);
      const response = NextResponse.json({ ok: true, ended: true, visitorKey });
      setGuestCookie(response, visitorKey);
      return response;
    } catch (error) {
      console.error("Could not end guest presence after auth", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }

  if (signedInMember) {
    return NextResponse.json({ ok: true, skipped: "signed-in", visitorKey });
  }

  try {
    if (body.disconnect) {
      if (connectionKey) {
        await clearGuestPresenceConnection(visitorKey, connectionKey, {
          immediate: Boolean(body.immediate),
        });
      }
      const response = NextResponse.json({ ok: true, visitorKey });
      setGuestCookie(response, visitorKey);
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
    setGuestCookie(response, visitorKey);
    return response;
  } catch (error) {
    console.error("Could not record guest analytics", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
