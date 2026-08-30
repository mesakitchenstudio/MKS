export function youtubeVideoId(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.slice(1).split("/")[0] || null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" || parts[0] === "shorts") return parts[1] || null;
    }
  } catch {
    return null;
  }

  return null;
}

export function youtubeThumbnailUrl(videoId: string, quality: "hq" | "max" = "hq") {
  const file = quality === "max" ? "maxresdefault.jpg" : "hqdefault.jpg";
  return `https://i.ytimg.com/vi/${videoId}/${file}`;
}

export function youtubeEmbedUrl(
  urlOrId: string,
  options?: {
    autoplay?: boolean;
    mute?: boolean;
    start?: number;
    enableApi?: boolean;
    origin?: string;
  },
) {
  const id = youtubeVideoId(urlOrId) || urlOrId;
  if (!id || id.length !== 11) return null;

  const params = new URLSearchParams();
  params.set("rel", "0");
  params.set("modestbranding", "1");
  if (options?.enableApi) {
    params.set("enablejsapi", "1");
    if (options.origin) params.set("origin", options.origin);
  }
  if (options?.start && options.start > 0) params.set("start", String(Math.floor(options.start)));
  if (options?.autoplay) {
    params.set("autoplay", "1");
    params.set("mute", options.mute === false ? "0" : "1");
  } else if (options?.mute) {
    params.set("mute", "1");
  }

  const query = params.toString();
  return `https://www.youtube-nocookie.com/embed/${id}${query ? `?${query}` : ""}`;
}

export function youtubeWatchUrl(urlOrId: string) {
  const id = youtubeVideoId(urlOrId);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function youtubeWatchUrlAt(urlOrId: string, seconds: number) {
  const base = youtubeWatchUrl(urlOrId);
  if (!base || seconds <= 0) return base;
  return `${base}&t=${Math.floor(seconds)}`;
}

export function formatYoutubeDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
