import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export default async function AdminForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  return <ForgotPasswordForm kind="admin" sent={Boolean(sent)} />;
}
