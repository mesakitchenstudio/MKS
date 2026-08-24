export function youtubeVideoId(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return null;

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

export function youtubeEmbedUrl(
  url: string,
  options?: { autoplay?: boolean; mute?: boolean },
) {
  const id = youtubeVideoId(url);
  if (!id) return null;

  const params = new URLSearchParams();
  if (options?.autoplay) {
    params.set("autoplay", "1");
    // Browsers only allow autoplay when muted.
    params.set("mute", options.mute === false ? "0" : "1");
  } else if (options?.mute) {
    params.set("mute", "1");
  }

  const query = params.toString();
  return `https://www.youtube.com/embed/${id}${query ? `?${query}` : ""}`;
}

export function youtubeWatchUrl(url: string) {
  const id = youtubeVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}
