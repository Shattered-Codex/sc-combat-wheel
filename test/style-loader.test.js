import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { STYLESHEETS } from "../scripts/constants/module-constants.js";
import StyleLoader from "../scripts/services/StyleLoader.js";

describe("StyleLoader", () => {
  it("adds every stylesheet once, unlayered, with the version against stale caches", () => {
    const appended = [];
    const head = { append: (el) => appended.push(el), querySelector: (sel) => appended.find((el) => sel === `link#${el.id}`) ?? null };
    const previous = globalThis.document;
    globalThis.document = { head, createElement: () => ({}) };
    try {
      StyleLoader.inject({ version: "1.2.0" });
      StyleLoader.inject({ version: "1.2.0" });
      assert.deepEqual(appended.map((el) => el.href), STYLESHEETS.map((f) => `modules/sc-combat-wheel/${f}?v=1.2.0`));
      assert.ok(appended.every((el) => el.rel === "stylesheet"));
    } finally {
      globalThis.document = previous;
    }
  });

  it("is ready once every added sheet has loaded or failed", async () => {
    const appended = [];
    const makeLink = () => {
      const handlers = new Map();
      return {
        addEventListener: (type, fn) => {
          if (!handlers.has(type)) handlers.set(type, new Set());
          handlers.get(type).add(fn);
        },
        removeEventListener: (type, fn) => handlers.get(type)?.delete(fn),
        dispatch: (type) => [...(handlers.get(type) ?? [])].forEach((fn) => fn()),
      };
    };
    const previous = globalThis.document;
    globalThis.document = { head: { append: (el) => appended.push(el), querySelector: (sel) => appended.find((el) => sel === `link#${el.id}`) ?? null }, createElement: makeLink };
    try {
      StyleLoader.inject({ version: "1.2.0" });
      let ready = false;
      const pending = StyleLoader.ensureLoaded().then(() => { ready = true; });
      for (const link of appended.slice(0, -1)) link.dispatch("load");
      await new Promise((resolve) => setTimeout(resolve));
      assert.equal(ready, false, "every sheet must finish before the controls are measured");
      // Present already: injecting again neither adds links nor resets the wait.
      StyleLoader.inject({ version: "1.2.0" });
      assert.equal(appended.length, STYLESHEETS.length);
      appended.at(-1).dispatch("error");
      await pending;
      assert.equal(ready, true, "a failed sheet does not hold the wheel back");
    } finally {
      globalThis.document = previous;
    }
  });

  it("leaves the manifest without styles, so Foundry does not layer them too", () => {
    const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
    assert.equal(manifest.styles, undefined);
    for (const file of STYLESHEETS) assert.ok(readFileSync(new URL(`../${file}`, import.meta.url), "utf8").length, file);
  });
});
