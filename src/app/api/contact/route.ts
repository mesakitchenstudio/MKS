import { NextResponse } from "next/server";
import { submitContactMessage } from "@/lib/site-forms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    message?: string;
  } | null;

  const result = await submitContactMessage({
    name: String(body?.name || ""),
    email: String(body?.email || ""),
    message: String(body?.message || ""),
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
