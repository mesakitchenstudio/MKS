import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        404
      </p>
      <h1 className="mt-3 font-serif text-4xl">That page is not on the table</h1>
      <p className="mt-4 text-muted">
        The recipe or page you wanted may have moved. Try a search, or start from the
        catalog.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link
          href="/recipes"
          className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper"
        >
          All recipes
        </Link>
        <Link href="/search" className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold">
          Search
        </Link>
      </div>
    </div>
  );
}
