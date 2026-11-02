import ar from "./ar.js";

// One locale today (Arabic, right to left). Adding English means adding en.js with the same keys and an entry here.
export const LOCALES = Object.freeze({ ar: { dictionary: ar, dir: "rtl", tag: "ar-EG-u-nu-latn" } });
export const DEFAULT_LOCALE = "ar";

let current = DEFAULT_LOCALE;
export const setLocale = locale => { if (LOCALES[locale]) current = locale; };
export const locale = () => LOCALES[current];

const lookup = (dictionary, key) => key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), dictionary);

// t("projects.status.done") or t("errors.rate_limited", { wait: "5 دقايق" }). A missing key returns the key itself so it is visible.
export function t(key, values = {}) {
  const found = lookup(locale().dictionary, key);
  if (typeof found !== "string") return key;
  return found.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole));
}

export const hasKey = key => typeof lookup(locale().dictionary, key) === "string";
