/**
 * Authenticated recipe preview — public-style presentation without AdminShell.
 * Sibling to `(app)` so Preview does not inherit the Admin sidebar.
 */
export default function AdminRecipePreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-full bg-cream text-ink">{children}</div>;
}
