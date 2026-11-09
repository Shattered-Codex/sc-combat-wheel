import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOOK_FILE_TYPE, lookFile, lookFileName, readLookFile } from "../scripts/helpers/look-file.js";

describe("look files (RF-120)", () => {
  it("round-trips a look through its file", () => {
    const text = JSON.stringify(lookFile({ theme: "gothic", scale: 120 }, { name: "Gothic", exported: "2026-10-26T00:00:00Z" }));
    assert.deepEqual(readLookFile(text), { name: "Gothic", values: { theme: "gothic", scale: 120 } });
    assert.equal(JSON.parse(text).type, LOOK_FILE_TYPE);
  });

  it("upgrades a look exported before an option changed", () => {
    const look = readLookFile(JSON.stringify(lookFile({ theme: "ink", barLayout: "arc" })));
    assert.equal(look.values.theme, "gothic");
    assert.equal(look.values.barLayout, "bar");
  });

  it("refuses what is not a look file", () => {
    for (const text of ["not json", "null", "[]", JSON.stringify({ type: "other", values: {} }), JSON.stringify({ type: LOOK_FILE_TYPE, values: [] })]) {
      assert.equal(readLookFile(text), null, text);
    }
  });

  it("names the file after the look, safely", () => {
    assert.equal(lookFileName("Pergaminho Élfico!", "paper"), "sc-combat-wheel-pergaminho-elfico.json");
    assert.equal(lookFileName("", "nocturne"), "sc-combat-wheel-nocturne.json");
    assert.equal(lookFileName("???", ""), "sc-combat-wheel-look.json");
  });
});
