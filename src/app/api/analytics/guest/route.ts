import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import {
  GUEST_COOKIE,
  GUEST_COOKIE_MAX_AGE,
  isTrackablePublicPath,
  newGuestVisitorKey,
  upsertGuestActivity,
} from "@/lib/guest-analytics";

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.email) {
    return NextResponse.json({ ok: true, skipped: "signed-in" });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      path?: string;
      referer?: string;
      pageview?: boolean;
    };
    const path = String(body.path || "").trim();
    if (!isTrackablePublicPath(path)) {
      return NextResponse.json({ ok: true, skipped: "path" });
    }

    const jar = await cookies();
    let visitorKey = jar.get(GUEST_COOKIE)?.value?.trim() || "";
    const isNew = !visitorKey;
    if (!visitorKey) visitorKey = newGuestVisitorKey();

    await upsertGuestActivity({
      visitorKey,
      path,
      referer: body.referer,
      headers: await headers(),
      recordPageView: Boolean(body.pageview) || isNew,
    });

    const response = NextResponse.json({ ok: true });
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
