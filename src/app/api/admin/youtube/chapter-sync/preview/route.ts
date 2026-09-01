import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { runChapterSyncPreview } from "@/lib/youtube-chapter-sync/service";

export const runtime = "nodejs";

function requestOrigin(request: Request): string {
  if (process.env.VERCEL) {
    return "https://www.mesakitchenstudio.com";
  }
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canAccess(admin.role, "content")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { recipeId?: string; introLabel?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const recipeId = String(body.recipeId ?? "").trim();
  if (!recipeId) {
    return NextResponse.json({ error: "recipeId is required." }, { status: 400 });
  }

  const result = await runChapterSyncPreview({
    recipeId,
    origin: requestOrigin(request),
    introLabel: body.introLabel?.trim(),
  });

  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "disabled"
          ? 503
          : 400;
    return NextResponse.json({ ok: false, error: result.message, code: result.code }, { status });
  }

  return NextResponse.json({ ...result });
}
