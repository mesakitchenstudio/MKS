import { homeForRole } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loginAction } from "../actions";
import { AdminGoogleSignIn } from "@/components/admin/AdminGoogleSignIn";

const googleReady = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const admin = await getAdminSession();
  if (admin) redirect(homeForRole(admin.role));
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md border border-line bg-paper p-8">
      <h1 className="font-serif text-3xl">Studio login</h1>
      <p className="mt-2 text-sm text-muted">
        Sign in with your admin email and password, or Google if that email is already an admin.
        The owner bootstrap password lives in <code>.env</code> as <code>ADMIN_PASSWORD</code>, not in the code.
      </p>
      {error === "locked" ? (
        <p className="mt-4 text-sm text-terracotta">Too many attempts. Try again in 15 minutes.</p>
      ) : error ? (
        <p className="mt-4 text-sm text-terracotta">That email or password did not match.</p>
      ) : null}
      <form action={loginAction} className="mt-6 grid gap-4">
        <label className="grid gap-1 text-sm">
          Email
          <input
            type="email"
            name="email"
            placeholder="Optional for the original owner password"
            className="rounded-sm border border-line px-3 py-2 outline-none focus:border-terracotta"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Password
          <input
            type="password"
            name="password"
            required
            className="rounded-sm border border-line px-3 py-2 outline-none focus:border-terracotta"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper"
        >
          Sign in
        </button>
      </form>
      {googleReady ? (
        <div className="mt-4 grid gap-3">
          <p className="text-center text-xs uppercase tracking-wide text-muted">or</p>
          <AdminGoogleSignIn />
        </div>
      ) : null}
    </div>
  );
}
