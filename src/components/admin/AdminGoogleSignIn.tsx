"use client";

import { signIn } from "next-auth/react";

export function AdminGoogleSignIn() {
  return (
    <button
      type="button"
      onClick={() => signIn("google", { callbackUrl: "/admin" })}
      className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:border-terracotta"
    >
      Sign in with Google
    </button>
  );
}
