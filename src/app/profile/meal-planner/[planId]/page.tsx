import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { findActiveMemberByEmail } from "@/lib/accounts";
import {
  endOfWeekSunday,
  isMealPlannerEnabled,
  parseMealPlanWeekParam,
  type MealPlannerRecipeOption,
} from "@/lib/meal-planner";
import {
  getMealPlanForUser,
  listMealPlanItemsForUser,
  listMealPlansForUser,
} from "@/lib/meal-planner-server";
import { getAllRecipes } from "@/lib/recipes";
import { MealPlannerView } from "@/components/MealPlannerView";
import { MealPlannerWeekBootstrap } from "@/components/MealPlannerWeekBootstrap";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ week?: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  if (!isMealPlannerEnabled()) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }
  return {
    title: "Meal Planner",
    robots: { index: false, follow: false },
  };
}

export default async function MealPlannerPlanPage({ params, searchParams }: PageProps) {
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

  const { planId } = await params;
  const query = await searchParams;
  const plans = await listMealPlansForUser(member.id);
  const plan = await getMealPlanForUser(member.id, planId);
  if (!plan) notFound();

  const weekRaw = query.week;
  const weekParsed = weekRaw ? parseMealPlanWeekParam(weekRaw) : null;

  if (!weekParsed?.ok) {
    return (
      <MealPlannerWeekBootstrap
        planId={plan.id}
        weekParam={typeof weekRaw === "string" ? weekRaw : undefined}
      />
    );
  }

  const weekStart = weekParsed.weekStart;
  const weekEnd = endOfWeekSunday(weekStart);
  if (!weekEnd) notFound();

  const itemsResult = await listMealPlanItemsForUser(member.id, plan.id, {
    fromDate: weekStart,
    toDate: weekEnd,
  });
  const items = itemsResult.ok ? itemsResult.data.items : [];

  const recipes = await getAllRecipes();
  const recipeOptions: MealPlannerRecipeOption[] = recipes
    .filter((recipe): recipe is typeof recipe & { id: string } => Boolean(recipe.id?.trim()))
    .map((recipe) => ({
      id: recipe.id,
      slug: recipe.slug,
      title: recipe.title,
      image: recipe.image,
      imageAlt: recipe.imageAlt || recipe.title,
      servings: recipe.servings,
    }));

  const imageBySlug = Object.fromEntries(
    recipes.map((recipe) => [
      recipe.slug,
      { image: recipe.image, imageAlt: recipe.imageAlt || recipe.title },
    ]),
  );

  return (
    <MealPlannerView
      planId={plan.id}
      planName={plan.name}
      plans={plans.map((row) => ({ id: row.id, name: row.name }))}
      weekStart={weekStart}
      items={items}
      recipeOptions={recipeOptions}
      imageBySlug={imageBySlug}
    />
  );
}
