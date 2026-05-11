"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Languages } from "lucide-react";

import { setLocale } from "@/app/actions/locale";
import { locales, localeLabels, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LocaleSwitcher() {
  const current = useLocale() as Locale;
  const t = useTranslations("common");
  const [pending, startTransition] = useTransition();

  function pick(next: Locale) {
    if (next === current || pending) return;
    startTransition(() => setLocale(next));
  }

  return (
    <div
      role="group"
      aria-label={t("language")}
      className="inline-flex items-center rounded-md border border-rule bg-background/40 p-0.5"
    >
      <Languages
        className="ml-1.5 mr-0.5 h-3 w-3 text-muted-foreground"
        aria-hidden
      />
      {locales.map((loc) => {
        const active = loc === current;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => pick(loc)}
            disabled={pending}
            aria-pressed={active}
            className={cn(
              "rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors disabled:opacity-50",
              active
                ? "bg-mark text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {localeLabels[loc]}
          </button>
        );
      })}
    </div>
  );
}
