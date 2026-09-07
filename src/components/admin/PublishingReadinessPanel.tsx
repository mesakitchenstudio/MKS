import type { RecipePublishingReadiness } from "@/lib/recipe-publishing-readiness";
import { humanizePublishingStatus } from "@/lib/recipe-publishing-readiness";
import { adminFocusRing } from "@/lib/admin-ui";

export function PublishingReadinessPanel({
  readiness,
  onJumpToField,
}: {
  readiness: RecipePublishingReadiness;
  onJumpToField?: (fieldKey: string) => void;
}) {
  const { counts, status, required, recommended } = readiness;
  const statusTone =
    status === "not_ready"
      ? "text-terracotta"
      : status === "ready_with_recommendations"
        ? "text-olive"
        : "text-olive";

  return (
    <section
      className="rounded-sm border border-line bg-cream/20 px-4 py-3"
      aria-label="Publishing readiness"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Publishing readiness</h2>
        <p className={`text-sm font-semibold ${statusTone}`}>
          {status === "ready" ? "✓ " : status === "not_ready" ? "" : ""}
          {humanizePublishingStatus(status)}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted">
        {counts.requiredPassed} / {counts.requiredTotal} required
        <span className="mx-1.5 text-line" aria-hidden>
          ·
        </span>
        {counts.recommendedPassed} / {counts.recommendedTotal} recommended
      </p>

      {required.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Required
          </h3>
          <ul className="mt-2 space-y-1.5">
            {required.map((check) => (
              <ReadinessRow key={check.id} check={check} onJumpToField={onJumpToField} />
            ))}
          </ul>
        </div>
      ) : null}

      {recommended.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Recommended
          </h3>
          <ul className="mt-2 space-y-1.5">
            {recommended.map((check) => (
              <ReadinessRow key={check.id} check={check} onJumpToField={onJumpToField} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ReadinessRow({
  check,
  onJumpToField,
}: {
  check: RecipePublishingReadiness["required"][number];
  onJumpToField?: (fieldKey: string) => void;
}) {
  const mark = check.passed ? "✓" : check.severity === "required" ? "!" : "!";
  const tone = check.passed
    ? "text-muted"
    : check.severity === "required"
      ? "text-terracotta"
      : "text-olive";
  const label = (
    <span className={`text-sm ${tone}`}>
      <span className="mr-1.5 font-semibold" aria-hidden>
        {mark}
      </span>
      {check.label}
    </span>
  );

  if (!check.passed && check.fieldKey && onJumpToField) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onJumpToField(check.fieldKey!)}
          className={`text-left ${adminFocusRing}`}
          title={check.message}
        >
          {label}
        </button>
      </li>
    );
  }

  return (
    <li title={check.message}>
      {label}
    </li>
  );
}
