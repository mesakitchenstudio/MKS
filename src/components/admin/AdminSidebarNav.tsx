"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/admin/actions";
import type { AdminNavSection } from "@/lib/admin-nav";
import { linkIsActive } from "@/lib/admin-nav";
import {
  adminFocusRing,
  adminNavItemClass,
  adminSidebarLinkClass,
  adminSidebarSectionLabelClass,
} from "@/lib/admin-ui";

type AdminSidebarNavProps = {
  sections: AdminNavSection[];
  displayName: string;
  roleLabel: string;
  onNavigate?: () => void;
  id?: string;
};

function SidebarLink({
  href,
  label,
  match = "prefix",
  onNavigate,
  muted = false,
  leavesAdmin = false,
}: {
  href: string;
  label: string;
  match?: "exact" | "prefix" | "recipes-index";
  onNavigate?: () => void;
  muted?: boolean;
  leavesAdmin?: boolean;
}) {
  const pathname = usePathname();
  const active = linkIsActive(pathname, href, match);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`${adminSidebarLinkClass} ${adminFocusRing} ${
        active
          ? "border-l-2 border-terracotta bg-sand/40 pl-[calc(0.75rem-2px)] text-terracotta"
          : muted
            ? "border-l-2 border-transparent text-muted hover:bg-cream/80 hover:text-terracotta"
            : "border-l-2 border-transparent text-ink hover:bg-cream/80 hover:text-terracotta"
      }`}
    >
      <span>{label}</span>
      {leavesAdmin ? (
        <span className="ml-1.5 text-[0.65rem] font-normal text-muted" aria-hidden>
          ↗
        </span>
      ) : null}
      {leavesAdmin ? <span className="sr-only"> (opens public site)</span> : null}
    </Link>
  );
}

export function AdminSidebarNav({
  sections,
  displayName,
  roleLabel,
  onNavigate,
  id,
}: AdminSidebarNavProps) {
  return (
    <nav id={id} aria-label="Admin" className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.id}>
            <p className={adminSidebarSectionLabelClass}>{section.label}</p>
            <ul className="m-0 list-none space-y-0.5 p-0">
              {section.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink
                    href={item.href}
                    label={item.label}
                    match={item.match}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-line/80 px-3 py-4">
        <p className="px-3 text-xs leading-snug text-muted">
          <span className="block font-semibold text-ink/85">{displayName}</span>
          <span>{roleLabel}</span>
        </p>

        <p className={`${adminSidebarSectionLabelClass} mt-3`}>Account</p>
        <ul className="m-0 list-none space-y-0.5 p-0">
          <li>
            <SidebarLink href="/admin/profile" label="Profile" match="prefix" onNavigate={onNavigate} />
          </li>
          <li>
            <SidebarLink
              href="/"
              label="View site"
              match="exact"
              onNavigate={onNavigate}
              muted
              leavesAdmin
            />
          </li>
          <li>
            <form action={logoutAction}>
              <button
                type="submit"
                className={`${adminSidebarLinkClass} ${adminFocusRing} w-full border-l-2 border-transparent text-left text-muted hover:bg-cream/80 hover:text-terracotta`}
              >
                Log out
              </button>
            </form>
          </li>
        </ul>
      </div>
    </nav>
  );
}

/** Compact nav trigger label for mobile header. */
export function adminMobileNavTriggerClass() {
  return `${adminNavItemClass} h-10 rounded-sm border border-line bg-paper px-3.5 text-ink hover:text-terracotta ${adminFocusRing}`;
}
