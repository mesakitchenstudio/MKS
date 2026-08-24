import type { AccessLevel } from "@/lib/admin-access";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    staffRole?: AccessLevel | null;
    user: DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    staffRole?: AccessLevel | null;
  }
}
