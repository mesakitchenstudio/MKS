import Link from "next/link";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { getPasswordResetByToken } from "@/lib/reset-password";
import { authFocusRing } from "@/lib/auth-ui";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      {!token ? (
        <div className="border border-line bg-paper p-8">
          <h1 className="font-serif text-3xl">Reset link missing</h1>
          <p className="mt-2 text-sm text-muted">Request a new password reset from Sign in.</p>
        </div>
      ) : (await getPasswordResetByToken(token, "member")) ? (
        <ResetPasswordForm kind="member" token={token} error={error} />
      ) : (
        <div className="border border-line bg-paper p-8">
          <h1 className="font-serif text-3xl">Reset link invalid</h1>
          <p className="mt-2 text-sm text-muted">
            This reset link isn&apos;t valid anymore. It may have expired or already been used.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/forgot-password" className={`font-semibold text-terracotta ${authFocusRing}`}>
              Request a new reset link
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
