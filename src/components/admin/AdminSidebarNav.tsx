"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminNavSection } from "@/lib/admin-nav";
import { linkIsActive } from "@/lib/admin-nav";
import type { AdminDeployInfo } from "@/lib/admin-deploy";
import {
  adminFocusRing,
  adminNavItemClass,
  adminSidebarFocusRing,
  adminSidebarLinkClass,
  adminSidebarSectionLabelClass,
} from "@/lib/admin-ui";

type AdminSidebarNavProps = {
  sections: AdminNavSection[];
  displayName: string;
  roleLabel: string;
  deployInfo: AdminDeployInfo;
  onNavigate?: () => void;
  id?: string;
  /** Mobile drawer: scroll sections + account together so short viewports keep full nav reachable. */
  compactScroll?: boolean;
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

  const linkClass = `${adminSidebarLinkClass} ${adminSidebarFocusRing} ${
    active
      ? "border-l-2 border-terracotta bg-sand/15 pl-[calc(0.75rem-2px)] text-terracotta"
      : muted
        ? "border-l-2 border-transparent text-muted hover:bg-sand/20 hover:text-terracotta"
        : "border-l-2 border-transparent text-ink hover:bg-sand/20 hover:text-ink"
  }`;

  const children = (
    <>
      <span>{label}</span>
      {leavesAdmin ? (
        <span className="ml-1.5 text-[0.65rem] font-normal text-muted" aria-hidden>
          ↗
        </span>
      ) : null}
      {leavesAdmin ? <span className="sr-only"> (opens in new tab)</span> : null}
    </>
  );

  if (leavesAdmin) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={linkClass}
    >
      {children}
    </Link>
  );
}

function NavSections({
  sections,
  onNavigate,
}: {
  sections: AdminNavSection[];
  onNavigate?: () => void;
}) {
  return (
    <>
      {sections.map((section, index) => (
        <div key={section.id}>
          <p className={`${adminSidebarSectionLabelClass} ${index === 0 ? "pt-0" : "pt-[1.125rem]"}`}>
            {section.label}
          </p>
          <ul className="m-0 list-none space-y-0 p-0">
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
    </>
  );
}

/** Scroll container for mobile drawer — exported for layout regression tests. */
export const adminMobileDrawerNavScrollClass =
  "min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]";

const compactScrollFooterClass = "mt-4 border-t border-line/80 pt-4";

function SidebarIdentity({
  displayName,
  roleLabel,
  deployInfo,
}: {
  displayName: string;
  roleLabel: string;
  deployInfo: AdminDeployInfo;
}) {
  return (
    <>
      <p className="px-3 text-[0.8125rem] leading-snug text-ink/80">
        <span className="block font-medium text-ink/90">{displayName}</span>
        <span className="text-muted">{roleLabel}</span>
      </p>
      <p
        className="mt-1.5 px-3 font-mono text-[0.625rem] leading-snug tracking-wide text-muted/80"
        title={
          deployInfo.fullSha
            ? `Deployed commit ${deployInfo.fullSha} (${deployInfo.envLabel})`
            : "Local development build"
        }
      >
        {deployInfo.envLabel} · {deployInfo.shortSha}
      </p>
    </>
  );
}

function AccountLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <p className={`${adminSidebarSectionLabelClass} mt-4 pt-0`}>Account</p>
      <ul className="m-0 list-none space-y-0 p-0">
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
          <form action="/admin/logout" method="post">
            <button
              type="submit"
              className={`${adminSidebarLinkClass} ${adminSidebarFocusRing} w-full border-l-2 border-transparent text-left font-normal text-muted hover:bg-sand/20 hover:text-ink`}
            >
              Log out
            </button>
          </form>
        </li>
      </ul>
    </>
  );
}

function AccountFooter({
  displayName,
  roleLabel,
  deployInfo,
  onNavigate,
}: {
  displayName: string;
  roleLabel: string;
  deployInfo: AdminDeployInfo;
  onNavigate?: () => void;
}) {
  return (
    <div className={compactScrollFooterClass}>
      <SidebarIdentity displayName={displayName} roleLabel={roleLabel} deployInfo={deployInfo} />
      <AccountLinks onNavigate={onNavigate} />
    </div>
  );
}

export function AdminSidebarNav({
  sections,
  displayName,
  roleLabel,
  deployInfo,
  onNavigate,
  id,
  compactScroll = false,
}: AdminSidebarNavProps) {
  if (compactScroll) {
    return (
      <nav id={id} aria-label="Admin" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className={adminMobileDrawerNavScrollClass}>
          <NavSections sections={sections} onNavigate={onNavigate} />
          <AccountFooter
            displayName={displayName}
            roleLabel={roleLabel}
            deployInfo={deployInfo}
            onNavigate={onNavigate}
          />
        </div>
      </nav>
    );
  }

  return (
    <nav id={id} aria-label="Admin" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4">
        <NavSections sections={sections} onNavigate={onNavigate} />
      </div>

      <div className="shrink-0 border-t border-line/80 px-3 py-4">
        <SidebarIdentity displayName={displayName} roleLabel={roleLabel} deployInfo={deployInfo} />
        <AccountLinks onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

/** Compact nav trigger label for mobile header. */
export function adminMobileNavTriggerClass() {
  return `${adminNavItemClass} h-10 rounded-sm border border-line bg-paper px-3.5 text-ink hover:text-terracotta ${adminFocusRing}`;
}
