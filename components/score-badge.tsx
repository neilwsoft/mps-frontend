import { cn } from "@/lib/utils";

type Props = {
  score: number;
  total: number;
  size?: "sm" | "md";
  className?: string;
};

/**
 * Big serif "X / Y" score chip used on results, dashboard, admin tables.
 * Color shifts subtly across performance bands without ever leaving the
 * editorial palette.
 */
export function ScoreBadge({ score, total, size = "md", className }: Props) {
  const pct = total === 0 ? 0 : score / total;
  const tone =
    pct >= 0.85
      ? "text-correct bg-correct-soft border-correct/40 shadow-[0_0_0_1px_var(--correct-soft)]"
      : pct >= 0.5
        ? "text-gold bg-gold-soft/60 border-gold/40"
        : "text-mark bg-mark-soft border-mark/40";

  return (
    <span
      className={cn(
        "anim-pop inline-flex items-baseline gap-1.5 rounded-md border px-3 py-1 font-display tabular-nums",
        size === "sm" ? "text-sm" : "text-lg",
        tone,
        className,
      )}
    >
      <span className="font-medium">{score}</span>
      <span className="text-muted-foreground/70">/</span>
      <span className="text-muted-foreground">{total}</span>
    </span>
  );
}
