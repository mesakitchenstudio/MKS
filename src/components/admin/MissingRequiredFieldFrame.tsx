"use client";

import type { CSSProperties, ReactNode } from "react";
import { recipeFieldAnchorId } from "@/lib/recipe-editor-field-anchor";

export function MissingRequiredFieldFrame({
  fieldKey,
  label,
  isMissing,
  isPulsing = false,
  className = "",
  style,
  children,
}: {
  fieldKey: string;
  label: string;
  isMissing: boolean;
  isPulsing?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const id = recipeFieldAnchorId(fieldKey);

  if (!isMissing) {
    return (
      <div id={id} data-recipe-field={fieldKey} className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <div
      id={id}
      data-recipe-field={fieldKey}
      data-missing-required=""
      className={`rounded-sm border border-terracotta/40 bg-terracotta/[0.07] p-3 ${isPulsing ? "mesa-missing-field-pulse" : ""} ${className}`.trim()}
      style={style}
    >
      {children}
      <p
        className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-terracotta/90"
        role="status"
      >
        <span className="sr-only">{label} is required and currently missing.</span>
        <span aria-hidden="true">Required — missing</span>
      </p>
    </div>
  );
}
