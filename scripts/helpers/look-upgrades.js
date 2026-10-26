/** RF-115: themes folded into their nearest neighbour. */
const MERGED_THEMES = Object.freeze({
  custom: "graphite",
  slate: "graphite",
  desert: "ember",
  sepia: "steampunk",
  linen: "paper",
  ink: "gothic",
});

/**
 * Values a look may still hold from options that were folded into others
 * (RF-111, RF-115), turned into what draws the same today. Foundry hands back a stored
 * value as it was, so every look is read through this: the user's own, the
 * table look and the saved combat styles.
 */
export function upgradeLook(values) {
  if (!values || typeof values !== "object") return values;
  const look = { ...values };
  // The "Squares" wheel layout became any layout with square portraits.
  if (look.layoutPreset === "squares") {
    look.layoutPreset = "compact";
    look.portraitShape = "square";
  }
  // The tools column beside the bar became the "More" menu (the split bar stands in columns of its own).
  if (look.barControls === "column") look.barControls = "menu";
  // The arc bar was tried and withdrawn: such a look gets the straight bar.
  if (look.barLayout === "arc") look.barLayout = "bar";
  if (MERGED_THEMES[look.theme]) look.theme = MERGED_THEMES[look.theme];
  return look;
}
