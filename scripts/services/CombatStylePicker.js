import { COMBAT_STYLE_FLAG, I18N_ROOT, MODULE_ID, SETTINGS, VIEWS } from "../constants/module-constants.js";
import { NO_STYLE } from "../helpers/combat-styles.js";
import { getSetting, savedStyles } from "../hooks/register-settings.js";
import StyleCombobox from "../applications/StyleCombobox.js";

const { DialogV2 } = foundry.applications.api;
const t = (key) => game.i18n.localize(`${I18N_ROOT}.${key}`);

/**
 * RF-108: asks the GM which saved style a combat draws with, in a field that
 * suggests styles as you type — when the combat starts (if the table asks for
 * it) or at any time from the tracker's menu, the token controls or the
 * editor (RF-110). The answer is a flag on the combat, so every client draws
 * it at once; closing the question changes nothing.
 */
export default class CombatStylePicker {
  /** For the `combatStart` hook, which only runs on the client that started the combat. */
  static async onCombatStart(combat) {
    if (!game.user.isGM || !getSetting(SETTINGS.combatStylePrompt) || !savedStyles().length) return;
    await CombatStylePicker.choose(combat);
  }

  /** RF-110: the GM picks the style of `combat` (the current one by default), its present style chosen. */
  static async choose(combat = game.combat) {
    if (!game.user.isGM) return;
    if (!combat) return ui.notifications.warn(`${I18N_ROOT}.CombatStyles.NoCombat`, { localize: true });
    const styles = savedStyles();
    if (!styles.length) return ui.notifications.info(`${I18N_ROOT}.CombatStyles.NoStyles`, { localize: true });
    const current = combat.getFlag(MODULE_ID, COMBAT_STYLE_FLAG) || getSetting(SETTINGS.combatStyleDefault) || NO_STYLE;
    const chosen = await CombatStylePicker.#ask(styles, current);
    if (chosen) await CombatStylePicker.apply(combat, chosen);
  }

  /** RF-110: gives `combat` the style `id` (NO_STYLE for the usual look), for the whole table, now. */
  static async apply(combat, id) {
    if (!game.user.isGM || !combat) return;
    await combat.setFlag(MODULE_ID, COMBAT_STYLE_FLAG, id);
    const style = savedStyles().find((candidate) => candidate.id === id);
    const name = style?.name ?? t("CombatStyles.Usual");
    ui.notifications.info(game.i18n.format(`${I18N_ROOT}.CombatStyles.Applied`, { name }));
  }

  /** The usual look first, then each style with its theme's swatch and what it shows (view · theme). */
  static #options(styles) {
    const label = (group, value) => (value ? t(`Settings.${group}.Choices.${value}`) : "");
    return [
      { id: NO_STYLE, name: t("CombatStyles.Usual"), meta: t("CombatStyles.UsualMeta") },
      ...styles.map((style) => ({
        id: style.id,
        name: style.name,
        theme: style.values.theme,
        meta: [label("view", VIEWS.includes(style.values.view) ? style.values.view : ""), label("theme", style.values.theme)]
          .filter(Boolean)
          .join(" · "),
      })),
    ];
  }

  static async #ask(styles, preselected) {
    const options = CombatStylePicker.#options(styles);
    const field = StyleCombobox.html({ name: "style", label: t("CombatStyles.Field"), options, selected: preselected });
    return DialogV2.wait({
      classes: [`${MODULE_ID}-dialog`],
      window: { title: t("CombatStyles.AskTitle"), icon: "fa-solid fa-swatchbook" },
      position: { width: 380 },
      content: `<p class="scw-dialog-text">${t("CombatStyles.AskText")}</p>${field}`,
      render: (event, dialog) => {
        const element = dialog.element ?? dialog;
        element.querySelector("[data-style-combobox]")?.setAttribute("data-empty", t("CombatStyles.NoMatch"));
        StyleCombobox.bind(element, options);
      },
      buttons: [{
        action: "use",
        label: t("CombatStyles.Use"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => button.form.elements.style.value,
      }],
      rejectClose: false,
    });
  }
}
