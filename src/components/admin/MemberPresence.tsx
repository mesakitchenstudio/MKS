export function memberInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function MemberAvatar({
  name,
  photoUrl,
  size = "md",
}: {
  name: string;
  photoUrl?: string | null;
  size?: "md" | "lg";
}) {
  const dimension = size === "lg" ? "h-14 w-14 text-sm" : "h-10 w-10 text-xs";
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-sand font-semibold text-ink ${dimension}`}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        memberInitials(name) || "?"
      )}
    </div>
  );
}

export function PresenceDot({ online, pulse = false }: { online: boolean; pulse?: boolean }) {
  if (online && pulse) {
    return (
      <span className="relative flex h-2.5 w-2.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-olive opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-olive" />
      </span>
    );
  }
  return (
    <span
      className={`inline-flex h-2.5 w-2.5 rounded-full ${online ? "bg-olive" : "bg-line"}`}
      aria-hidden
    />
  );
}
