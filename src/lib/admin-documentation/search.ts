import type { AdminDocTopic } from "./types";

export type AdminDocSearchMatch = {
  topic: AdminDocTopic;
  /** Lower is better. */
  score: number;
  matchedIn: Array<"title" | "summary" | "section" | "body">;
};

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function haystackIncludes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

/**
 * Lightweight client-side documentation search over title, summary, and section text.
 */
export function searchAdminDocTopics(
  topics: AdminDocTopic[],
  query: string,
): AdminDocSearchMatch[] {
  const needle = normalizeQuery(query);
  if (!needle) {
    return topics.map((topic) => ({ topic, score: 0, matchedIn: [] }));
  }

  const results: AdminDocSearchMatch[] = [];

  for (const topic of topics) {
    const matchedIn: AdminDocSearchMatch["matchedIn"] = [];
    let score = 1000;

    if (haystackIncludes(topic.title, needle)) {
      matchedIn.push("title");
      score = Math.min(score, 10);
      if (topic.title.toLowerCase() === needle) score = 0;
      else if (topic.title.toLowerCase().startsWith(needle)) score = Math.min(score, 5);
    }
    if (haystackIncludes(topic.summary, needle)) {
      matchedIn.push("summary");
      score = Math.min(score, 20);
    }

    for (const section of topic.sections) {
      if (haystackIncludes(section.title, needle)) {
        matchedIn.push("section");
        score = Math.min(score, 30);
      }
      for (const paragraph of section.paragraphs) {
        if (haystackIncludes(paragraph, needle)) {
          matchedIn.push("body");
          score = Math.min(score, 40);
        }
      }
      for (const bullet of section.bullets ?? []) {
        if (haystackIncludes(bullet, needle)) {
          matchedIn.push("body");
          score = Math.min(score, 40);
        }
      }
    }

    if (matchedIn.length > 0) {
      results.push({
        topic,
        score,
        matchedIn: [...new Set(matchedIn)],
      });
    }
  }

  return results.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.topic.title.localeCompare(b.topic.title);
  });
}
