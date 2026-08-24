import Link from "next/link";
import { requestPasswordResetAction } from "@/app/account/reset-actions";
import { AdminGoogleSignIn } from "@/components/admin/AdminGoogleSignIn";

const messages: Record<string, string> = {
  sent: "If that account exists, a reset link is on its way. Check your inbox and spam folder.",
  ok: "If that account exists, a reset link is on its way. Check your inbox and spam folder.",
  owner:
    "The owner account cannot be reset by email. Sign in with Google, or use the owner password from your hosting settings.",
  noemail:
    "We found that account, but password emails are not set up yet. Sign in with Google, or ask the owner to set a new password.",
};

export function ForgotPasswordForm({
  kind,
  status,
}: {
  kind: "admin" | "member";
  status?: string;
}) {
  const signInHref = kind === "admin" ? "/admin/login" : undefined;
  const message = status ? messages[status] : "";
  const help =
    kind === "admin"
      ? "Enter the email or username on the account. The owner account uses Google or the owner password."
      : "Enter the email or username on the account. If we find it, we will send a reset link.";
  return (
    <div className="mx-auto max-w-md border border-line bg-paper p-8">
      <h1 className="font-serif text-3xl">Forgot password</h1>
      <p className="mt-2 text-sm text-muted">{help}</p>
      {message ? (
        <p className={`mt-4 text-sm ${status === "owner" || status === "noemail" ? "text-terracotta" : "text-olive"}`}>
          {message}
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
      {kind === "admin" ? (
        <div className="mt-6 grid gap-3">
          <p className="text-center text-xs uppercase tracking-wide text-muted">or</p>
          <AdminGoogleSignIn />
        </div>
      ) : null}
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
