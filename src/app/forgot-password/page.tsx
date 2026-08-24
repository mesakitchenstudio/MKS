import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; done?: string }>;
}) {
  const { sent, done } = await searchParams;
  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="border border-line bg-paper p-8">
          <h1 className="font-serif text-3xl">Password updated</h1>
          <p className="mt-2 text-sm text-muted">Use Sign in in the top-right corner to continue.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <ForgotPasswordForm kind="member" sent={Boolean(sent)} />
    </div>
  );
}
