import { YoutubeDashboard } from "@/components/admin/YoutubeDashboard";
import { canAccess, canManageYoutubeSync } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { summarizeYoutubeContentHealth } from "@/lib/youtube-data/health";
import { loadYoutubeAdminDashboard } from "@/lib/youtube-data/dashboard";

export const dynamic = "force-dynamic";

export default async function AdminYoutubePage() {
  const admin = await requireAccess("youtube");
  const db = getDb();
  const canCreateRecipes = canAccess(admin.role, "content");
  const [dashboard, health, recipeTypes] = await Promise.all([
    loadYoutubeAdminDashboard(),
    summarizeYoutubeContentHealth(),
    canCreateRecipes
      ? db.recipeType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  return (
    <YoutubeDashboard
      channel={dashboard.channel}
      summary={dashboard.summary}
      videos={dashboard.videos}
      healthSummary={health}
      canSync={canManageYoutubeSync(admin.role)}
      canCreateRecipes={canCreateRecipes}
      recipeTypes={recipeTypes}
    />
  );
}
