import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import {
  authenticateEmailUser,
  findActiveMemberByEmail,
  getStaffByEmail,
  recordConnection,
  removeMemberByEmail,
  syncMemberGooglePhoto,
  syncStaffGooglePhoto,
  upsertGoogleUser,
} from "@/lib/accounts";
import { isAccessLevel, type AccessLevel } from "@/lib/admin-access";

if (process.env.VERCEL) {
  // Always pin the public host so OAuth callbacks match Google Cloud redirect URIs.
  process.env.AUTH_URL = "https://www.mesakitchenstudio.com";
  process.env.AUTH_TRUST_HOST = "true";
}

const googleId = process.env.AUTH_GOOGLE_ID?.trim() ?? "";
const googleSecret = process.env.AUTH_GOOGLE_SECRET?.trim() ?? "";
const googleReady = Boolean(googleId && googleSecret);

function asStaffRole(value: unknown): AccessLevel | null {
  return typeof value === "string" && isAccessLevel(value) ? value : null;
}

export const { handlers, signIn, signOut, auth } = NextAuth((request) => ({
  trustHost: true,
  providers: [
    ...(googleReady
      ? [
          Google({
            clientId: googleId,
            clientSecret: googleSecret,
          }),
        ]
      : []),
    Credentials({
      credentials: {
        name: { label: "Name", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials.email ?? "").trim();
        const password = String(credentials.password ?? "");
        if (!email || password.length < 6) return null;
        try {
          const user = await authenticateEmailUser(email, password);
          return { id: user.id, email: user.email, name: user.name };
        } catch {
          return null;
        }
      },
    }),
  ],
  pages: {
    error: "/auth/error",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return true;
      const staff = await getStaffByEmail(user.email);
      if (staff) {
        // Team access may use the public NextAuth session, but admin access requires
        // a separate mesa_admin_session from /admin/login or /admin/session.
        try {
          if (account?.provider === "google") {
            await syncStaffGooglePhoto(user.email, user.image);
          }
        } catch (error) {
          console.error("Could not sync staff Google photo", error);
        }
        await removeMemberByEmail(user.email);
        return true;
      }
      if (account?.provider === "google") {
        try {
          await upsertGoogleUser(user.email, user.name ?? "", user.image);
        } catch (error) {
          console.error("Could not create Google member", error);
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email;
        token.name = user.name;
        delete token.error;
      }
      if (user?.image) {
        token.picture = user.image;
      }
      if (token.email) {
        const staff = await getStaffByEmail(String(token.email));
        token.staffRole = asStaffRole(staff?.role);
        // JWT alone must not keep a deleted member authenticated.
        if (!token.staffRole) {
          const member = await findActiveMemberByEmail(String(token.email));
          if (!member) {
            return { error: "MemberDeleted" };
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.error === "MemberDeleted") {
        return {
          expires: session.expires,
          user: undefined,
          staffRole: null,
          error: "MemberDeleted",
        };
      }

      if (session.user) {
        session.user.email = (token.email as string) || session.user.email;
        session.user.name = (token.name as string) || session.user.name;
        if (token.picture) session.user.image = String(token.picture);
      }
      session.staffRole = asStaffRole(token.staffRole);
      session.error = undefined;

      if (session.user?.email) {
        try {
          if (session.staffRole) {
            await removeMemberByEmail(session.user.email);
          } else {
            const member = await findActiveMemberByEmail(session.user.email);
            if (!member) {
              return {
                expires: session.expires,
                user: undefined,
                staffRole: null,
                error: "MemberDeleted",
              };
            }
            if (token.picture) {
              await syncMemberGooglePhoto(session.user.email, String(token.picture));
            }
            if (member.name && member.name !== session.user.name) {
              session.user.name = member.name;
            }
          }
        } catch (error) {
          console.error("Could not validate member session", error);
        }
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (!user.email) return;
      try {
        await recordConnection({
          email: user.email,
          name: user.name ?? "",
          method: account?.provider === "google" ? "google" : "email",
          headers: request?.headers,
        });
      } catch (error) {
        console.error("Could not record sign-in", error);
      }
    },
  },
}));
