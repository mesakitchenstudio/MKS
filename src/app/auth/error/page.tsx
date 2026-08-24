import Link from "next/link";

const messages: Record<string, string> = {
  Configuration:
    "Google sign-in is not configured yet. Add AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET to your environment, then restart the app.",
  AccessDenied: "Google denied access. Try another Google account.",
  Verification: "That sign-in link is no longer valid. Please try again.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    (error && messages[error]) ||
    "Google sign-in did not complete. Please try again, or use email and password.";

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md border border-line bg-paper p-8 shadow-md">
        <p className="text-xs font-semibold uppercase tracking-widest text-olive">Sign in</p>
        <h1 className="mt-2 font-serif text-3xl text-ink">Could not sign in with Google</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink">{message}</p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/admin/login"
            className="inline-block bg-olive px-5 py-3 text-sm font-bold uppercase tracking-wide text-paper hover:bg-olive-dark"
          >
            Studio login
          </Link>
          <Link href="/" className="inline-block px-5 py-3 text-sm font-semibold text-muted">
            Back to the kitchen
          </Link>
        </div>
      </div>
    </div>
  );
}
