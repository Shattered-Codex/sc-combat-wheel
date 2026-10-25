import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_STYLE, chosenStyle, filterStyleOptions, normalizeStyles, upsertStyle } from "../scripts/helpers/combat-styles.js";

describe("combat styles (RF-108)", () => {
  const styles = normalizeStyles([
    { id: "boss", name: "Chefe", values: { theme: "crimson" } },
    { id: "calm", name: "Calmo", values: { theme: "mist" } },
  ]);

  it("keeps only well-formed styles, once each", () => {
    const raw = [
      { id: "a", name: " A ", values: {} },
      { id: "a", name: "again", values: {} },
      { id: "", name: "no id", values: {} },
      { id: "b", name: "", values: {} },
      { id: NO_STYLE, name: "reserved", values: {} },
      { id: "c", name: "no values" },
      null,
    ];
    assert.deepEqual(normalizeStyles(raw), [{ id: "a", name: "A", values: {} }]);
    assert.deepEqual(normalizeStyles("nope"), []);
  });

  it("lets the combat's own choice win over the default", () => {
    assert.equal(chosenStyle({ styles, flag: "calm", defaultId: "boss" }).id, "calm");
    assert.equal(chosenStyle({ styles, defaultId: "boss" }).id, "boss");
  });

  it("draws the usual look for none, nothing, or a style that was deleted", () => {
    assert.equal(chosenStyle({ styles, flag: NO_STYLE, defaultId: "boss" }), null);
    assert.equal(chosenStyle({ styles }), null);
    assert.equal(chosenStyle({ styles, flag: "gone" }), null);
  });

  it("replaces a style saved again under the same name, and adds a new one otherwise", () => {
    const replaced = upsertStyle(styles, { name: "chefe", values: { theme: "royal" } }, "new");
    assert.equal(replaced.length, 2);
    assert.deepEqual(replaced[0], { id: "boss", name: "chefe", values: { theme: "royal" } });
    const added = upsertStyle(styles, { name: "Furtivo", values: {} }, "new");
    assert.deepEqual(added.at(-1), { id: "new", name: "Furtivo", values: {} });
    assert.equal(upsertStyle(styles, { name: "   ", values: {} }, "x"), styles);
  });

  it("finds styles by any part of the name, ignoring case and accents, starts first", () => {
    const options = [{ name: "Chefe final" }, { name: "Água profunda" }, { name: "Sob a ÁGUA" }, { name: "O visual de sempre" }];
    assert.deepEqual(filterStyleOptions(options, "agua").map((o) => o.name), ["Água profunda", "Sob a ÁGUA"]);
    assert.deepEqual(filterStyleOptions(options, "  CHE ").map((o) => o.name), ["Chefe final"]);
    assert.equal(filterStyleOptions(options, "").length, 4);
    assert.deepEqual(filterStyleOptions(options, "xyz"), []);
  });
});
