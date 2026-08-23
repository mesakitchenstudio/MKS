import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await isAdmin();

  return (
    <div className="min-h-full bg-[#f3efe6] text-ink">
      <header className="no-print border-b border-line bg-paper">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/admin" className="font-serif text-xl">
            Mesa admin
          </Link>
          {signedIn ? (
            <>
              <nav className="flex flex-wrap gap-4 text-sm font-semibold">
                <Link href="/admin">Recipes</Link>
                <Link href="/admin/types">Types</Link>
                <Link href="/admin/categories">Categories</Link>
                <Link href="/" className="text-muted">
                  View site
                </Link>
              </nav>
              <form action={logoutAction} className="ml-auto">
                <button type="submit" className="text-sm font-semibold text-muted hover:text-terracotta">
                  Log out
                </button>
              </form>
            </>
          ) : null}
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
