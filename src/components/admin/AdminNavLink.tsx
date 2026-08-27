"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminFocusRing, adminNavItemClass } from "@/lib/admin-ui";

type AdminNavLinkProps = {
  href: string;
  label: string;
  /** prefix: href and children; exact: href only; recipes-index: /admin and /admin/recipes/* */
  match?: "exact" | "prefix" | "recipes-index";
  muted?: boolean;
};

function linkIsActive(pathname: string, href: string, match: AdminNavLinkProps["match"]) {
  if (match === "recipes-index") {
    return pathname === "/admin" || pathname.startsWith("/admin/recipes");
  }
  if (match === "exact") return pathname === href;
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

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
