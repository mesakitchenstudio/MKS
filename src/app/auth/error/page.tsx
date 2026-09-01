import Link from "next/link";

const messages: Record<string, string> = {
  Configuration:
    "Google sign-in hit a configuration problem. The site owner should confirm Google OAuth keys on the host, set AUTH_URL to https://www.mesakitchenstudio.com, add the redirect URI https://www.mesakitchenstudio.com/api/auth/callback/google in Google Cloud, and publish the OAuth consent screen (or add your Google account as a test user).",
  AccessDenied:
    "Google denied access. If the app is still in Testing mode, the site owner must add your Google account as a test user — or publish the OAuth consent screen.",
  Verification: "That sign-in link is no longer valid. Please try again.",
  OAuthCallback: "Google returned an error finishing sign-in. Try again in a moment.",
  OAuthAccountNotLinked:
    "This email is already registered with email and password. Sign in with your password, or use Continue with Google on the account that originally used Google.",
  Default: "Google sign-in didn't complete. Try again or use email.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = (error && messages[error]) || messages.Default;

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md border border-line bg-paper p-8 shadow-md">
        <p className="text-xs font-semibold uppercase tracking-widest text-olive">Sign in</p>
        <h1 className="mt-2 font-serif text-3xl text-ink">Could not sign in with Google</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink">{message}</p>
        {error ? <p className="mt-3 text-xs text-muted">Error code: {error}</p> : null}
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/"
            className="inline-block bg-olive px-5 py-3 text-sm font-bold uppercase tracking-wide text-paper hover:bg-olive-dark"
          >
            Back to the kitchen
          </Link>
          <Link href="/admin/login" className="inline-block px-5 py-3 text-sm font-semibold text-muted">
            Studio login
          </Link>
        </div>
      </div>
    </div>
  );
}
