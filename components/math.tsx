"use client";

import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

type Props = {
  latex: string;
  display?: boolean;
  className?: string;
};

export function MathExpr({ latex, display = false, className }: Props) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(latex, ref.current, {
        displayMode: display,
        throwOnError: false,
        strict: "ignore",
      });
    } catch {
      if (ref.current) ref.current.textContent = latex;
    }
  }, [latex, display]);

  return <span ref={ref} className={className} aria-label={latex} />;
}
