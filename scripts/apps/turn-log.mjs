/**
 * Turn Log popup for STA Tactical Campaign.
 *
 * Displays the persistent notification log (system.notificationLog) stored on
 * the campaign tracker actor. Entries are grouped by campaign turn number,
 * most recent turn first.
 */

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const MODULE_ID = "sta-tactical-campaign";

export class TurnLog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "turn-log",
    classes: ["sta-tactical-campaign", "turn-log"],
    actions: {
      clearLog: TurnLog._onClearLog,
    },
    position: {
      height: 500,
      width: 540,
    },
    window: {
      resizable: true,
    },
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "modules/sta-tactical-campaign/templates/turn-log.hbs",
    },
  };

  /** @override */
  get title() {
    return `${this.actor.name} — ${game.i18n.localize("STA_TC.TurnLog.Title")}`;
  }

  /**
   * Open (or bring to front) the Turn Log for the given tracker actor.
   * @param {Actor} actor
   * @returns {TurnLog}
   */
  static open(actor) {
    const existing = Object.values(foundry.applications.instances ?? {}).find(
      (app) => app instanceof TurnLog && app.actor?.id === actor.id,
    );
    if (existing) {
      existing.bringToFront();
      return existing;
    }
    const app = new TurnLog(actor);
    app.render(true);
    return app;
  }

  /** @override */
  async _prepareContext(options) {
    const log = Array.from(this.actor.system?.notificationLog ?? []);
    const currentTurn = this.actor.system?.campaignTurnNumber ?? 0;

    // Group entries by turn, most recent first
    const byTurn = new Map();
    for (const entry of log) {
      const t = entry.turn ?? 0;
      if (!byTurn.has(t)) byTurn.set(t, []);
      byTurn.get(t).push(entry);
    }

    const turns = [...byTurn.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([turn, entries]) => ({
        turn,
        isCurrent: turn === currentTurn,
        entries: entries.map((e) => ({
          message: e.message ?? "",
          timeStr: e.ts ? new Date(e.ts).toLocaleTimeString() : "",
          severityClass: `log-${e.severity ?? "info"}`,
          severityIcon:
            e.severity === "critical"
              ? "fas fa-exclamation-circle"
              : e.severity === "warn"
                ? "fas fa-exclamation-triangle"
                : "fas fa-info-circle",
        })),
      }));

    return {
      turns,
      totalEntries: log.length,
      isGM: game.user?.isGM ?? false,
    };
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Re-render when the tracker actor's data changes
    if (!this._trackerHook) {
      this._trackerHook = Hooks.on("updateActor", (actor) => {
        if (actor.id === this.actor.id) this.render();
      });
    }
  }

  /** @override */
  async _onClose(options) {
    if (this._trackerHook) {
      Hooks.off("updateActor", this._trackerHook);
      this._trackerHook = null;
    }
    return super._onClose(options);
  }

  static async _onClearLog(event, target) {
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("STA_TC.TurnLog.Title") },
      content: `<p>${game.i18n.localize("STA_TC.TurnLog.ClearConfirm")}</p>`,
    });
    if (!proceed) return;
    await this.actor.update({ "system.notificationLog": [] });
  }
}
