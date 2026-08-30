import { YoutubeDashboard } from "@/components/admin/YoutubeDashboard";
import { canManageYoutubeSync } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import { buildYoutubeContentHealth } from "@/lib/youtube-data/health";
import { loadYoutubeAdminDashboard } from "@/lib/youtube-data/dashboard";

export const dynamic = "force-dynamic";

export default async function AdminYoutubePage() {
  const admin = await requireAccess("youtube");
  const [dashboard, healthIssues] = await Promise.all([
    loadYoutubeAdminDashboard(),
    buildYoutubeContentHealth(),
  ]);

  return (
    <YoutubeDashboard
      channel={dashboard.channel}
      summary={dashboard.summary}
      videos={dashboard.videos}
      healthIssues={healthIssues}
      canSync={canManageYoutubeSync(admin.role)}
    />
  );
}
