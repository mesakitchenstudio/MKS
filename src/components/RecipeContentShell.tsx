import type { ReactNode } from "react";

/** Shared outer width/gutters for public recipe page sections. */
export const recipeContentShellClass = "mx-auto w-full max-w-[75rem] px-4 md:px-6";

export function RecipeContentShell({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "header" | "nav";
}) {
  return <Tag className={`${recipeContentShellClass}${className ? ` ${className}` : ""}`}>{children}</Tag>;
}
