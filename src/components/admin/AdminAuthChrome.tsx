import Link from "next/link";
import { Logo } from "@/components/Logo";
import { adminFocusRing, adminNavItemClass } from "@/lib/admin-ui";

/** Standalone Studio auth chrome — no sidebar, role, or account menu. */
export function AdminAuthChrome({ children }: { children: React.ReactNode }) {
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
