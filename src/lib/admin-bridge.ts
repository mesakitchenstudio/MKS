import { auth } from "@/auth";
import { getStaffByEmail } from "@/lib/accounts";
import type { AdminSession } from "@/lib/auth";

export type PublicStaffResolution =
  | { status: "unauthenticated" }
  | { status: "unauthorized" }
  | {
      status: "authorized";
      staff: Omit<AdminSession, "exp">;
      email: string;
      image?: string | null;
    };

/**
 * Resolve Team Access from the authenticated public (NextAuth) identity only.
 * Never trusts client-supplied email/name.
 *
 * This is LOOKUP ONLY — it must never mint AdminSession. Explicit Admin
 * password or Google login creates sessions; a public member session alone
 * must not resurrect revoked Studio access.
 */
export async function resolvePublicStaffForAdmin(): Promise<PublicStaffResolution> {
  const session = await auth();
  const email = session?.user?.email?.trim() || "";
  if (!email) return { status: "unauthenticated" };

  const staff = await getStaffByEmail(email);
  if (!staff) return { status: "unauthorized" };

  return {
    status: "authorized",
    staff: {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      sv: staff.sessionVersion ?? 0,
    },
    email,
    image: session?.user?.image,
  };
}
