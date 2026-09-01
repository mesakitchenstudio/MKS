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

type PresenceBody = {
  enrich?: boolean;
  clear?: boolean;
  /** When true with clear, drop the session immediately (logout). Default: grace disconnect. */
  immediate?: boolean;
  sessionKey?: string;
};

async function readPresenceBody(request: Request): Promise<PresenceBody> {
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      return (await request.json()) as PresenceBody;
    }
    // sendBeacon often arrives as text/plain with a JSON payload.
    const text = await request.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as PresenceBody;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || session?.error === "MemberDeleted" || session?.error === "SessionRevoked") {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const body = await readPresenceBody(request);
    const sessionKey = normalizePresenceSessionKey(body.sessionKey);

    if (body.clear) {
      await clearMemberPresenceSession(email, sessionKey, {
        immediate: Boolean(body.immediate),
      });
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
