import { NextResponse } from "next/server";
import { syncYoutubeChannel } from "@/lib/youtube-data/sync";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");

  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }

  const provided = auth?.startsWith("Bearer ") ? auth.slice(7) : querySecret;
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await syncYoutubeChannel({ forceSnapshot: false });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
