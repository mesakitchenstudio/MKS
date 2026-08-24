import { ResetPasswordForm } from "@/components/ResetPasswordForm";

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
      </div>
    );
  }
  return <ResetPasswordForm kind="admin" token={token} error={error} />;
}
