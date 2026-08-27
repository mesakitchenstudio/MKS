"use client";

import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

export function AdminGoogleSignIn() {
  return <GoogleAuthButton label="Sign in with Google" callbackUrl="/admin/session" />;
}
