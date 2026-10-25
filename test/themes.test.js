import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { FOLLOW_SYSTEM, THEMES, THEME_GROUPS, resolveTheme } from "../scripts/helpers/themes.js";

describe("THEMES and THEME_GROUPS", () => {
  it("keeps Nocturne as the default", () => {
    assert.equal(THEMES[0], "nocturne");
  });

  it("lists every theme in exactly one group, and never the follow-system choice", () => {
    const grouped = THEME_GROUPS.flatMap((group) => group.themes);
    assert.equal(new Set(grouped).size, grouped.length, "a theme is in two groups");
    assert.deepEqual([...grouped].sort(), [...THEMES].sort());
    assert.ok(!grouped.includes(FOLLOW_SYSTEM));
    assert.deepEqual(THEME_GROUPS.map((group) => group.id), ["general", "sober", "vivid", "horror", "systems", "scifi", "carousels"]);
  });

  it("has a stylesheet block for every theme but the default", async () => {
    const css = await readFile(new URL("../styles/themes.css", import.meta.url), "utf8");
    for (const theme of THEMES.slice(1)) {
      assert.ok(css.includes(`[data-scw-theme="${theme}"]`), `no CSS for ${theme}`);
    }
  });
});

describe("resolveTheme", () => {
  it("uses the look's own choice", () => {
    assert.equal(resolveTheme({ chosen: "parchment", systemId: "dnd5e" }), "parchment");
  });

  it("follows the game system, with CoC7's id mapped", () => {
    assert.equal(resolveTheme({ chosen: "system", systemId: "pf2e" }), "pf2e");
    assert.equal(resolveTheme({ chosen: "system", systemId: "CoC7" }), "coc7");
  });

  it("falls back to Nocturne for unknown systems and stale values", () => {
    assert.equal(resolveTheme({ chosen: "system", systemId: "swade" }), "nocturne");
    assert.equal(resolveTheme({ chosen: "removed-theme", systemId: "dnd5e" }), "nocturne");
  });
});
