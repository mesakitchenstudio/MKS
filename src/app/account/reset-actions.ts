"use server";

import { redirect } from "next/navigation";
import { requestPasswordReset, resetPasswordWithToken, type ResetKind } from "@/lib/reset-password";

export async function requestPasswordResetAction(formData: FormData) {
  const identifier = String(formData.get("email") || "");
  const kind = String(formData.get("kind") || "member") === "admin" ? "admin" : "member";
  const base = kind === "admin" ? "/admin/forgot-password" : "/forgot-password";
  try {
    await requestPasswordReset(identifier, kind as ResetKind);
  } catch (error) {
    // Still show the generic success state — do not leak lookup or mail failures.
    console.error("Could not start password reset", error);
  }
  redirect(`${base}?status=ok`);
}

export async function completePasswordResetAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  const kind = String(formData.get("kind") || "member") === "admin" ? "admin" : "member";
  const failPath = kind === "admin" ? "/admin/reset-password" : "/reset-password";
  if (password !== confirm) {
    redirect(`${failPath}?token=${encodeURIComponent(token)}&error=match`);
  }
  const result = await resetPasswordWithToken(token, password);
  if (!result.ok) {
    redirect(`${failPath}?token=${encodeURIComponent(token)}&error=${result.error}`);
  }
  redirect(result.kind === "admin" ? "/admin/login?reset=1" : "/forgot-password?done=1");
}
