import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { enrichMemberConnection } from "@/lib/accounts";

export async function POST() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    await enrichMemberConnection(email, session.user?.name ?? "", await headers());
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Could not enrich member connection", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
