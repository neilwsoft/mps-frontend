"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Sun/moon toggle. Cycles between light and dark; system is honored on
 * first load via the provider's defaultTheme.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid the hydration-mismatch warning — next-themes resolves the
  // theme on the client only.
  useEffect(() => setMounted(true), []);

  const dark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="relative overflow-hidden"
    >
      <Sun
        className={`absolute h-3.5 w-3.5 transition-all duration-500 ${
          mounted && dark
            ? "rotate-90 scale-0 opacity-0"
            : "rotate-0 scale-100 opacity-100"
        }`}
      />
      <Moon
        className={`absolute h-3.5 w-3.5 transition-all duration-500 ${
          mounted && dark
            ? "rotate-0 scale-100 opacity-100"
            : "-rotate-90 scale-0 opacity-0"
        }`}
      />
    </Button>
  );
}
