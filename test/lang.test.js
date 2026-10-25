import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const read = async (name) =>
  JSON.parse(await readFile(new URL(`../lang/${name}.json`, import.meta.url), "utf8"));

/** Every key path of a nested catalog. */
function paths(node, prefix = "") {
  const out = new Set();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.add(path);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const nested of paths(value, path)) out.add(nested);
    }
  }
  return out;
}

/** `{name}`-style placeholders — a translation that drops one breaks a sentence. */
function placeholders(text) {
  return new Set(String(text).match(/\{[a-zA-Z0-9_]+\}/g) ?? []);
}

function flat(node, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flat(value, path, out);
    else out.set(path, value);
  }
  return out;
}

describe("localization catalogs", () => {
  it("keeps en and pt-BR structurally identical", async () => {
    const [en, pt] = await Promise.all([read("en"), read("pt-BR")]);
    const inEn = paths(en);
    const inPt = paths(pt);
    assert.deepEqual([...inEn].filter((k) => !inPt.has(k)), [], "missing from pt-BR");
    assert.deepEqual([...inPt].filter((k) => !inEn.has(k)), [], "missing from en");
  });

  /**
   * A key written twice in the same object is legal JSON and silently loses:
   * `JSON.parse` keeps the LAST one, so every check above — parity,
   * placeholders, the missing-key sweep — reads the survivor and passes while
   * the string the author edited is the one that was dropped. Only the raw
   * text can see it.
   */
  it("has no key written twice inside one object", async () => {
    for (const name of ["en", "pt-BR"]) {
      const text = await readFile(new URL(`../lang/${name}.json`, import.meta.url), "utf8");
      const stack = [];
      const seen = [new Set()];
      const duplicates = [];
      for (const line of text.split("\n")) {
        const key = line.match(/^\s*"([^"]+)"\s*:/)?.[1];
        if (key) {
          const scope = seen.at(-1);
          const path = [...stack, key].join(".");
          if (scope.has(key)) duplicates.push(path);
          scope.add(key);
          if (line.trimEnd().endsWith("{")) {
            stack.push(key);
            seen.push(new Set());
          }
          continue;
        }
        // a closing brace with no key on it ends the object this scope is for
        if (/^\s*\}/.test(line) && stack.length) {
          stack.pop();
          seen.pop();
        }
      }
      assert.deepEqual(duplicates, [], `duplicate keys in lang/${name}.json`);
    }
  });

  it("keeps the same placeholders in both languages", async () => {
    const [en, pt] = await Promise.all([read("en"), read("pt-BR")]);
    const enFlat = flat(en);
    const ptFlat = flat(pt);
    const mismatched = [];
    for (const [path, value] of enFlat) {
      if (typeof value !== "string") continue;
      const other = ptFlat.get(path);
      if (typeof other !== "string") continue;
      const a = placeholders(value);
      const b = placeholders(other);
      if (a.size !== b.size || [...a].some((token) => !b.has(token))) mismatched.push(path);
    }
    assert.deepEqual(mismatched, []);
  });
});
