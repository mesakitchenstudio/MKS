import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  clearMemberPresenceSession,
  enrichMemberConnection,
  findActiveMemberByEmail,
  touchMemberPresence,
} from "@/lib/accounts";
import { normalizePresenceSessionKey } from "@/lib/member-presence";
import { headers } from "next/headers";

export async function POST(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || session?.error === "MemberDeleted") {
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

    const member = await findActiveMemberByEmail(email);
    if (!member) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    if (body.enrich) {
      await enrichMemberConnection(email, await headers());
    }
    const touched = await touchMemberPresence(email, session.user?.name ?? "", sessionKey);
    if (!touched) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Could not record member presence", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
