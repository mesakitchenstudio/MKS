export type AdminDocCategory =
  | "publishing"
  | "library"
  | "community"
  | "analytics"
  | "team"
  | "account";

/**
 * Built-in section ids used across topics, plus Recipe Editor section-help anchors.
 */
export type AdminDocSectionId =
  | "about"
  | "when-to-use"
  | "common-tasks"
  | "how-it-works"
  | "discovery"
  | "rules"
  | "best-practices"
  | "permissions"
  | "related"
  | "basics"
  | "details"
  | "content"
  | "media"
  | "advanced"
  | "public-ingredient-pages";

export type AdminDocSection = {
  id: AdminDocSectionId;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export type AdminDocTopic = {
  id: string;
  title: string;
  summary: string;
  category: AdminDocCategory;
  /**
   * Exact paths and safe patterns this topic owns.
   * Prefer exact strings; use trailing `/*` only for intentional prefixes
   * that will not collide with deeper Phase-later routes.
   */
  routes: string[];
  relatedTopicIds?: string[];
  sections: AdminDocSection[];
};

/** Future topic ids allowed in relatedTopicIds before those topics ship. */
export const APPROVED_FUTURE_DOC_TOPIC_IDS = [] as const;
