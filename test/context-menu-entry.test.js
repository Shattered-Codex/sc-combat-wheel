import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contextMenuEntry } from "../scripts/helpers/context-menu-entry.js";

describe("contextMenuEntry (RF-105)", () => {
  const visible = () => true;
  const onClick = () => {};
  const entry = { label: "KEY", icon: "fa-solid fa-gear", visible, onClick };

  it("uses v14's field names on v14 and later", () => {
    assert.deepEqual(contextMenuEntry(entry, 14), { label: "KEY", icon: '<i class="fa-solid fa-gear"></i>', visible, onClick });
  });

  it("uses v13's field names on v13", () => {
    assert.deepEqual(contextMenuEntry(entry, 13), { name: "KEY", icon: '<i class="fa-solid fa-gear"></i>', condition: visible, callback: onClick });
  });
});
