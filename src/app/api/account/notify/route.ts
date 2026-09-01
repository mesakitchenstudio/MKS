import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateMemberNotifyPreference } from "@/lib/accounts";

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

  try {
    const updated = await updateMemberNotifyPreference(email, body.notify);
    return NextResponse.json({ notify: updated.notify });
  } catch {
    return NextResponse.json({ error: "Could not update your preference." }, { status: 500 });
  }
}
