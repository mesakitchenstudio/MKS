import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import {
  authenticateEmailUser,
  ensureMember,
  getStaffByEmail,
  recordConnection,
  removeMemberByEmail,
  upsertGoogleUser,
} from "@/lib/accounts";
import { writeAdminSession } from "@/lib/auth";

const googleReady = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, signIn, signOut, auth } = NextAuth((request) => ({
  trustHost: true,
  providers: [
    ...(googleReady ? [Google] : []),
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
        try {
          await writeAdminSession(staff);
        } catch (error) {
          console.error("Could not open admin session", error);
        }
        await removeMemberByEmail(user.email);
        return true;
      }
      if (account?.provider === "google") {
        try {
          await upsertGoogleUser(user.email, user.name ?? "");
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
      }
      if (token.email) {
        const staff = await getStaffByEmail(String(token.email));
        token.staffRole = staff?.role ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) || session.user.email;
        session.user.name = (token.name as string) || session.user.name;
      }
      session.staffRole = token.staffRole ?? null;
      if (session.user?.email) {
        try {
          if (session.staffRole) {
            await removeMemberByEmail(session.user.email);
          } else {
            await ensureMember(session.user.email, session.user.name ?? "", request?.headers);
          }
        } catch (error) {
          console.error("Could not persist member profile", error);
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
