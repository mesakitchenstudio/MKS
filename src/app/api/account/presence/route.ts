import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { enrichMemberConnection, touchMemberPresence } from "@/lib/accounts";
import { headers } from "next/headers";

export async function POST(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { enrich?: boolean };
    if (body.enrich) {
      await enrichMemberConnection(email, session.user?.name ?? "", await headers());
    } else {
      await touchMemberPresence(email, session.user?.name ?? "");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Could not record member presence", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
