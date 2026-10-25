import { SETTINGS } from "../constants/module-constants.js";
import { activeTheme, appearanceValues } from "../hooks/register-settings.js";
import WheelAppearance from "../applications/WheelAppearance.js";

const FADE_MS = 400;

/**
 * An on-screen message for a virtual position (RF-68, "screenMessage"): a
 * title and a line of text, in the wheel's theme and the user's colors. Its
 * shape, place, size and picture follow the look (RF-106). Each client draws
 * its own; nothing goes over the network.
 */
export default class ScreenBanner {
  static #host = null;

  /**
   * @param {object} message
   * @param {string} message.title
   * @param {string} [message.text]
   * @param {number} [message.seconds]
   * @param {string} [message.img]   the virtual position's picture
   * @param {object} [look]          appearance values to draw with (the editor passes its draft)
   * @param {object} [options]
   * @param {boolean} [options.preview]  over a darkened screen and above every window (the editor's test),
   *                                     instead of under the windows as in play; a click ends it early
   */
  static show({ title, text, seconds = 6, img = "" }, look = appearanceValues(), { preview = false } = {}) {
    const host = preview ? ScreenBanner.#previewHost(seconds) : ScreenBanner.#prepareHost();
    ScreenBanner.#applyLook(host, look);
    const banner = document.createElement("div");
    banner.className = "scw-banner";
    banner.setAttribute("role", "status");
    const heading = document.createElement("span");
    heading.className = "scw-banner-title";
    if (img && look[SETTINGS.bannerImage] !== false) {
      const picture = document.createElement("img");
      picture.className = "scw-banner-img";
      picture.src = img;
      picture.alt = "";
      heading.append(picture);
    }
    heading.append(title);
    banner.append(heading);
    if (text) {
      const body = document.createElement("p");
      body.className = "scw-banner-text";
      body.textContent = text;
      banner.append(body);
    }
    host.append(banner);
    requestAnimationFrame(() => banner.classList.add("is-shown"));
    setTimeout(() => {
      banner.classList.remove("is-shown");
      setTimeout(() => banner.remove(), FADE_MS);
    }, seconds * 1000);
  }

  static #prepareHost() {
    if (!ScreenBanner.#host?.isConnected) {
      ScreenBanner.#host = document.createElement("div");
      ScreenBanner.#host.className = "sc-combat-wheel scw-banner-host";
      document.body.append(ScreenBanner.#host);
    }
    return ScreenBanner.#host;
  }

  /** A host of its own inside a backdrop over everything, gone once the message fades (or on a click). */
  static #previewHost(seconds) {
    const backdrop = document.createElement("div");
    backdrop.className = "scw-banner-backdrop";
    const host = document.createElement("div");
    host.className = "sc-combat-wheel scw-banner-host";
    backdrop.append(host);
    document.body.append(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("is-shown"));
    const close = () => {
      backdrop.classList.remove("is-shown");
      setTimeout(() => backdrop.remove(), FADE_MS);
    };
    backdrop.addEventListener("click", close, { once: true });
    setTimeout(close, seconds * 1000 + FADE_MS);
    return host;
  }

  static #applyLook(host, look) {
    // The same theme, custom colors and style tweaks as the wheel itself.
    WheelAppearance.applyLook(host, look, { orientation: "up", theme: activeTheme(look), expanded: false });
    host.dataset.scwBannerStyle = look[SETTINGS.bannerStyle] ?? "card";
    host.dataset.scwBannerPosition = look[SETTINGS.bannerPosition] ?? "top";
    host.dataset.scwBannerSize = look[SETTINGS.bannerSize] ?? "normal";
  }
}
