import Link from "next/link";
import { requestPasswordResetAction } from "@/app/account/reset-actions";

export function ForgotPasswordForm({
  kind,
  sent,
}: {
  kind: "admin" | "member";
  sent?: boolean;
}) {
  const signInHref = kind === "admin" ? "/admin/login" : undefined;
  return (
    <div className="mx-auto max-w-md border border-line bg-paper p-8">
      <h1 className="font-serif text-3xl">Forgot password</h1>
      <p className="mt-2 text-sm text-muted">
        Enter the email or username on the account. If we find it, we will send a reset link.
      </p>
      {sent ? (
        <p className="mt-4 text-sm text-olive">
          If that account exists, a reset link is on its way. Check your inbox and spam folder.
        </p>
      ) : null}
      <form action={requestPasswordResetAction} className="mt-6 grid gap-4">
        <input type="hidden" name="kind" value={kind} />
        <label className="grid gap-1 text-sm">
          Email or username
          <input
            name="email"
            required
            autoComplete="username"
            className="rounded-sm border border-line px-3 py-2 outline-none focus:border-terracotta"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper"
        >
          Send reset link
        </button>
      </form>
      {signInHref ? (
        <p className="mt-4 text-sm">
          <Link href={signInHref} className="font-semibold text-terracotta">
            Back to sign in
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted">Use Sign in in the header after you reset.</p>
      )}
    </div>
  );
}
