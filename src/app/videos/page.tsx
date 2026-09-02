import type { Metadata } from "next";
import { PublicVideosCatalogue } from "@/components/youtube/PublicVideosCatalogue";
import { site } from "@/data/site";
import { loadPublicVideoCatalogue } from "@/lib/public-videos/load";

export const metadata: Metadata = {
  title: "Videos",
  description: `Step-by-step recipes and kitchen techniques from ${site.name}. Watch the method, then cook from the written recipe when there is one.`,
  alternates: { canonical: "/videos" },
};

export const revalidate = 300;

function parseFormat(raw: string | string[] | undefined): "long" | "shorts" {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "shorts" ? "shorts" : "long";
}

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const result = await loadPublicVideoCatalogue();
  const requestedFormat = parseFormat(params.format);
  const format =
    result.ok && result.showFormatFilter && requestedFormat === "shorts" ? "shorts" : "long";

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 pb-16 md:px-6 md:pb-20">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        From the kitchen
      </p>
      <h1 className="mt-2 font-serif text-4xl text-ink md:text-5xl">Videos</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
        Step-by-step recipes and kitchen techniques from the Mesa kitchen. Watch the method, then
        cook from the written recipe when there is one.
      </p>

      {result.ok ? (
        <PublicVideosCatalogue
          featured={result.featured}
          videos={result.videos}
          shorts={result.shorts}
          showFormatFilter={result.showFormatFilter}
          format={format}
        />
      ) : (
        <PublicVideosCatalogue
          featured={null}
          videos={[]}
          shorts={[]}
          showFormatFilter={false}
          format="long"
          loadFailed
        />
      )}
    </div>
  );
}
