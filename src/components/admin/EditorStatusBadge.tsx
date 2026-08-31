export function EditorStatusBadge({ published }: { published: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${published ? "bg-olive" : "bg-terracotta/75"}`}
        aria-hidden
      />
      {published ? "Published" : "Draft"}
    </span>
  );
}
