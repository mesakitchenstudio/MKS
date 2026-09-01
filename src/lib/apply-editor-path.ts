function setByPath(target: unknown, parts: string[], value: unknown): unknown {
  if (parts.length === 0) return value;
  const [head, ...rest] = parts;
  if (!head) return target;

  if (rest.length === 0) {
    if (Array.isArray(target)) {
      const copy = [...target];
      copy[Number(head)] = value;
      return copy;
    }
    return { ...(target && typeof target === "object" ? target : {}), [head]: value };
  }

  const current = Array.isArray(target)
    ? target[Number(head)]
    : target && typeof target === "object"
      ? (target as Record<string, unknown>)[head]
      : undefined;
  const nextChild = setByPath(current ?? (/^\d+$/.test(rest[0] ?? "") ? [] : {}), rest, value);

  if (Array.isArray(target)) {
    const copy = [...target];
    copy[Number(head)] = nextChild;
    return copy;
  }

  return {
    ...(target && typeof target === "object" ? target : {}),
    [head]: nextChild,
  };
}

/** Apply a targeted AI value at an editor path (supports nested instruction/faq paths). */
export function applyValueAtEditorPath(
  values: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  if (!path.startsWith("values.")) return values;
  const segments = path.slice("values.".length).split(".");
  const topKey = segments[0];
  if (!topKey) return values;
  const nextTop = setByPath(values[topKey], segments.slice(1), value);
  return { ...values, [topKey]: nextTop };
}

export function readValueAtEditorPath(values: Record<string, unknown>, path: string): unknown {
  if (!path.startsWith("values.")) return undefined;
  let cursor: unknown = values;
  for (const segment of path.slice("values.".length).split(".")) {
    if (cursor == null) return undefined;
    cursor = Array.isArray(cursor)
      ? cursor[Number(segment)]
      : (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** Resolve the current editor value for a field path (top-level or nested under values). */
export function readCurrentEditorFieldValue(input: {
  path: string;
  title?: string;
  excerpt?: string;
  categoryIds?: string[];
  values: Record<string, unknown>;
}): unknown {
  if (input.path === "title") return input.title ?? "";
  if (input.path === "excerpt") return input.excerpt ?? "";
  if (input.path === "categoryIds") return input.categoryIds ?? [];
  if (input.path.startsWith("values.")) {
    return readValueAtEditorPath(input.values, input.path);
  }
  return undefined;
}
