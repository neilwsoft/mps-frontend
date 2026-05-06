"use client";

import { useEffect, useRef } from "react";
import type { MathfieldElement } from "mathlive";

type Props = {
  value: string;
  onChange: (latex: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
};

/**
 * Imperative MathLive wrapper. Constructs a <math-field> element via the
 * MathfieldElement constructor (after dynamic import) and appends it to a
 * host div, sidestepping the async custom-element-upgrade timing pitfalls
 * that break declarative JSX usage.
 */
export function MathField({
  value,
  onChange,
  placeholder = "",
  ariaLabel = "math input",
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<MathfieldElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  // Mount the math-field once.
  useEffect(() => {
    let cancelled = false;
    void import("mathlive").then(({ MathfieldElement }) => {
      if (cancelled || !hostRef.current) return;
      const mf = new MathfieldElement();
      mf.value = valueRef.current;
      mf.setAttribute("aria-label", ariaLabel);
      mf.setAttribute("virtual-keyboard-policy", "manual");
      mf.setAttribute("placeholder", placeholder);
      mf.style.display = "block";
      mf.style.fontSize = "1.25rem";
      mf.style.padding = "0.75rem 1rem";
      mf.style.border = "1px solid var(--border)";
      mf.style.borderRadius = "0.5rem";
      mf.style.background = "var(--background)";
      mf.style.color = "var(--foreground)";
      mf.style.minHeight = "3rem";
      mf.style.width = "100%";
      mf.addEventListener("input", () => {
        onChangeRef.current(mf.value);
      });
      hostRef.current.appendChild(mf);
      fieldRef.current = mf;
    });
    return () => {
      cancelled = true;
      const mf = fieldRef.current;
      if (mf && mf.parentNode) mf.parentNode.removeChild(mf);
      fieldRef.current = null;
    };
    // We intentionally only mount once. Subsequent value changes flow
    // through the second effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the field's value in sync when the prop changes externally
  // (e.g. QA dummy-data buttons, parent state reset on submission).
  useEffect(() => {
    const mf = fieldRef.current;
    if (!mf) return;
    if (mf.value !== value) {
      mf.value = value;
    }
  }, [value]);

  return <div ref={hostRef} className={className} />;
}
