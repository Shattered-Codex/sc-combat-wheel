import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  APPEARANCE_PANELS,
  SETTINGS_SCHEMA,
  SETTING_SECTIONS,
  coerceSetting,
  isSettingShown,
  settingDefault,
  visibilityRules,
} from "../scripts/constants/settings-schema.js";

const catalog = async (name) =>
  JSON.parse(await readFile(new URL(`../lang/${name}.json`, import.meta.url), "utf8")).SC_COMBAT_WHEEL;
const lookup = (root, path) => path.split(".").reduce((node, key) => node?.[key], root);

describe("settings schema (RF-70)", () => {
  const sections = new Map(SETTING_SECTIONS.map((section) => [section.id, section]));

  it("has unique keys and only known sections", () => {
    const keys = SETTINGS_SCHEMA.map((entry) => entry.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(sections.size, SETTING_SECTIONS.length);
    for (const entry of SETTINGS_SCHEMA) assert.ok(entry.section === null || sections.has(entry.section), entry.key);
  });

  it("keeps every section to a single scope (RF-71)", () => {
    for (const entry of SETTINGS_SCHEMA.filter((e) => e.section)) {
      assert.equal(entry.scope, sections.get(entry.section).scope, entry.key);
    }
    for (const section of SETTING_SECTIONS) assert.ok(["client", "user", "world"].includes(section.scope), section.id);
  });

  it("names every section and scope in both languages", async () => {
    for (const lang of ["en", "pt-BR"]) {
      const root = await catalog(lang);
      for (const section of SETTING_SECTIONS) {
        for (const suffix of ["Title", "Hint"]) {
          assert.equal(typeof lookup(root, `SettingsMenu.Sections.${section.id}.${suffix}`), "string", `${lang} ${section.id}.${suffix}`);
        }
        for (const suffix of ["Label", "Badge"]) {
          assert.equal(typeof lookup(root, `SettingsMenu.Scopes.${section.scope}.${suffix}`), "string", `${lang} ${section.scope}.${suffix}`);
        }
      }
    }
  });

  it("gives every visible setting a name, a hint and labelled choices in both languages", async () => {
    for (const lang of ["en", "pt-BR"]) {
      const root = await catalog(lang);
      for (const entry of SETTINGS_SCHEMA.filter((e) => e.section)) {
        assert.equal(typeof lookup(root, `Settings.${entry.key}.Name`), "string", `${lang} ${entry.key}.Name`);
        assert.equal(typeof lookup(root, `Settings.${entry.key}.Hint`), "string", `${lang} ${entry.key}.Hint`);
        for (const choice of entry.choices ?? []) {
          const path = entry.sound ? `Sounds.${choice}` : `Settings.${entry.key}.Choices.${choice}`;
          assert.equal(typeof lookup(root, path), "string", `${lang} ${path}`);
        }
      }
    }
  });

  it("defaults every choice setting to one of its own choices", () => {
    for (const entry of SETTINGS_SCHEMA.filter((e) => e.type === "choice")) {
      assert.ok(entry.choices.includes(entry.default), entry.key);
    }
  });
});

describe("appearance editor (RF-73)", () => {
  const editorSections = new Set(SETTING_SECTIONS.filter((section) => section.kind === "editor").map((section) => section.id));
  const panelIds = new Set([...APPEARANCE_PANELS.map((panel) => panel.id), "theme", "view"]);

  it("gives every setting of an editor section a tab, and only those", () => {
    for (const entry of SETTINGS_SCHEMA) {
      if (editorSections.has(entry.section)) assert.ok(panelIds.has(entry.panel), entry.key);
      else assert.equal(entry.panel, undefined, entry.key);
    }
  });

  it("only hides rows behind settings shown in the same section", () => {
    const sectionOf = new Map(SETTINGS_SCHEMA.map((entry) => [entry.key, entry.section]));
    for (const entry of SETTINGS_SCHEMA.filter((e) => e.visibleWhen)) {
      for (const rule of visibilityRules(entry)) assert.equal(sectionOf.get(rule.key), entry.section, entry.key);
    }
  });

  it("offers presets made only of valid appearance values (RF-97)", async () => {
    const { APPEARANCE_PRESETS } = await import("../scripts/constants/appearance-presets.js");
    const entries = new Map(SETTINGS_SCHEMA.filter((entry) => entry.panel).map((entry) => [entry.key, entry]));
    for (const preset of APPEARANCE_PRESETS) {
      for (const [key, value] of Object.entries(preset.values)) {
        assert.ok(entries.has(key), `${preset.id}.${key}`);
        assert.equal(coerceSetting(entries.get(key), value), value, `${preset.id}.${key}`);
      }
    }
    for (const lang of ["en", "pt-BR"]) {
      const root = await catalog(lang);
      for (const preset of APPEARANCE_PRESETS) assert.equal(typeof root.Presets?.[preset.id]?.Name, "string", `${lang} ${preset.id}`);
    }
  });

  it("keeps this browser's sounds apart from the look (RF-103)", () => {
    const scopeOf = new Map(APPEARANCE_PANELS.map((panel) => [panel.id, panel.scope]));
    for (const panel of APPEARANCE_PANELS) assert.ok(["user", "client"].includes(panel.scope), panel.id);
    for (const entry of SETTINGS_SCHEMA.filter((e) => scopeOf.has(e.panel))) {
      assert.equal(entry.scope, scopeOf.get(entry.panel), entry.key);
      assert.equal(entry.section, entry.scope === "client" ? "sounds" : "appearance", entry.key);
    }
  });

  it("names every sound event the editor lists in both languages (RF-103)", async () => {
    const { SOUND_EVENTS } = await import("../scripts/helpers/turn-events.js");
    for (const lang of ["en", "pt-BR"]) {
      const root = await catalog(lang);
      for (const event of SOUND_EVENTS) assert.equal(typeof root.Appearance.SoundEvents?.[event], "string", `${lang} ${event}`);
      for (const panel of APPEARANCE_PANELS) assert.equal(typeof root.Appearance.Panels?.[panel.id], "string", `${lang} ${panel.id}`);
    }
  });

  it("keeps a sound's file row out of sight until the sound is a file", () => {
    const file = SETTINGS_SCHEMA.find((entry) => entry.key === "soundOwnTurnFile");
    assert.equal(isSettingShown(file, { soundOwnTurn: "bell" }), false);
    assert.equal(isSettingShown(file, { soundOwnTurn: "file" }), true);
  });

  it("shows the custom radii only for the custom layout of the wheel", () => {
    const outer = SETTINGS_SCHEMA.find((entry) => entry.key === "customOuter");
    assert.equal(isSettingShown(outer, { view: "wheel", layoutPreset: "custom" }), true);
    assert.equal(isSettingShown(outer, { view: "wheel", layoutPreset: "compact" }), false);
    assert.equal(isSettingShown(outer, { view: "carousel", layoutPreset: "custom" }), false);
    const shape = SETTINGS_SCHEMA.find((entry) => entry.key === "portraitShape");
    assert.equal(isSettingShown(shape, { view: "wheel", layoutPreset: "dense" }), true);
    assert.equal(isSettingShown(shape, { view: "carousel" }), false);
    assert.equal(isSettingShown({ key: "x" }, {}), true);
  });

  it("swaps the wheel's rows for the card rows in the card views (RF-90)", () => {
    const row = (key) => SETTINGS_SCHEMA.find((entry) => entry.key === key);
    for (const view of ["carousel", "slider"]) {
      assert.equal(isSettingShown(row("layoutPreset"), { view }), false, view);
      assert.equal(isSettingShown(row("sliceGap"), { view }), false, view);
      assert.equal(isSettingShown(row("trackSize"), { view }), true, view);
      assert.equal(isSettingShown(row("trackReach"), { view }), true, view);
      assert.equal(isSettingShown(row("orientation"), { view }), true, view);
    }
    assert.equal(isSettingShown(row("trackSize"), { view: "wheel" }), false);
  });

  it("keeps the Venaerys tab for worlds that run it (RF-82)", () => {
    const phases = APPEARANCE_PANELS.find((panel) => panel.id === "phases");
    assert.equal(phases.module, "sc-venaerys-initiative");
    assert.ok(SETTINGS_SCHEMA.filter((entry) => entry.panel === "phases").length >= 3);
    assert.ok(APPEARANCE_PANELS.filter((panel) => panel.id !== "phases").every((panel) => !panel.module));
  });

  it("names every tab in both languages", async () => {
    for (const lang of ["en", "pt-BR"]) {
      const root = await catalog(lang);
      for (const panel of APPEARANCE_PANELS) assert.equal(typeof root.Appearance.Panels[panel.id], "string", `${lang} ${panel.id}`);
    }
  });
});

describe("settingDefault", () => {
  it("resolves late defaults and never hands out the schema's own objects", () => {
    assert.equal(settingDefault({ default: () => 6 }), 6);
    const entry = SETTINGS_SCHEMA.find((e) => e.type === "object");
    const value = settingDefault(entry);
    assert.deepEqual(value, entry.default);
    assert.notEqual(value, entry.default);
  });
});

describe("coerceSetting", () => {
  const number = { type: "number", range: { min: 0, max: 100 } };
  it("clamps numbers and rejects garbage", () => {
    assert.equal(coerceSetting(number, "150"), 100);
    assert.equal(coerceSetting(number, "abc"), null);
  });

  it("keeps colors to #rrggbb or empty (RF-92)", () => {
    assert.equal(coerceSetting({ type: "color" }, "#A1B2C3"), "#a1b2c3");
    assert.equal(coerceSetting({ type: "color" }, ""), "");
    assert.equal(coerceSetting({ type: "color" }, "red"), null);
  });

  it("keeps a list to its own choices (RF-99)", () => {
    const list = { type: "multi", choices: ["a", "b", "c"] };
    assert.deepEqual(coerceSetting(list, ["c", "x", "a"]), ["a", "c"]);
    assert.equal(coerceSetting(list, "a"), null);
  });

  it("reads checkboxes and keeps choices honest", () => {
    assert.equal(coerceSetting({ type: "boolean" }, undefined), false);
    assert.equal(coerceSetting({ type: "boolean" }, true), true);
    assert.equal(coerceSetting({ type: "choice", choices: ["a"] }, "b"), null);
  });
});
