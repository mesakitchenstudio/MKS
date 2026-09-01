/** Typographic editorial measurement plate for the featured measuring lesson. */
export function StudioMeasureVisual() {
  return (
    <figure className="relative mx-auto w-full max-w-[15.5rem] sm:max-w-[17.5rem] md:mx-0 md:max-w-[380px]">
      <div className="relative aspect-square border border-line/80 bg-sand">
        <div
          className="pointer-events-none absolute inset-x-6 top-[38%] border-t border-olive/25"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-8 left-1/2 border-l border-olive/20"
          aria-hidden
        />
        <div className="flex h-full flex-col items-center justify-center px-8 text-center font-serif leading-none">
          <p className="text-[2.05rem] tracking-[-0.02em] text-olive sm:text-[2.2rem] md:text-[2.4rem]">
            1 cup
          </p>
          <p className="mt-[1.15rem] text-[1.55rem] tracking-[-0.015em] text-olive/80 sm:mt-5 sm:text-[1.65rem] md:text-[1.75rem]">
            ½ tsp
          </p>
          <p className="mt-3.5 text-[1.2rem] tracking-[-0.01em] text-olive/65 sm:mt-4 sm:text-[1.3rem] md:text-[1.35rem]">
            120 g
          </p>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-olive/80">
        Volume · spoon · weight
      </figcaption>
    </figure>
  );
}
