"use client";

import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { ADMIN_GOOGLE_SESSION_SOURCE } from "@/lib/admin-google-session";

export function AdminGoogleSignIn() {
  return (
    <GoogleAuthButton
      label="Sign in with Google"
      callbackUrl={`/admin/session?source=${ADMIN_GOOGLE_SESSION_SOURCE}`}
    />
  );
}
