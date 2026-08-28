import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { Logo } from "@/components/Logo";
import { accessLabel, homeForRole } from "@/lib/admin-access";
import { buildAdminNavSections } from "@/lib/admin-nav";
import { adminFocusRing, adminNavItemClass } from "@/lib/admin-ui";
import { getAdminSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/** Presentation-only label for the signed-in admin in the shell. */
function adminNavDisplayName(admin: { id: string; name: string }) {
  if (admin.id === "env") return "System owner";
  return admin.name.trim() || "Admin";
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession();

  if (!admin) {
    return (
      <div className="min-h-full bg-cream text-ink">
        <header className="no-print relative z-40 border-b border-line/80 bg-paper/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-2.5 md:px-6">
            <div className="flex shrink-0 items-center">
              <Logo aside="Admin" />
            </div>
            <Link
              href="/"
              className={`shrink-0 ${adminNavItemClass} text-muted hover:text-terracotta ${adminFocusRing}`}
            >
              Back to site
            </Link>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-6xl justify-center px-5 pb-12 pt-14 md:px-6 md:pt-[5.5rem]">
          {children}
        </div>
      </div>
    );
  }

  const sections = buildAdminNavSections(admin.role);

  return (
    <div className="min-h-full bg-cream text-ink">
      <AdminShell
        homeHref={homeForRole(admin.role)}
        displayName={adminNavDisplayName(admin)}
        roleLabel={accessLabel(admin.role)}
        sections={sections}
      >
        {children}
      </AdminShell>
    </div>
  );
}
