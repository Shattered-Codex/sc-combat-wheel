import { I18N_ROOT } from "../constants/module-constants.js";
import { consequencesToRun } from "../helpers/consequence-kinds.js";
import { virtualFlagOf } from "../helpers/virtual-positions.js";
import ScreenBanner from "./ScreenBanner.js";
import TurnAutomation from "./TurnAutomation.js";
import TurnSideEffects from "./TurnSideEffects.js";

const escape = (text) => foundry.utils.escapeHTML(String(text ?? ""));

/**
 * Runs a virtual position's consequences (RF-68) on this client: the local
 * ones where the position is visible, the GM ones on the active GM only.
 * A failing row is reported and the rest still run.
 */
export default class ConsequenceRunner {
  static async run(config, payload, { visible }) {
    const rows = consequencesToRun(config.consequences ?? [], {
      visible,
      isGM: game.user.isGM,
      isActiveGM: TurnAutomation.isActiveGM(),
      isModuleActive: (id) => Boolean(game.modules.get(id)?.active),
    });
    for (const row of rows) {
      try {
        await ConsequenceRunner.#HANDLERS[row.kind](row.params, { ...payload, config, row });
      } catch (error) {
        console.error(`SC Combat Wheel | Consequence "${row.kind}" failed.`, error);
        if (game.user.isGM) {
          ui.notifications.warn(game.i18n.format(`${I18N_ROOT}.Notifications.ConsequenceFailed`, { name: config.name, kind: row.kind }));
        }
      }
    }
  }

  static #HANDLERS = {
    screenMessage: (params, { config }) => ScreenBanner.show({ title: params.title || config.name, text: params.text, seconds: params.seconds, img: config.img }),

    sound: (params) => TurnSideEffects.player.play("file", params.src, params.volume / 100),

    hook: (params, { combat, combatant, config }) => {
      if (params.name) Hooks.callAll(params.name, { combat, combatant, config });
    },

    chatMessage: (params, { config }) => {
      const whisper = params.audience === "gm" ? game.users.filter((user) => user.isGM).map((user) => user.id) : [];
      return ChatMessage.implementation.create({
        content: `<h3>${escape(config.name)}</h3><p>${escape(params.text)}</p>`,
        speaker: { alias: config.name },
        whisper,
      });
    },

    macro: async (params, { combat, combatant, config }) => {
      if (!params.macroUuid) return;
      const macro = await fromUuid(params.macroUuid);
      if (!macro) throw new Error(`No macro at ${params.macroUuid}`);
      await macro.execute({ combat, combatant, virtual: config });
    },

    rollTable: async (params) => {
      const table = await fromUuid(params.tableUuid);
      if (!table) throw new Error(`No roll table at ${params.tableUuid}`);
      await table.draw();
    },

    jumpScare: (params) => game.modules.get("sc-jump-scare").api.play(params.scareId),

    puzzle: (params) => {
      const api = game.modules.get("sc-puzzle-engine").api;
      const method = { open: "openPuzzle", arm: "armPuzzle", trigger: "triggerPuzzle" }[params.action];
      return api[method](params.puzzleUuid);
    },

    /** SC Resources: each write carries an operation id, so a repeated turn changes nothing twice. */
    resource: async (params, { combat, combatant, config, row }) => {
      const api = game.modules.get("sc-resources").api;
      for (const actor of await ConsequenceRunner.#resourceTargets(params, combat)) {
        const options = {
          reason: config.name,
          operationId: `scw-${combat.id}-${combat.round}-${combatant.id}-${row.id}-${actor.id}`,
        };
        const result = params.operation === "restore"
          ? await api.restore(actor, params.resourceId, options)
          : await api[params.operation](actor, params.resourceId, params.amount, options);
        if (result && result.ok === false) console.warn(`SC Combat Wheel | SC Resources refused: ${result.reason}`);
      }
    },
  };

  static async #resourceTargets(params, combat) {
    if (params.target === "actor") {
      const actor = await fromUuid(params.actorUuid);
      return actor ? [actor] : [];
    }
    const actors = combat.combatants
      .filter((c) => c.actor && !virtualFlagOf(c) && (params.target === "combatants" || c.hasPlayerOwner))
      .map((c) => c.actor);
    return [...new Set(actors)];
  }
}
