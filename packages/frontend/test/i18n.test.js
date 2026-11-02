import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ar from "../src/i18n/ar.js";
import { hasKey, t } from "../src/i18n/index.js";

const SRC = path.resolve(__dirname, "../src");
const sources = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sources(path.join(dir, e.name)) : /\.(jsx?|js)$/.test(e.name) && !e.name.startsWith("ar.") ? [path.join(dir, e.name)] : []));
const code = sources(SRC).map(file => [path.relative(SRC, file), fs.readFileSync(file, "utf8")]);

const leaves = (node, prefix = "") => Object.entries(node).flatMap(([k, v]) => (typeof v === "object" ? leaves(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe("i18n", () => {
  it("every literal t('key') used in the source exists in the Arabic dictionary", () => {
    const missing = [];
    for (const [file, text] of code) for (const m of text.matchAll(/\bt\(\s*["']([\w.]+)["']/g)) if (!hasKey(m[1])) missing.push(`${file}: ${m[1]}`);
    expect(missing).toEqual([]);
  });

  it("every dynamic t(`family.${x}`) points at a family that exists and has entries", () => {
    const families = new Set();
    for (const [, text] of code) for (const m of text.matchAll(/\bt\(\s*`([\w.]+)\.\$\{/g)) families.add(m[1]);
    expect(families.size).toBeGreaterThan(3);
    for (const family of families) {
      const node = family.split(".").reduce((n, p) => n?.[p], ar);
      expect(node && Object.keys(node).length, family).toBeGreaterThan(0);
    }
  });

  it("the dictionary has no empty strings and its placeholders are filled by t()", () => {
    for (const key of leaves(ar)) expect(t(key).trim().length, key).toBeGreaterThan(0);
    expect(t("errors.rate_limited", { wait: "5 دقيقة" })).toContain("5 دقيقة");
    expect(t("errors.rate_limited", { wait: "x" })).not.toMatch(/\{/);
    expect(t("no.such.key")).toBe("no.such.key");
  });

  it("every error code the backend can send has an Arabic message", () => {
    const backend = fs.readFileSync(path.resolve(__dirname, "../../backend/src/errors.js"), "utf8");
    const codes = [...backend.matchAll(/^\s+(\w+): \d{3},/gm)].map(m => m[1]);
    expect(codes.length).toBeGreaterThan(15);
    for (const code of codes) expect(hasKey(`errors.${code}`), code).toBe(true);
  });

  it("no hard-coded Arabic text sits in components (strings live in the dictionary)", () => {
    const offenders = code.filter(([file, text]) => /[؀-ۿ]/.test(text) && !file.startsWith("i18n")).map(([file]) => file);
    expect(offenders).toEqual(["lib/format.js"]); // the " و " that joins parts of a duration
  });
});
