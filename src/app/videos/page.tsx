import type { Metadata } from "next";
import { VideoSection } from "@/components/youtube/VideoSection";
import { site } from "@/data/site";
import { resolveVideoPageSections } from "@/lib/videos-page";
import { getAllRecipes } from "@/lib/recipes";

export const metadata: Metadata = {
  title: "Videos",
  description: `Watch step-by-step recipes and kitchen techniques from ${site.name}.`,
  alternates: { canonical: "/videos" },
};

export const dynamic = "force-dynamic";

export default async function VideosPage() {
  const recipes = await getAllRecipes();
  const sections = resolveVideoPageSections(recipes);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 pb-16 md:px-6 md:pb-20">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">YouTube</p>
      <h1 className="mt-2 font-serif text-4xl text-ink md:text-5xl">Videos</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
        Watch step-by-step recipes and kitchen techniques from our kitchen. Many pair with a full
        written recipe on the site.
      </p>

      {sections.map((section, index) => (
        <VideoSection key={section.id} section={section} priorityFirst={index === 0} />
      ))}
    </div>
  );
}
