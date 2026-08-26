import type { Metadata } from "next";
import { site } from "@/data/site";
import { VideoCard } from "@/components/youtube/VideoCard";
import { VIDEO_PAGE_SECTIONS } from "@/data/videos-page";

export const metadata: Metadata = {
  title: "Videos",
  description: `Step-by-step cooking videos from ${site.name}.`,
  alternates: { canonical: "/videos" },
};

export default function VideosPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">YouTube</p>
      <h1 className="mt-2 font-serif text-5xl text-ink">Videos</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
        Watch step-by-step recipes from our kitchen. Each video pairs with a full recipe on the site.
      </p>

      {VIDEO_PAGE_SECTIONS.map((section) => (
        <section key={section.id} className="mt-14">
          <h2 className="font-serif text-3xl text-ink">{section.title}</h2>
          {section.note ? <p className="mt-1 text-xs text-muted">{section.note}</p> : null}
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {section.videos.map((video) => (
              <li key={video.videoId}>
                <VideoCard video={video} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
