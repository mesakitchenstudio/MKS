import { NextResponse } from "next/server";
import { FORGOT_PASSWORD_GENERIC_MESSAGE, requestPasswordReset } from "@/lib/reset-password";

export async function POST(request: Request) {
  const body = (await request.json()) as { identifier?: string };
  const identifier = String(body.identifier ?? "").trim();
  try {
    await requestPasswordReset(identifier, "member");
  } catch (error) {
    console.error("Could not start member password reset", error);
  }
  return NextResponse.json({ ok: true, message: FORGOT_PASSWORD_GENERIC_MESSAGE });
}
