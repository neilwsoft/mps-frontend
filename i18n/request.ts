import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { COOKIE_NAME, defaultLocale, isLocale, type Locale } from "./config";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(COOKIE_NAME)?.value;

  let locale: Locale = defaultLocale;
  if (isLocale(fromCookie)) {
    locale = fromCookie;
  } else {
    const accept = (await headers()).get("accept-language") ?? "";
    if (accept.toLowerCase().startsWith("ko")) locale = "ko";
  }

  const messages = (await import(`./messages/${locale}.json`)).default;
  return { locale, messages };
});
