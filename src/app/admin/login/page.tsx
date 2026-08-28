import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "../actions";
import { AdminGoogleSignIn } from "@/components/admin/AdminGoogleSignIn";
import { AuthOrDivider } from "@/components/auth/GoogleAuthButton";
import { homeForRole } from "@/lib/admin-access";
import { bridgePublicSessionToAdmin } from "@/lib/admin-bridge";
import { getAdminSession } from "@/lib/auth";
import {
  authFocusRing,
  authInputClass,
  authLabelClass,
  authLinkClass,
  authPrimaryButtonClass,
} from "@/lib/auth-ui";

function loginErrorMessage(error?: string) {
  if (error === "locked") return "Too many attempts. Try again in 15 minutes.";
  if (error === "google") return "Google sign-in did not finish. Try again.";
  if (error === "not-admin") return "";
  if (error) return "That email or password did not match.";
  return "";
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const admin = await getAdminSession();
  if (admin) redirect(homeForRole(admin.role));

  const { error, reset } = await searchParams;
  const bridged = await bridgePublicSessionToAdmin();
  if (bridged.status === "bridged") redirect(bridged.redirectTo);

  const denied = bridged.status === "unauthorized" || error === "not-admin";
  const errorMessage = loginErrorMessage(error);

  return (
    <div className="w-full max-w-[28.125rem] rounded-sm border border-line bg-paper p-5 md:p-8">
      {denied ? (
        <>
          <h1 className="font-serif text-3xl leading-tight text-ink md:text-[2rem]">
            Access denied
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted">
            You&apos;re signed in on the site, but this account does not have Studio Team Access.
          </p>
          <p className="mt-6">
            <Link href="/" className={`${authLinkClass} ${authFocusRing}`}>
              ← Back to site
            </Link>
          </p>
          <div className="my-7">
            <AuthOrDivider />
          </div>
          <p className="mb-2 text-sm leading-6 text-muted">
            Or sign in with a different studio account:
          </p>
        </>
      ) : (
        <>
          <h1 className="font-serif text-3xl leading-tight text-ink md:text-[2rem]">
            Studio login
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted">
            Sign in with your email or username and password.
          </p>
        </>
      )}

      {reset ? (
        <p className="mt-4 text-sm leading-6 text-olive">
          Password updated. Sign in with your new password.
        </p>
      ) : null}
      {errorMessage ? <p className="mt-4 text-sm leading-6 text-terracotta">{errorMessage}</p> : null}

      <form action={loginAction} className={`${denied ? "mt-6" : "mt-9"} grid gap-6`}>
        <label className={authLabelClass}>
          Email or username
          <input
            name="email"
            required
            autoComplete="username"
            placeholder="you@email.com"
            className={authInputClass}
          />
        </label>
        <label className={authLabelClass}>
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className={authInputClass}
          />
        </label>
        <button type="submit" className={`${authPrimaryButtonClass} ${authFocusRing}`}>
          Sign in
        </button>
      </form>
      <p className="mt-5 text-sm">
        <Link href="/admin/forgot-password" className={`${authLinkClass} ${authFocusRing}`}>
          Forgot password?
        </Link>
      </p>
      <div className="my-7">
        <AuthOrDivider />
      </div>
      <AdminGoogleSignIn />
    </div>
  );
}
