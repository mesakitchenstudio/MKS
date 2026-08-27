import { NextResponse } from "next/server";
import { subscribeNewsletterServer } from "@/lib/site-forms";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const result = await subscribeNewsletterServer(String(body?.email || ""), "site");
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
