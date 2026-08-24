import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export default async function AdminForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; status?: string }>;
}) {
  const { sent, status } = await searchParams;
  return <ForgotPasswordForm kind="admin" status={status || (sent ? "ok" : undefined)} />;
}
