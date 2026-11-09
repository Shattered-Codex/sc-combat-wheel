import { I18N_ROOT } from "../constants/module-constants.js";

/** Template data for one setting row, shared by the settings screen and the appearance editor. */
export default class SettingFieldView {
  /**
   * @param {object} entry  a SETTINGS_SCHEMA entry
   * @param {*} value       the value to show (the window's draft)
   */
  static of(entry, value) {
    const label = (suffix) => game.i18n.localize(`${I18N_ROOT}.Settings.${entry.key}.${suffix}`);
    return {
      key: entry.key,
      id: `scw-cfg-${entry.key}`,
      type: entry.type,
      isBoolean: entry.type === "boolean",
      isNumber: entry.type === "number",
      isChoice: entry.type === "choice",
      isColor: entry.type === "color",
      isMulti: entry.type === "multi",
      nested: Boolean(entry.nested),
      isFile: entry.type === "file",
      isText: entry.type === "text",
      name: label("Name"),
      hint: label("Hint"),
      // A text row may say what an empty value means (RF-121: the default title).
      placeholder: entry.placeholder ? label("Placeholder") : "",
      value,
      range: entry.range,
      fileType: entry.fileType,
      sound: entry.sound ?? null,
      choices: (entry.choices ?? []).map((choice) => ({
        value: choice,
        label: game.i18n.localize(
          entry.sound ? `${I18N_ROOT}.Sounds.${choice}` : `${I18N_ROOT}.Settings.${entry.key}.Choices.${choice}`,
        ),
        selected: choice === value,
        // A multi setting lists what is turned off; its rows show what stays on.
        on: Array.isArray(value) ? !value.includes(choice) : false,
      })),
    };
  }
}
