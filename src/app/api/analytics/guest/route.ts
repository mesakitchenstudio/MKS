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
import { getDb } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";
import {
  isSignedInPublicMember,
  normalizeGuestConnectionKey,
  normalizeGuestVisitorKey,
  resolveGuestVisitorKey,
  shouldRotateMissingGuestVisitor,
  shouldSkipGuestAnalyticsIngest,
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
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
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

async function visitorKeyExists(visitorKey: string) {
  const key = normalizeGuestVisitorKey(visitorKey);
  if (!key) return false;
  const row = await getDb().guestVisitor.findUnique({
    where: { visitorKey: key },
    select: { id: true },
  });
  return Boolean(row);
}

export async function POST(request: Request) {
  const [session, admin] = await Promise.all([auth(), getAdminSession()]);
  const body = await readGuestBody(request);
  const jar = await cookies();
  const resolved = resolveGuestVisitorKey({
    cookieKey: jar.get(GUEST_COOKIE)?.value,
    clientVisitorKey: body.clientVisitorKey,
    generate: newGuestVisitorKey,
  });
  let visitorKey = resolved.visitorKey;
  const connectionKey = normalizeGuestConnectionKey(body.connectionKey);
  const skipGuestAnalytics = shouldSkipGuestAnalyticsIngest({
    email: session?.user?.email,
    staffRole: session?.staffRole,
    hasVerifiedAdminSession: Boolean(admin),
  });

  // Known auth transition: clear anonymous Online presence immediately (keep history).
  // Public Members only — staff are excluded from ingest and do not use this path.
  if (body.endAllPresence) {
    if (!isSignedInPublicMember({ email: session?.user?.email, staffRole: session?.staffRole })) {
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

  if (skipGuestAnalytics) {
    return NextResponse.json({ ok: true, skipped: "signed-in", visitorKey });
  }

  try {
    const exists = await visitorKeyExists(visitorKey);

    if (body.disconnect) {
      // Deleted visitors need no disconnect work; avoid forcing rotation on unload.
      if (connectionKey && exists) {
        await clearGuestPresenceConnection(visitorKey, connectionKey, {
          immediate: Boolean(body.immediate),
        });
      }
      const response = NextResponse.json({ ok: true, visitorKey });
      if (exists) setGuestCookie(response, visitorKey);
      return response;
    }

    if (
      shouldRotateMissingGuestVisitor({
        source: resolved.source,
        visitorExists: exists,
      })
    ) {
      // Admin deleted this visitor while the browser kept the cookie.
      // Client must mint a fresh identity under lock (multi-tab safe) and retry.
      const response = NextResponse.json(
        { ok: false, code: "stale_visitor", rotate: true },
        { status: 409 },
      );
      // Expire the stale cookie so the next request does not keep winning with it.
      response.cookies.set(GUEST_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
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
    const visitor = await upsertGuestActivity({
      visitorKey,
      path,
      referer: body.referer,
      headers: await headers(),
      recordPageView: Boolean(body.pageview),
      navId: body.navId,
      connectionKey,
      utmSource: body.utmSource,
      utmMedium: body.utmMedium,
      utmCampaign: body.utmCampaign,
    });

    if (!visitor) {
      // Row disappeared mid-request (admin delete) — same recovery as stale cookie.
      const response = NextResponse.json(
        { ok: false, code: "stale_visitor", rotate: true },
        { status: 409 },
      );
      response.cookies.set(GUEST_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        secure: process.env.NODE_ENV === "production",
      });
      return response;
    }

    visitorKey = visitor.visitorKey;
    const response = NextResponse.json({ ok: true, visitorKey });
    setGuestCookie(response, visitorKey);
    return response;
  } catch (error) {
    console.error("Could not record guest analytics", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
