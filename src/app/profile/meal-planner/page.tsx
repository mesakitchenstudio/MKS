import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { findActiveMemberByEmail } from "@/lib/accounts";
import { isMealPlannerEnabled } from "@/lib/meal-planner";
import { ensureDefaultMealPlanForUser } from "@/lib/meal-planner-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (!isMealPlannerEnabled()) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }
  return {
    title: "Meal Planner",
    robots: { index: false, follow: false },
  };
}

/** Stable hub — ensure default plan, then redirect to owned plan detail. */
export default async function MealPlannerHubPage() {
  if (!isMealPlannerEnabled()) notFound();

  const session = await auth();
  const email = session?.user?.email;
  if (
    !email ||
    session?.error === "MemberDeleted" ||
    session?.error === "SessionRevoked"
  ) {
    redirect("/profile");
  }

  const member = await findActiveMemberByEmail(email);
  if (!member) redirect("/profile");

  const ensured = await ensureDefaultMealPlanForUser(member.id);
  if (!ensured.ok) redirect("/profile");

  redirect(`/profile/meal-planner/${ensured.data.id}`);
}
