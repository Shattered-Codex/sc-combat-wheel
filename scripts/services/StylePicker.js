import { I18N_ROOT, MODULE_ID, VIEWS } from "../constants/module-constants.js";
import { currentStyleId, saveLook, savedStyles } from "../hooks/register-settings.js";
import StyleCombobox from "../applications/StyleCombobox.js";

const { DialogV2 } = foundry.applications.api;
const t = (key) => game.i18n.localize(`${I18N_ROOT}.${key}`);

/**
 * RF-110: the GM's quick change between the table's saved styles, in a field
 * that suggests them as you type, from the token controls or the tracker's
 * menu. The wheel always draws the look that is selected: the chosen style
 * becomes the GM's look and the table look at once, as if loaded and saved in
 * the appearance editor. Closing the question changes nothing.
 */
export default class StylePicker {
  static async choose() {
    if (!game.user.isGM) return;
    const styles = savedStyles();
    if (!styles.length) return ui.notifications.info(`${I18N_ROOT}.CombatStyles.NoStyles`, { localize: true });
    const chosen = await StylePicker.#ask(styles, currentStyleId(styles) ?? styles[0].id);
    if (chosen) await StylePicker.apply(chosen);
  }

  static async apply(id) {
    const style = savedStyles().find((candidate) => candidate.id === id);
    if (!game.user.isGM || !style) return;
    await saveLook(style.values);
    ui.notifications.info(game.i18n.format(`${I18N_ROOT}.CombatStyles.Applied`, { name: style.name }));
  }

  /** Each style with its theme's swatch and what it shows (view · theme). */
  static #options(styles) {
    const label = (group, value) => (value ? t(`Settings.${group}.Choices.${value}`) : "");
    return styles.map((style) => ({
      id: style.id,
      name: style.name,
      theme: style.values.theme,
      meta: [label("view", VIEWS.includes(style.values.view) ? style.values.view : ""), label("theme", style.values.theme)]
        .filter(Boolean)
        .join(" · "),
    }));
  }

  static async #ask(styles, preselected) {
    const options = StylePicker.#options(styles);
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
