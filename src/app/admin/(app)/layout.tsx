import { AdminAuthChrome } from "@/components/admin/AdminAuthChrome";
import { AdminShell } from "@/components/admin/AdminShell";
import { accessLabel, homeForRole } from "@/lib/admin-access";
import { getAdminDeployInfo } from "@/lib/admin-deploy";
import { buildAdminNavSections } from "@/lib/admin-nav";
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

  return (
    <div className="min-h-full bg-cream text-ink">
      <AdminShell
        homeHref={homeForRole(admin.role)}
        displayName={adminNavDisplayName(admin)}
        roleLabel={accessLabel(admin.role)}
        sections={sections}
        deployInfo={deployInfo}
      >
        {children}
      </AdminShell>
    </div>
  );
}
