import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONSEQUENCE_KINDS, consequencesToRun, newConsequence, normalizeConsequence } from "../scripts/helpers/consequence-kinds.js";

describe("normalizeConsequence (RF-68)", () => {
  it("defaults every field of the kind and drops unknown ones", () => {
    const row = normalizeConsequence({ kind: "screenMessage", params: { title: " Covil ", seconds: "99", junk: 1 } });
    assert.deepEqual(row.params, { title: "Covil", text: "", audience: "all", seconds: 30 });
    assert.equal(row.enabled, true);
  });

  it("falls back to a screen message for unknown kinds and keeps choices honest", () => {
    assert.equal(normalizeConsequence({ kind: "explode" }).kind, "screenMessage");
    assert.equal(normalizeConsequence({ kind: "resource", params: { operation: "steal" } }).params.operation, "add");
  });

  it("builds fresh rows for every kind", () => {
    for (const kind of Object.keys(CONSEQUENCE_KINDS)) assert.equal(newConsequence(kind).kind, kind);
  });
});

describe("consequencesToRun", () => {
  const rows = [
    newConsequence("screenMessage"),
    { ...newConsequence("screenMessage"), params: { ...newConsequence("screenMessage").params, audience: "gm" } },
    newConsequence("macro"),
    newConsequence("resource"),
    { ...newConsequence("hook"), enabled: false },
  ];
  const kinds = (list) => list.map((row) => `${row.kind}:${row.params.audience ?? ""}`);
  const active = () => true;

  it("runs local rows for players who can see the position", () => {
    assert.deepEqual(kinds(consequencesToRun(rows, { visible: true, isGM: false, isActiveGM: false, isModuleActive: active })), ["screenMessage:all"]);
    assert.deepEqual(consequencesToRun(rows, { visible: false, isGM: false, isActiveGM: false, isModuleActive: active }), []);
  });

  it("runs GM rows only on the active GM, and skips modules that are off", () => {
    const gm = consequencesToRun(rows, { visible: true, isGM: true, isActiveGM: true, isModuleActive: (id) => id !== "sc-resources" });
    assert.deepEqual(kinds(gm), ["screenMessage:all", "screenMessage:gm", "macro:"]);
  });
});

describe("consequence labels", () => {
  it("names every kind, field and choice in both languages", async () => {
    const { readFile } = await import("node:fs/promises");
    for (const lang of ["en", "pt-BR"]) {
      const root = JSON.parse(await readFile(new URL(`../lang/${lang}.json`, import.meta.url), "utf8")).SC_COMBAT_WHEEL.Consequence;
      for (const [kind, meta] of Object.entries(CONSEQUENCE_KINDS)) {
        assert.equal(typeof root.Kinds[kind], "string", `${lang} Kinds.${kind}`);
        for (const field of meta.fields) {
          assert.equal(typeof root.Fields[field.name], "string", `${lang} Fields.${field.name}`);
          for (const choice of field.choices ?? []) {
            assert.equal(typeof root.Choices[field.name]?.[choice], "string", `${lang} Choices.${field.name}.${choice}`);
          }
        }
      }
    }
  });
});
