import { BAR_ITEMS, I18N_ROOT } from "../constants/module-constants.js";
import CombatControls from "../services/CombatControls.js";
import { ORIENTATIONS, isSideOrientation, normalizeOrientation, oppositeOf } from "../helpers/orientation.js";

const t = (key) => game.i18n.localize(`${I18N_ROOT}.${key}`);
const f = (key, data) => game.i18n.format(`${I18N_ROOT}.${key}`, data);

const ORIENTATION_ICONS = Object.freeze({ up: "fa-arrow-up", right: "fa-arrow-right", down: "fa-arrow-down", left: "fa-arrow-left" });

const ROLL_GROUPS = [
  { group: "all", icon: "fa-users", label: "RollMenu.All" },
  { group: "npc", icon: "fa-skull", label: "RollMenu.Npc" },
  { group: "pc", icon: "fa-user", label: "RollMenu.Pc" },
  { group: "reset", icon: "fa-rotate-left", label: "RollMenu.Reset" },
];

/** Template data for the hub and the bar, derived from a WheelModel. */
export default class WheelViewData {
  static hub(model, ui) {
    if (!model?.N) return { empty: true, label: t("Hub.Empty") };
    if (model.phased) return WheelViewData.#phaseHub(model, ui);
    const viewed = ui.viewIndex === null || ui.viewIndex === undefined ? null : model.ring[ui.viewIndex];
    if (viewed) {
      return { turn: true, peeking: true, label: t("Hub.Viewing"), name: viewed.name, hp: WheelViewData.hp(viewed.hp) };
    }
    if (model.needsRoll) {
      return {
        roll: true,
        canRoll: model.pendingOwnIds.length > 0,
        rolling: ui.rolling,
        title: t("Hub.RollInitiative"),
        info: f("Hub.RollInfo", { rolled: model.rolledCount, total: model.rollTotal ?? model.N }),
      };
    }
    if (model.activeHidden) return { waiting: true, label: t("Hub.Waiting") };
    const vm = model.current;
    let label = t(model.started ? "Hub.Acting" : "Hub.First");
    if (vm.virtual) label = t("Hub.Virtual");
    return {
      turn: true,
      label,
      name: vm.name,
      hp: WheelViewData.hp(vm.hp),
    };
  }

  /**
   * The bar (RF-10). `ui.controls` puts the tools in the bar itself ("inline",
   * each choice in a small popover) or behind "More" ("menu"); `ui.details`
   * offers the expanding details at all (RF-83); `ui.layout` "split" draws
   * the bar as two columns beside the portraits (RF-104). `ui.menu` is the open
   * popover: "more", "roll", "virtual", "direction" or null.
   */
  static bar(model, ui) {
    const orientation = normalizeOrientation(ui.orientation);
    const phased = Boolean(model?.phased);
    const endTurn = WheelViewData.#endTurn(model);
    const isGM = game.user.isGM;
    const menu = ui.menu ?? null;
    // RF-104: split in two columns beside the portraits, the bar has no room for its details.
    const split = ui.layout === "split";
    const details = !split && Boolean(ui.details);
    const expanded = details && Boolean(ui.expanded);
    // Rolling means nothing once everyone rolled; clearing only once someone did.
    const rollOptions = isGM && model ? WheelViewData.#rollOptions(model) : [];
    // Where a virtual position goes among phases is still open (D-27): none are offered there.
    const virtualTemplates = isGM && !phased ? ui.virtualTemplates ?? [] : null;
    // RF-99: the items this user turned off stay out of the bar and of its menu.
    const hidden = new Set(ui.barHidden ?? []);
    const show = Object.fromEntries(BAR_ITEMS.map((item) => [item, !hidden.has(item)]));
    const bar = {
      isGM,
      phased,
      show,
      // The rule only separates the tools that follow it.
      toolRule: ["lock", "direction", "appearance", "settings"].some((item) => show[item]) || (isGM && show.endCombat),
      locked: ui.locked,
      split,
      inline: ui.controls !== "menu",
      details,
      expanded,
      menu,
      canRoll: show.roll && rollOptions.some((option) => option.group !== "reset"),
      // The inline button opens the menu, which keeps "Clear" once everyone rolled.
      rollMenu: show.roll && rollOptions.length ? WheelViewData.#rollMenuButton(rollOptions) : null,
      // A player rolls their own from the bar too: the card views may show no hub to ask.
      canRollOwn: show.roll && !isGM && Boolean(model?.pendingOwnIds?.length),
      rolling: Boolean(ui.rolling),
      canAddVirtual: show.virtual && Boolean(virtualTemplates?.length),
      orientationIcon: ORIENTATION_ICONS[orientation],
      directionLabel: f("Bar.DirectionNow", { direction: t(`Bar.Directions.${orientation}`) }),
      lockIcon: ui.locked ? "fa-lock-open" : "fa-lock",
      lockLabel: t(ui.locked ? "Bar.Unlock" : "Bar.Lock"),
      dragLabel: t(ui.locked ? "Bar.Locked" : "Bar.Drag"),
      // The grip's dots run across whatever holds them: the side rail, or a split bar's upright column.
      gripIcon: isSideOrientation(orientation) !== split ? "fa-grip" : "fa-grip-vertical",
      // The details open away from the arc; collapsing points back at it.
      expandIcon: `fa-chevron-${expanded ? orientation : oppositeOf(orientation)}`,
      expandLabel: t(expanded ? "Bar.Collapse" : "Bar.Expand"),
      orientations: ORIENTATIONS.map((value) => ({
        value,
        icon: ORIENTATION_ICONS[value],
        label: t(`Bar.Directions.${value}`),
        active: value === orientation,
        disabled: Boolean(ui.locked),
      })),
      roundLabel: model?.started ? f("Bar.Round", { round: model.round }) : t("Bar.Setup"),
      turnLabel: model?.turnLabel ?? "",
      endTurnLabel: endTurn?.label ?? null,
      endTurnIcon: endTurn?.icon ?? "fa-forward-step",
      endTurnDisabled: Boolean(endTurn?.disabled),
      previousLabel: t(phased ? "Bar.PreviousPhase" : "Bar.PreviousTurn"),
      moreOpen: menu === "more",
      rollOpen: menu === "roll",
      virtualOpen: menu === "virtual",
      directionOpen: menu === "direction",
      rollOptions,
      virtualTemplates,
      peeking: ui.viewIndex !== null && ui.viewIndex !== undefined,
      // The overview reorders initiative, which means nothing between phases.
      canOpenGrid: Boolean(model?.N) && !phased,
      strip: phased ? WheelViewData.strip(model.phase, ui) : null,
    };
    if (expanded && model) {
      bar.character = phased ? WheelViewData.#phaseDetails(model, ui) : WheelViewData.#character(model, ui);
      bar.combatRows = WheelViewData.#combatRows(model);
    }
    return bar;
  }

  /**
   * RF-10: the one labelled turn button. The GM always ends the current turn
   * (under Venaerys, the phase); a player only while one of their combatants is
   * acting. Under Venaerys the player's button marks their combatants done, and
   * stays as a disabled "Finished" once nothing of theirs is left to act (RF-81).
   */
  static #endTurn(model) {
    if (!model?.started) return null;
    if (model.phased) {
      if (game.user.isGM) return { label: t("Bar.NextPhase") };
      if (model.canEndOwnTurn) return { label: t(model.phase?.half === "move" ? "Bar.FinishMove" : "Bar.Finish"), icon: "fa-check" };
      return model.ownFinished ? { label: t("Bar.Finished"), icon: "fa-check-double", disabled: true } : null;
    }
    if (game.user.isGM) return { label: t("Bar.EndTurn") };
    return model.canEndOwnTurn ? { label: t("Bar.EndOwnTurn") } : null;
  }

  /** The hub under Venaerys: the phase, its half, and how many of its members finished. */
  static #phaseHub(model, ui) {
    const viewing = ui.viewIndex !== null && ui.viewIndex !== undefined;
    const entry = viewing ? model.ring[ui.viewIndex] : model.current;
    if (!entry || (!viewing && model.activeHidden) || entry.waiting) return { waiting: true, label: t("Hub.Waiting") };
    let label = t("Phase.Now");
    if (viewing) label = t("Hub.Viewing");
    else if (entry.half) label = t(`Phase.Half.${entry.half}`);
    return {
      turn: true,
      peeking: viewing,
      label,
      name: entry.name,
      icon: entry.icon,
      color: entry.color,
      hp: WheelViewData.#progress(entry),
    };
  }

  /** "2 of 4 finished", as a bar like hit points'. */
  static #progress(entry) {
    if (!entry.memberCount) return null;
    return {
      width: `${Math.round((entry.finishedCount / entry.memberCount) * 100)}%`,
      critical: false,
      text: f("Phase.Progress", { done: entry.finishedCount, total: entry.memberCount }),
    };
  }

  /**
   * RF-80: everyone of the current phase, in a line next to the bar. RF-82:
   * `ui.stripImage` shows the token art instead of the wheel's portrait.
   * With `ui.canMarkDone`, each member its user owns gets a done toggle.
   */
  static strip(phase, ui) {
    if (!phase) return null;
    const useToken = ui.stripImage === "token";
    const toggle = ui.canMarkDone ? (member) => WheelViewData.#doneToggle(member, phase.half) : () => null;
    return {
      label: f("Phase.StripLabel", { phase: phase.name }),
      name: phase.name,
      icon: phase.icon,
      color: phase.color,
      members: phase.acting.map((member) => ({ ...WheelViewData.#stripMember(member, useToken), doneToggle: toggle(member) })),
    };
  }

  static #stripMember(member, useToken) {
    const status = t(`Phase.Status.${member.status}`);
    return {
      id: member.id,
      name: member.name,
      img: (useToken && member.tokenImg) || member.img,
      initials: member.initials,
      dispositionKey: member.dispositionKey,
      status: member.status,
      isDone: member.status === "done",
      isDefeated: member.status === "defeated",
      isOwner: member.isOwner,
      tooltip: `${member.name} · ${status}`,
    };
  }

  /** Venaerys lets the GM mark anyone and a player their own; the defeated have nothing left to finish. */
  static #doneToggle(member, half) {
    if (!member.isOwner || member.status === "defeated") return null;
    const pressed = member.status === "done";
    const key = half === "move" ? (pressed ? "UnmarkMoved" : "MarkMoved") : pressed ? "UnmarkDone" : "MarkDone";
    return { pressed, label: f(`Phase.${key}`, { name: member.name }) };
  }

  /** The details' first block under Venaerys: the phase being viewed (or the current one) and its members. */
  static #phaseDetails(model, ui) {
    const viewing = ui.viewIndex !== null && ui.viewIndex !== undefined;
    const index = viewing ? ui.viewIndex : model.currentIndex;
    const entry = model.ring[index];
    if (!entry || (!viewing && model.activeHidden)) return null;
    return {
      isPhase: true,
      position: f("Details.Position", { index: index + 1, total: model.N }),
      viewing,
      name: entry.name,
      subtitle: entry.half ? t(`Phase.Half.${entry.half}`) : t("Details.Phase"),
      hp: WheelViewData.#progress(entry),
      effects: entry.members.map((member) => ({ label: `${member.name} · ${t(`Phase.Status.${member.status}`)}`, img: member.img })),
    };
  }

  /** Hit points as the viewer may see them (RF-42). */
  static hp(view) {
    if (!view || view.mode === "none" || view.mode === "hidden") return null;
    const width = `${Math.round(view.pct * 100)}%`;
    let text = "";
    if (view.mode === "number") text = f("Hp.Value", { value: view.text });
    else if (view.mode === "state") text = t(`HealthState.${view.stateKey}`);
    return { width, critical: view.critical, text };
  }

  /** Only the groups that would do something: nobody left to roll hides the rolls. */
  static #rollMenuButton(options) {
    const onlyReset = options.every((option) => option.group === "reset");
    const label = t(onlyReset ? "RollMenu.Reset" : "RollMenu.Title");
    return { label, icon: onlyReset ? "fa-rotate-left" : "fa-dice-d20" };
  }

  static #rollOptions(model) {
    const counts = CombatControls.rollCounts(model);
    return ROLL_GROUPS.filter(({ group }) => counts[group] > 0).map(({ group, icon, label }) => ({
      group,
      icon,
      label: t(label),
      count: counts[group],
    }));
  }

  /**
   * RF-11: the character block follows the wheel — the one being viewed, or the
   * one acting — and steps through the ring in combat order.
   */
  static #character(model, ui) {
    const viewing = ui.viewIndex !== null && ui.viewIndex !== undefined;
    const index = viewing ? ui.viewIndex : model.currentIndex;
    const vm = model.ring[index];
    if (!vm || (!viewing && model.activeHidden)) return null;
    return {
      position: f("Details.Position", { index: index + 1, total: model.N }),
      viewing,
      name: vm.name,
      subtitle: [t(`Disposition.${vm.dispositionKey}`), ...vm.players].join(" · "),
      initiative: vm.initiative ?? "—",
      hp: WheelViewData.hp(vm.hp),
      effects: vm.effects.map((effect) => ({
        ...effect,
        label: effect.rounds === null ? effect.name : f("Details.EffectRounds", { name: effect.name, rounds: effect.rounds }),
      })),
    };
  }

  /** SPEC §5.3. */
  static #combatRows(model) {
    const { stats } = model;
    const sides = Object.entries(stats.bySide)
      .filter(([, count]) => count > 0)
      .map(([side, count]) => f(`Sides.${side}`, { count }));
    const rows = [
      { label: t("Details.Participants"), value: [stats.total, ...sides].join(" · ") },
      { label: t("Details.Standing"), value: f("Details.OfTotal", { count: stats.standing, total: stats.total }) },
    ];
    if (stats.hpBySide) {
      for (const [side, hp] of Object.entries(stats.hpBySide)) {
        rows.push({ label: f("Details.SideHp", { side: t(`Sides.${side}Label`) }), value: `${hp.value}/${hp.max}` });
      }
    }
    rows.push({ label: t("Details.Elapsed"), value: WheelViewData.#clock(stats.elapsedSeconds) });
    if (model.nextUp) {
      const players = model.nextUp.players.length ? ` (${model.nextUp.players.join(", ")})` : "";
      rows.push({ label: t("Details.NextUp"), value: `${model.nextUp.name}${players}` });
    }
    rows.push({
      label: t("Details.Expiring"),
      value: stats.expiring.length ? stats.expiring.map((e) => `${e.name} (${e.combatant})`).join(", ") : "—",
    });
    return rows;
  }

  static #clock(seconds) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }
}
