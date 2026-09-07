import { NextResponse } from "next/server";
import { canAccess } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { listActiveMediaAssetsForPicker } from "@/lib/media-asset-server";

export const runtime = "nodejs";

/** Active MediaAsset picker feed for recipe editor — content role only. */
export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccess(admin.role, "content")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || undefined;
  const assets = await listActiveMediaAssetsForPicker(query);
  return NextResponse.json({
    assets: assets.map((asset) => ({
      id: asset.id,
      url: asset.url,
      title: asset.title,
      altText: asset.altText,
      kind: asset.kind,
      source: asset.source,
      updatedAt: asset.updatedAt,
    })),
  });
}
