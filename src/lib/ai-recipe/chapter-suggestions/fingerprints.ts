import { createHash } from "node:crypto";
import type { InstructionGroupWithChapters } from "@/lib/instruction-chapters";

export function instructionSectionFingerprint(
  group: InstructionGroupWithChapters,
  index: number,
): string {
  const name = String(group.name ?? "").trim();
  const label = String(group.chapterLabel ?? "").trim();
  const steps = (group.steps ?? []).map((step) => String(step ?? "").trim()).join("\n");
  const payload = `${index}|${name}|${label}|${steps}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function instructionSnapshotFingerprint(groups: InstructionGroupWithChapters[]): string {
  const payload = groups
    .map((group, index) => instructionSectionFingerprint(group, index))
    .join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

export function sectionFingerprintMatches(
  group: InstructionGroupWithChapters,
  index: number,
  expected: string,
): boolean {
  return instructionSectionFingerprint(group, index) === expected;
}
