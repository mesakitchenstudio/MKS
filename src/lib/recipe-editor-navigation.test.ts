import { describe, expect, it } from "vitest";
import type { FieldNodeState } from "@/lib/recipe-editor-field-state";
import {
  buildEditorIssueQueues,
  defaultInstructionGroupToExpand,
  editorSectionDomId,
  firstIssueForSection,
  issuesForSection,
} from "@/lib/recipe-editor-navigation";

function node(partial: Partial<FieldNodeState> & Pick<FieldNodeState, "path" | "key" | "label" | "section">): FieldNodeState {
  return {
    blocking: false,
    needsReview: false,
    reviewState: "unreviewed",
    source: "staff",
    aiFillable: false,
    ...partial,
  };
}

describe("buildEditorIssueQueues", () => {
  it("orders missing and review issues by section then path", () => {
    const nodes: FieldNodeState[] = [
      node({ path: "values.instructions.1.steps.0", key: "instructions", label: "Step", section: "content", needsReview: true }),
      node({ path: "title", key: "title", label: "Title", section: "basics", blocking: true }),
      node({ path: "values.excerpt", key: "excerpt", label: "Excerpt", section: "basics", needsReview: true }),
    ];
    const queues = buildEditorIssueQueues(nodes);
    expect(queues.missing.map((issue) => issue.path)).toEqual(["title"]);
    expect(queues.review.map((issue) => issue.path)).toEqual(["values.excerpt", "values.instructions.1.steps.0"]);
  });
});

describe("firstIssueForSection", () => {
  it("returns the first issue in a section for the requested kind", () => {
    const queues = buildEditorIssueQueues([
      node({ path: "title", key: "title", label: "Title", section: "basics", blocking: true }),
      node({ path: "values.holiday", key: "holiday", label: "Holiday", section: "details", blocking: true }),
    ]);
    expect(firstIssueForSection(queues, "details", "missing")?.path).toBe("values.holiday");
    expect(firstIssueForSection(queues, "media", "missing")).toBeUndefined();
  });
});

describe("issuesForSection", () => {
  it("filters issues to one section", () => {
    const queues = buildEditorIssueQueues([
      node({ path: "title", key: "title", label: "Title", section: "basics", blocking: true }),
      node({ path: "values.intro", key: "intro", label: "Intro", section: "content", needsReview: true }),
    ]);
    expect(issuesForSection(queues.review, "content")).toHaveLength(1);
  });
});

describe("editorSectionDomId", () => {
  it("maps editor sections to stable DOM ids", () => {
    expect(editorSectionDomId("content")).toBe("recipe-section-content");
  });
});

describe("defaultInstructionGroupToExpand", () => {
  it("opens the first section containing a missing or review path", () => {
    const index = defaultInstructionGroupToExpand(4, "instructions", [
      "values.instructions.2.steps.1",
    ]);
    expect(index).toBe(2);
  });

  it("defaults to section zero when nothing needs attention", () => {
    expect(defaultInstructionGroupToExpand(3, "instructions", [])).toBe(0);
  });
});
