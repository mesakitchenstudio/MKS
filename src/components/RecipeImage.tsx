"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { normalizeRecipeImageSrc, RECIPE_IMAGE_FALLBACK } from "@/lib/recipe-images";

type RecipeImageProps = {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
};

export function RecipeImage({
  src,
  alt,
  fill = true,
  priority = false,
  sizes,
  className = "object-cover",
}: RecipeImageProps) {
  const normalized = normalizeRecipeImageSrc(src);
  const [currentSrc, setCurrentSrc] = useState(normalized ?? RECIPE_IMAGE_FALLBACK);
  const [degraded, setDegraded] = useState(!normalized);

  useEffect(() => {
    const next = normalizeRecipeImageSrc(src);
    if (next) {
      setCurrentSrc(next);
      setDegraded(false);
      return;
    }
    setCurrentSrc(RECIPE_IMAGE_FALLBACK);
    setDegraded(true);
  }, [src]);

  if (degraded) {
    return (
      <div
        className="absolute inset-0 bg-sand"
        role="img"
        aria-label={alt || "Recipe image unavailable"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={RECIPE_IMAGE_FALLBACK} alt="" className={`h-full w-full ${className} opacity-90`} />
      </div>
    );
  }

  return (
    <Image
      src={currentSrc}
      alt={alt || "Recipe"}
      fill={fill}
      priority={priority}
      sizes={sizes}
      className={className}
      onError={() => {
        if (currentSrc !== RECIPE_IMAGE_FALLBACK) {
          setCurrentSrc(RECIPE_IMAGE_FALLBACK);
          setDegraded(true);
        }
      }}
    />
  );
}
