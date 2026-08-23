"use client";

import { useState } from "react";
import { site } from "@/data/site";

export function ShareButtons({ title, slug }: { title: string; slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${site.url}/recipes/${slug}`;
  const encoded = encodeURIComponent(url);
  const text = encodeURIComponent(title);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-3 text-sm">
      <a
        href={`https://www.pinterest.com/pin/create/button/?url=${encoded}&description=${text}`}
        className="font-semibold text-ink/70 hover:text-terracotta"
        target="_blank"
        rel="noreferrer"
      >
        Pin
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encoded}`}
        className="font-semibold text-ink/70 hover:text-terracotta"
        target="_blank"
        rel="noreferrer"
      >
        Share
      </a>
      <button
        type="button"
        onClick={copy}
        className="font-semibold text-ink/70 hover:text-terracotta"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
