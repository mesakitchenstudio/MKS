"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminFocusRing, adminNavItemClass } from "@/lib/admin-ui";
import { linkIsActive, type AdminNavMatch } from "@/lib/admin-nav";

type AdminNavLinkProps = {
  href: string;
  label: string;
  /** prefix: href and children; exact: href only; recipes-index: /admin and /admin/recipes/* */
  match?: AdminNavMatch;
  muted?: boolean;
};

export function AdminNavLink({
  href,
  label,
  match = "prefix",
  muted = false,
}: AdminNavLinkProps) {
  const pathname = usePathname();
  const active = linkIsActive(pathname, href, match);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${adminNavItemClass} ${adminFocusRing} ${
        active
          ? "text-terracotta hover:text-terracotta-dark"
          : muted
            ? "text-muted hover:text-terracotta"
            : "text-ink hover:text-terracotta"
      }`}
    >
      {label}
    </Link>
  );
}
