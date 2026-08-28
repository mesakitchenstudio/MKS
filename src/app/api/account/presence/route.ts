import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  clearMemberPresenceSession,
  enrichMemberConnection,
  touchMemberPresence,
} from "@/lib/accounts";
import { normalizePresenceSessionKey } from "@/lib/member-presence";
import { headers } from "next/headers";

export async function POST(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      enrich?: boolean;
      clear?: boolean;
      sessionKey?: string;
    };
    const sessionKey = normalizePresenceSessionKey(body.sessionKey);

    if (body.clear) {
      await clearMemberPresenceSession(email, sessionKey);
      return NextResponse.json({ ok: true });
    }

    if (body.enrich) {
      await enrichMemberConnection(email, session.user?.name ?? "", await headers());
    }
    await touchMemberPresence(email, session.user?.name ?? "", sessionKey);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Could not record member presence", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
