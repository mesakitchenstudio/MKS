import type { Metadata } from "next";
import { PublicVideosCatalogue } from "@/components/youtube/PublicVideosCatalogue";
import { site } from "@/data/site";
import { loadPublicVideoCatalogue } from "@/lib/public-videos/load";

const VIDEOS_DESCRIPTION =
  "Watch Mesa recipes come together in the studio, then open the full tested recipe when you’re ready to cook.";

export const revalidate = 300;

function parseFormat(raw: string | string[] | undefined): "long" | "shorts" {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "shorts" ? "shorts" : "long";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const format = parseFormat(params.format);
  const isShortsFilter = format === "shorts";

  return {
    title: "Videos",
    description: VIDEOS_DESCRIPTION,
    alternates: { canonical: "/videos" },
    // Filter variants share the same canonical; do not create a second indexable URL.
    robots: isShortsFilter ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `Videos | ${site.name}`,
      description: VIDEOS_DESCRIPTION,
      url: `${site.url}/videos`,
      siteName: site.name,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `Videos | ${site.name}`,
      description: VIDEOS_DESCRIPTION,
    },
  };
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
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted md:mt-5">{VIDEOS_DESCRIPTION}</p>

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
