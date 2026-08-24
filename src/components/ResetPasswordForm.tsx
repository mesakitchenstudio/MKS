import { completePasswordResetAction } from "@/app/account/reset-actions";

export function ResetPasswordForm({
  kind,
  token,
  error,
}: {
  kind: "admin" | "member";
  token: string;
  error?: string;
}) {
  const minLength = kind === "admin" ? 10 : 6;
  const message =
    error === "match"
      ? "Those passwords did not match."
      : error === "short"
        ? `Use at least ${minLength} characters.`
        : error
          ? "That reset link is invalid or has expired. Request a new one."
          : "";

  return (
    <div className="mx-auto max-w-md border border-line bg-paper p-8">
      <h1 className="font-serif text-3xl">Set a new password</h1>
      <p className="mt-2 text-sm text-muted">Choose a new password for your account.</p>
      {message ? <p className="mt-4 text-sm text-terracotta">{message}</p> : null}
      <form action={completePasswordResetAction} className="mt-6 grid gap-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="kind" value={kind} />
        <label className="grid gap-1 text-sm">
          New password
          <input
            type="password"
            name="password"
            required
            minLength={minLength}
            className="rounded-sm border border-line px-3 py-2 outline-none focus:border-terracotta"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Confirm password
          <input
            type="password"
            name="confirm"
            required
            minLength={minLength}
            className="rounded-sm border border-line px-3 py-2 outline-none focus:border-terracotta"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper"
        >
          Update password
        </button>
      </form>
    </div>
  );
}
