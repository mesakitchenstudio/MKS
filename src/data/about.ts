export type AboutPrinciple = {
  number: string;
  label: string;
  description: string;
};

/** Optional authentic Mesa photography — omit until a real studio asset exists. */
export type AboutOptionalImage = {
  src: string;
  alt: string;
};

/**
 * Set when an authentic Mesa kitchen photograph is available.
 * Do not point at Unsplash, stock, or generated imagery.
 */
export const ABOUT_HERO_IMAGE: AboutOptionalImage | null = null;

/**
 * Set when an authentic Mesa process / test-kitchen photograph is available.
 * Do not point at Unsplash, stock, or generated imagery.
 */
export const ABOUT_PROCESS_IMAGE: AboutOptionalImage | null = null;

export const ABOUT_PRINCIPLES: AboutPrinciple[] = [
  {
    number: "01",
    label: "Test it again",
    description:
      "A first pass finds the idea. A second pass confirms the timing, the seasoning, and what actually works on a weeknight stove.",
  },
  {
    number: "02",
    label: "Use what you can buy",
    description:
      "Recipes stay honest to grocery-store shelves and ordinary pans — no specialty equipment required to finish the dish.",
  },
  {
    number: "03",
    label: "Explain why",
    description:
      "When a step changes texture, browning, or flavor, we say so — so you can cook with judgment, not only by rote.",
  },
];
