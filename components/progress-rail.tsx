type Stop = {
  label: string;
  done: boolean;
  errored?: boolean;
  hint?: string;
};

type Props = {
  stops: Stop[];
  activeIndex: number;
  onSelect?: (i: number) => void;
};

/**
 * Vertical rail with a dot per question. Used by the exam page so the
 * student always knows where they are in the worksheet, regardless of
 * how long the current question's solution is.
 */
export function ProgressRail({ stops, activeIndex, onSelect }: Props) {
  return (
    <ol className="relative space-y-3 border-l border-rule pl-6">
      {stops.map((stop, i) => {
        const state = stop.errored
          ? "error"
          : stop.done
            ? "done"
            : i === activeIndex
              ? "active"
              : "idle";
        return (
          <li key={i} className="rail-dot pr-1" data-state={state}>
            <button
              type="button"
              onClick={() => onSelect?.(i)}
              className={`group/rail flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                i === activeIndex
                  ? "bg-mark-soft/50 text-foreground"
                  : "hover:bg-mark-soft/30"
              }`}
            >
              <span className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground tabular-nums">
                  {(i + 1).toString().padStart(2, "0")}
                </span>
                <span className="font-display text-sm font-medium leading-tight">
                  {stop.label}
                </span>
              </span>
              {stop.hint && (
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {stop.hint}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
