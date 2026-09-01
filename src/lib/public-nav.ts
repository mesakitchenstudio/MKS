/** Primary public header navigation (Studio omitted until public launch). */
export const PUBLIC_HEADER_NAV = [
  { href: "/recipes", label: "Recipes", mega: true as const },
  { href: "/videos", label: "Videos" },
  { href: "/about", label: "About" },
] as const;

export const PUBLIC_MOBILE_NAV = [
  { href: "/recipes", label: "All recipes" },
  { href: "/videos", label: "Videos" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function publicHeaderNavLabels(): string[] {
  return PUBLIC_HEADER_NAV.map((link) => link.label);
}

export function publicMobileNavLabels(): string[] {
  return PUBLIC_MOBILE_NAV.map((link) => link.label);
}
