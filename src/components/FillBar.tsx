/** The product's liquid fill-level bar — how much is left in a bucket. */
export function FillBar({
  ratio,
  durationMs = 700,
}: {
  ratio: number;
  durationMs?: number;
}) {
  return (
    <div className="bg-surface mt-2 h-2 overflow-hidden rounded-full">
      <div
        className="bg-positive h-full rounded-full transition-[width] ease-out motion-reduce:transition-none"
        style={{
          width: `${Math.max(4, Math.round(ratio * 100))}%`,
          transitionDuration: `${durationMs}ms`,
        }}
      />
    </div>
  );
}
