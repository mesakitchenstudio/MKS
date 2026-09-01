import type { FieldNodeState } from "@/lib/recipe-editor-field-state";
import type { EditorSectionId } from "@/lib/recipe-editor-completeness";

export type EditorIssueKind = "missing" | "review";

export type EditorIssue = {
  kind: EditorIssueKind;
  path: string;
  key: string;
  label: string;
  section: EditorSectionId;
};

const SECTION_ORDER: EditorSectionId[] = ["basics", "details", "content", "media", "advanced"];

function sectionSort(a: EditorIssue, b: EditorIssue) {
  const ai = SECTION_ORDER.indexOf(a.section);
  const bi = SECTION_ORDER.indexOf(b.section);
  if (ai !== bi) return ai - bi;
  return a.path.localeCompare(b.path);
}

/** Build ordered navigation queues from the central evaluator (PR1 source of truth). */
export function buildEditorIssueQueues(nodes: FieldNodeState[]): {
  missing: EditorIssue[];
  review: EditorIssue[];
} {
  const missing: EditorIssue[] = [];
  const review: EditorIssue[] = [];

  for (const node of nodes) {
    if (node.blocking) {
      missing.push({
        kind: "missing",
        path: node.path,
        key: node.key,
        label: node.label,
        section: node.section,
      });
    }
    if (node.needsReview) {
      review.push({
        kind: "review",
        path: node.path,
        key: node.key,
        label: node.label,
        section: node.section,
      });
    }
  }

  missing.sort(sectionSort);
  review.sort(sectionSort);
  return { missing, review };
}

export function editorSectionDomId(section: EditorSectionId): string {
  switch (section) {
    case "basics":
      return "recipe-section-basics";
    case "details":
      return "recipe-section-details";
    case "content":
      return "recipe-section-content";
    case "media":
      return "recipe-section-media";
    case "advanced":
      return "recipe-section-advanced";
    default:
      return "recipe-section-details";
  }
}

export function issuesForSection(issues: EditorIssue[], section: EditorSectionId): EditorIssue[] {
  return issues.filter((issue) => issue.section === section);
}

export function firstIssueForSection(
  queues: { missing: EditorIssue[]; review: EditorIssue[] },
  section: EditorSectionId,
  kind: EditorIssueKind,
): EditorIssue | undefined {
  const list = kind === "missing" ? queues.missing : queues.review;
  return list.find((issue) => issue.section === section);
}

/** First instruction section index that contains a missing/review path, else 0. */
export function defaultInstructionGroupToExpand(
  groupCount: number,
  parentKey: string,
  paths: Iterable<string>,
): number {
  if (groupCount <= 0) return 0;
  for (let index = 0; index < groupCount; index += 1) {
    const prefix = `values.${parentKey}.${index}`;
    for (const path of paths) {
      if (path.startsWith(prefix)) return index;
    }
  }
  return 0;
}
