import type { Metadata } from "next";
import Link from "next/link";
import { AdminNavLink } from "@/components/admin/AdminNavLink";
import { AdminPeopleMenu } from "@/components/admin/AdminPeopleMenu";
import { Logo } from "@/components/Logo";
import { accessLabel, canAccess, homeForRole } from "@/lib/admin-access";
import { adminFocusRing, adminNavItemClass, adminWorkspaceMaxWidth } from "@/lib/admin-ui";
import { getAdminSession } from "@/lib/auth";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const guestLinkFocus = adminFocusRing;

/** Presentation-only label for the signed-in admin in the header. */
function adminNavDisplayName(admin: { id: string; name: string }) {
  if (admin.id === "env") return "System owner";
  return admin.name.trim() || "Admin";
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession();
  const peopleItems = admin
    ? [
        ...(canAccess(admin.role, "members")
          ? [
              { href: "/admin/members", label: "Members" },
              { href: "/admin/visitors", label: "Visitors" },
            ]
          : []),
        ...(canAccess(admin.role, "staff") ? [{ href: "/admin/staff", label: "Admins" }] : []),
      ]
    : [];

  return (
    <div className="min-h-full bg-cream text-ink">
      <header className="no-print relative z-40 border-b border-line/80 bg-paper/90 backdrop-blur-md">
        {admin ? (
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5 md:px-6">
            <div className="flex shrink-0 items-center">
              <Logo href={homeForRole(admin.role)} aside="Admin" />
            </div>
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {canAccess(admin.role, "content") ? (
                <>
                  <AdminNavLink href="/admin" label="Recipes" match="recipes-index" />
                  <AdminNavLink href="/admin/types" label="Types" />
                  <AdminNavLink href="/admin/categories" label="Categories" />
                  <AdminNavLink href="/admin/reviews" label="Reviews" />
                </>
              ) : null}
              <AdminPeopleMenu items={peopleItems} />
              <AdminNavLink href="/admin/profile" label="Profile" />
              <AdminNavLink href="/" label="View site" muted />
            </nav>
            <div className="ml-auto flex items-center gap-x-3 sm:gap-x-4">
              <p className="hidden h-8 items-center text-xs leading-none text-muted/90 sm:inline-flex">
                <span>{adminNavDisplayName(admin)}</span>
                <span aria-hidden className="mx-1.5">
                  ·
                </span>
                <span>{accessLabel(admin.role)}</span>
              </p>
              <form action={logoutAction} className="inline-flex items-center">
                <button
                  type="submit"
                  className={`${adminNavItemClass} border-0 bg-transparent p-0 text-muted hover:text-terracotta ${adminFocusRing}`}
                >
                  Log out
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-2.5 md:px-6">
            <div className="flex shrink-0 items-center">
              <Logo aside="Admin" />
            </div>
            <Link
              href="/"
              className={`shrink-0 ${adminNavItemClass} text-muted hover:text-terracotta ${guestLinkFocus}`}
            >
              Back to site
            </Link>
          </div>
        )}
      </header>
      {admin ? (
        <div className={`mx-auto ${adminWorkspaceMaxWidth} px-5 py-10 md:px-6`}>{children}</div>
      ) : (
        <div className="mx-auto flex w-full max-w-6xl justify-center px-5 pb-12 pt-14 md:px-6 md:pt-[5.5rem]">
          {children}
        </div>
      )}
    </div>
  );
}
