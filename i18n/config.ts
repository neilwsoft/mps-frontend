export const locales = ["en", "ko"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const COOKIE_NAME = "NEXT_LOCALE";

export const localeLabels: Record<Locale, string> = {
  en: "EN",
  ko: "한국어",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
