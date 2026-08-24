type StarRatingProps = {
  value: number;
  max?: number;
  size?: "sm" | "md";
  label?: string;
};

export function StarRating({ value, max = 5, size = "md", label }: StarRatingProps) {
  const sizeClass = size === "sm" ? "text-base" : "text-xl";
  const rounded = Math.max(0, Math.min(max, Math.round(value * 2) / 2));

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${sizeClass}`}
      aria-label={label ?? `${value} out of ${max} stars`}
      role="img"
    >
      {Array.from({ length: max }, (_, index) => {
        const star = index + 1;
        const filled = rounded >= star;
        const half = !filled && rounded >= star - 0.5;
        return (
          <span
            key={star}
            className={
              filled
                ? "text-terracotta"
                : half
                  ? "text-terracotta/50"
                  : "text-line"
            }
            aria-hidden
          >
            ★
          </span>
        );
      })}
    </div>
  );
}

type StarPickerProps = {
  value: number;
  onChange: (value: number) => void;
  name?: string;
};

export function StarPicker({ value, onChange, name = "rating" }: StarPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-ink">Your rating</span>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Recipe rating">
        {Array.from({ length: 5 }, (_, index) => {
          const star = index + 1;
          const active = value >= star;
          return (
            <button
              key={star}
              type="button"
              name={name}
              role="radio"
              aria-checked={value === star}
              onClick={() => onChange(star)}
              className={`text-2xl transition hover:scale-110 ${
                active ? "text-terracotta" : "text-line hover:text-terracotta/60"
              }`}
            >
              ★
            </button>
          );
        })}
      </div>
      <span className="text-sm text-muted">{value ? `${value} of 5` : "Required"}</span>
    </div>
  );
}
