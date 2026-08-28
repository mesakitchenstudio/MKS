import { auth } from "@/auth";
import { homeForRole } from "@/lib/admin-access";
import { getStaffByEmail, syncStaffGooglePhoto } from "@/lib/accounts";
import { writeAdminSession, type AdminSession } from "@/lib/auth";

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
    },
    email,
    image: session?.user?.image,
  };
}

/** Open an admin session from a verified public session + Team Access row. */
export async function bridgePublicSessionToAdmin() {
  const resolved = await resolvePublicStaffForAdmin();
  if (resolved.status !== "authorized") return resolved;

  await syncStaffGooglePhoto(resolved.email, resolved.image);
  await writeAdminSession(resolved.staff);
  return {
    status: "bridged" as const,
    redirectTo: homeForRole(resolved.staff.role),
  };
}
