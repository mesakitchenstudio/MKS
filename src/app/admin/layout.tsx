import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Shared admin metadata only. Authenticated workspace chrome lives in
 * `(app)/layout`; login / password-recovery live in `(auth)/layout` so they
 * never inherit the AdminShell when a staff session exists.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
