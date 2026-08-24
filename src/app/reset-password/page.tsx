import { ResetPasswordForm } from "@/components/ResetPasswordForm";

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
      ) : (
        <ResetPasswordForm kind="member" token={token} error={error} />
      )}
    </div>
  );
}
