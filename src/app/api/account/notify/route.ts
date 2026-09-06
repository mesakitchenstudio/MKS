import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { setMemberNewsletterPreference } from "@/lib/member-newsletter";

export async function PATCH(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || session?.error === "MemberDeleted" || session?.error === "SessionRevoked") {
    return NextResponse.json({ error: "Sign in to update your preferences." }, { status: 401 });
  }
  if (session.staffRole) {
    return NextResponse.json({ error: "Studio admin accounts use Team Access settings." }, { status: 403 });
  }

  const body = (await request.json()) as { notify?: unknown };
  if (typeof body.notify !== "boolean") {
    return NextResponse.json({ error: "Invalid preference." }, { status: 400 });
  }

  // Session email only — ignore any client-supplied address.
  try {
    const result = await setMemberNewsletterPreference(email, body.notify);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json({ notify: result.subscribed });
  } catch {
    return NextResponse.json({ error: "Could not update your preference." }, { status: 500 });
  }
}
