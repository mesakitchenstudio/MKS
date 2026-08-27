import { VideoCard } from "@/components/youtube/VideoCard";
import type { ResolvedVideoSection } from "@/lib/videos-page";

export function VideoSection({
  section,
  priorityFirst = false,
}: {
  section: ResolvedVideoSection;
  priorityFirst?: boolean;
}) {
  return (
    <section className={priorityFirst ? "mt-12 md:mt-14" : "mt-14 md:mt-16"}>
      <h2 className="font-serif text-3xl text-ink md:text-4xl">{section.title}</h2>
      <ul className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {section.videos.map((video, index) => (
          <li key={`${section.id}-${video.id}`}>
            <VideoCard
              video={video}
              priority={priorityFirst && index === 0}
              analyticsSource="videos_page"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
