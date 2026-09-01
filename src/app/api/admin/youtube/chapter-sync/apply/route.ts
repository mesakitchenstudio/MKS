import { NextResponse } from "next/server";
import { canManageYoutubeSync } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { runChapterSyncApply } from "@/lib/youtube-chapter-sync/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canManageYoutubeSync(admin.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: { recipeId?: string; previewId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const recipeId = String(body.recipeId ?? "").trim();
  const previewId = String(body.previewId ?? "").trim();
  if (!recipeId || !previewId) {
    return NextResponse.json(
      { error: "recipeId and previewId are required." },
      { status: 400 },
    );
  }

  const adminLabel = admin.email || admin.name || admin.id;
  const result = await runChapterSyncApply({
    recipeId,
    previewId,
    adminId: admin.id,
    adminLabel,
  });

  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "oauth_write" || result.code === "oauth_error"
          ? 403
          : result.code === "remote_drift" ||
              result.code === "canonical_changed" ||
              result.code === "video_changed" ||
              result.code === "preview_invalid" ||
              result.code === "preview_missing"
            ? 409
            : 400;
    return NextResponse.json({ ok: false, error: result.message, code: result.code }, { status });
  }

  return NextResponse.json({ ...result });
}
