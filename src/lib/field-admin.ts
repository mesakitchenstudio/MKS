import { FIELD_KINDS } from "@/lib/fields";

/** Only `select` fields read options at render time (see RecipeEditor KindInput). */
export function fieldKindUsesOptions(kind: string) {
  return kind === "select";
}

export function fieldKindLabel(kind: string) {
  return FIELD_KINDS.find((item) => item.id === kind)?.label ?? kind;
}

export type AdminTypeField = {
  id: string;
  key: string;
  label: string;
  helpText: string;
  kind: string;
  required: boolean;
  options: string[];
  sortOrder: number;
  isShared: boolean;
  globalIndex: number;
};

export function partitionTypeFields(fields: AdminTypeField[]) {
  const typeSpecific = fields
    .filter((field) => !field.isShared)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const shared = fields
    .filter((field) => field.isShared)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return { typeSpecific, shared };
}
