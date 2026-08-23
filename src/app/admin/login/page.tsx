import { isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loginAction } from "../actions";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAdmin()) redirect("/admin");
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md border border-line bg-paper p-8">
      <h1 className="font-serif text-3xl">Studio login</h1>
      <p className="mt-2 text-sm text-muted">
        Use the admin password from your environment variables.
      </p>
      {error ? <p className="mt-4 text-sm text-terracotta">That password did not match.</p> : null}
      <form action={loginAction} className="mt-6 grid gap-4">
        <label className="grid gap-1 text-sm">
          Password
          <input
            type="password"
            name="password"
            required
            className="rounded-sm border border-line px-3 py-2 outline-none focus:border-terracotta"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
