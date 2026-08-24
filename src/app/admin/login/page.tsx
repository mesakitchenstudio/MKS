import Link from "next/link";
import { homeForRole } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loginAction } from "../actions";
import { AdminGoogleSignIn } from "@/components/admin/AdminGoogleSignIn";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const admin = await getAdminSession();
  if (admin) redirect(homeForRole(admin.role));
  const { error, reset } = await searchParams;
  const errorMessage =
    error === "locked"
      ? "Too many attempts. Try again in 15 minutes."
      : error === "google"
        ? "Google sign-in did not finish. Try again."
        : error === "not-admin"
          ? "That Google account is not a studio admin."
          : error
            ? "That email or password did not match."
            : "";

  return (
    <div className="mx-auto max-w-md border border-line bg-paper p-8">
      <h1 className="font-serif text-3xl">Studio login</h1>
      <p className="mt-2 text-sm text-muted">Sign in with your email or username and password.</p>
      {reset ? <p className="mt-4 text-sm text-olive">Password updated. Sign in with your new password.</p> : null}
      {errorMessage ? <p className="mt-4 text-sm text-terracotta">{errorMessage}</p> : null}
      <form action={loginAction} className="mt-6 grid gap-4">
        <label className="grid gap-1 text-sm">
          Email or username
          <input
            name="email"
            required
            autoComplete="username"
            placeholder="you@email.com"
            className="rounded-sm border border-line px-3 py-2 outline-none focus:border-terracotta"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
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
      <p className="mt-4 text-sm">
        <Link href="/admin/forgot-password" className="font-semibold text-terracotta">
          Forgot password?
        </Link>
      </p>
      <div className="mt-4 grid gap-3">
        <p className="text-center text-xs uppercase tracking-wide text-muted">or</p>
        <AdminGoogleSignIn />
      </div>
    </div>
  );
}
