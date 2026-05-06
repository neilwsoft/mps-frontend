import { cn } from "@/lib/utils";

type Props = {
  /** 0–1 fraction. Pass null when there's no data yet. */
  pct: number | null;
  /** Diameter in px. */
  size?: number;
  className?: string;
  /** Big number shown in the center; defaults to "{pct}%" or "—". */
  label?: string;
  sublabel?: string;
};

/**
 * Conic-gradient accuracy ring. Renders a colored arc from 12 o'clock
 * proportional to `pct`, with a label in the center.
 */
export function AccuracyRing({ pct, size = 88, label, sublabel, className }: Props) {
  const pctNum = pct === null ? 0 : Math.max(0, Math.min(1, pct));
  const ringColor =
    pct === null
      ? "var(--rule)"
      : pctNum >= 0.85
        ? "var(--correct)"
        : pctNum >= 0.5
          ? "var(--gold)"
          : "var(--mark)";
  const text = label ?? (pct === null ? "—" : `${Math.round(pctNum * 100)}%`);

  return (
    <div
      className={cn("accuracy-ring relative shrink-0 rounded-full", className)}
      style={
        {
          width: size,
          height: size,
          ["--pct" as string]: pctNum * 100,
          ["--ring-color" as string]: ringColor,
        } as React.CSSProperties
      }
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-xl font-semibold tabular-nums leading-none">
          {text}
        </span>
        {sublabel && (
          <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
