import type { Metadata } from "next";
import Link from "next/link";
import { canAccess } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession();

  return (
    <div className="min-h-full bg-[#f3efe6] text-ink">
      <header className="no-print border-b border-line bg-paper">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href={admin?.role === "members" ? "/admin/members" : "/admin"} className="font-serif text-xl">
            Mesa admin
          </Link>
          {admin ? (
            <>
              <nav className="flex flex-wrap gap-4 text-sm font-semibold">
                {canAccess(admin.role, "content") ? (
                  <>
                    <Link href="/admin">Recipes</Link>
                    <Link href="/admin/types">Types</Link>
                    <Link href="/admin/categories">Categories</Link>
                  </>
                ) : null}
                {canAccess(admin.role, "members") ? <Link href="/admin/members">Members</Link> : null}
                {canAccess(admin.role, "staff") ? <Link href="/admin/staff">Admins</Link> : null}
                <Link href="/admin/profile">Profile</Link>
                <Link href="/" className="text-muted">
                  View site
                </Link>
              </nav>
              <div className="ml-auto flex items-center gap-4">
                <p className="hidden text-xs text-muted sm:block">
                  {admin.name} · {admin.role}
                </p>
                <form action={logoutAction}>
                  <button type="submit" className="text-sm font-semibold text-muted hover:text-terracotta">
                    Log out
                  </button>
                </form>
              </div>
            </>
          ) : null}
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
