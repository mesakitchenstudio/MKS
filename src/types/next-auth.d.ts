import type { AccessLevel } from "@/lib/admin-access";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    staffRole?: AccessLevel | null;
    /** Set when the JWT is still present but the member row was deleted. */
    error?: "MemberDeleted" | "SessionRevoked";
    user?: DefaultSession["user"];
  }

  interface User {
    memberSessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    staffRole?: AccessLevel | null;
    error?: "MemberDeleted" | "SessionRevoked";
    memberSessionVersion?: number;
  }
}
