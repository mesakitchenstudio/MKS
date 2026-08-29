import Link from "next/link";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { getPasswordResetByToken } from "@/lib/reset-password";
import { authFocusRing } from "@/lib/auth-ui";

export default async function AdminResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  if (!token) {
    return (
      <div className="mx-auto max-w-md border border-line bg-paper p-8">
        <h1 className="font-serif text-3xl">Reset link missing</h1>
        <p className="mt-2 text-sm text-muted">Request a new password reset from the login page.</p>
        <p className="mt-4 text-sm">
          <Link href="/admin/forgot-password" className={`font-semibold text-terracotta ${authFocusRing}`}>
            Request a reset link
          </Link>
        </p>
      </div>
    );
  }

  const reset = await getPasswordResetByToken(token, "admin");
  if (!reset) {
    return (
      <div className="mx-auto max-w-md border border-line bg-paper p-8">
        <h1 className="font-serif text-3xl">Reset link invalid</h1>
        <p className="mt-2 text-sm text-muted">
          That reset link is invalid or has expired. Request a new one.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/admin/forgot-password" className={`font-semibold text-terracotta ${authFocusRing}`}>
            Request a reset link
          </Link>
        </p>
      </div>
    );
  }

  return <ResetPasswordForm kind="admin" token={token} error={error} />;
}
