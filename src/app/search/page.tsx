import { redirect } from "next/navigation";

/** Legacy route — recipe search lives on /recipes */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const trimmed = q.trim();
  redirect(trimmed ? `/recipes?q=${encodeURIComponent(trimmed)}` : "/recipes");
}
