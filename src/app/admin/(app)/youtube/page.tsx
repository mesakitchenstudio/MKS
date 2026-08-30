import { YoutubeDashboard } from "@/components/admin/YoutubeDashboard";
import { canManageYoutubeSync } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import { summarizeYoutubeContentHealth } from "@/lib/youtube-data/health";
import { loadYoutubeAdminDashboard } from "@/lib/youtube-data/dashboard";

export const dynamic = "force-dynamic";

export default async function AdminYoutubePage() {
  const admin = await requireAccess("youtube");
  const [dashboard, health] = await Promise.all([
    loadYoutubeAdminDashboard(),
    summarizeYoutubeContentHealth(),
  ]);

  return (
    <YoutubeDashboard
      channel={dashboard.channel}
      summary={dashboard.summary}
      videos={dashboard.videos}
      healthSummary={health}
      canSync={canManageYoutubeSync(admin.role)}
    />
  );
}
