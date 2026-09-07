import { AdminAuthChrome } from "@/components/admin/AdminAuthChrome";
import { AdminShell } from "@/components/admin/AdminShell";
import { accessLabel, canAccess, homeForRole } from "@/lib/admin-access";
import { getAdminDeployInfo } from "@/lib/admin-deploy";
import { buildAdminNavSections } from "@/lib/admin-nav";
import { countUnreadAdminNotificationsForAdmin } from "@/lib/admin-notifications-server";
import { getAdminSession } from "@/lib/auth";

/** Presentation-only label for the signed-in admin in the shell. */
function adminNavDisplayName(admin: { id: string; name: string }) {
  if (admin.id === "env") return "System owner";
  return admin.name.trim() || "Admin";
}

/** Authenticated admin workspace — sidebar, nav, account controls. */
export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession();

  if (!admin) {
    return <AdminAuthChrome>{children}</AdminAuthChrome>;
  }

  const sections = buildAdminNavSections(admin.role);
  const deployInfo = getAdminDeployInfo();
  const notificationUnreadCount = canAccess(admin.role, "content")
    ? await countUnreadAdminNotificationsForAdmin(admin.id)
    : 0;

  return (
    <div className="min-h-full bg-cream text-ink">
      <AdminShell
        homeHref={homeForRole(admin.role)}
        displayName={adminNavDisplayName(admin)}
        roleLabel={accessLabel(admin.role)}
        sections={sections}
        deployInfo={deployInfo}
        notificationUnreadCount={notificationUnreadCount}
      >
        {children}
      </AdminShell>
    </div>
  );
}
