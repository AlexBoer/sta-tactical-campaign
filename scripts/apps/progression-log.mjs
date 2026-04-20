/**
 * Progression Log popup for STA Tactical Campaign.
 * Lists all Progression items embedded in the campaign tracker actor,
 * with inline save-toggle, open-sheet, delete, and activate controls.
 */

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const MODULE_ID = "sta-tactical-campaign";
const PROGRESSION_TYPE = `${MODULE_ID}.progression`;

export class ProgressionLog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "progression-log",
    classes: ["sta-tactical-campaign", "progression-log"],
    actions: {
      createEntry: ProgressionLog._onCreateEntry,
      deleteEntry: ProgressionLog._onDeleteEntry,
      openEntry: ProgressionLog._onOpenEntry,
      toggleSaved: ProgressionLog._onToggleSaved,
      activateEntry: ProgressionLog._onActivateEntry,
    },
    position: {
      height: 420,
      width: 420,
    },
    window: {
      resizable: true,
    },
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "modules/sta-tactical-campaign/templates/progression-log.hbs",
    },
  };

  /** @override */
  get title() {
    return `${this.actor.name} — ${game.i18n.localize("STA_TC.Progression.Log")}`;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Register item hooks once so the log re-renders when items change externally
    if (!this._progressionHooks) {
      const handler = (item) => {
        if (
          item.parent?.id === this.actor.id &&
          item.type === PROGRESSION_TYPE
        ) {
          this.render();
        }
      };
      this._progressionHooks = [
        ["updateItem", Hooks.on("updateItem", handler)],
        ["createItem", Hooks.on("createItem", handler)],
        ["deleteItem", Hooks.on("deleteItem", handler)],
      ];
    }
  }

  /** @override */
  async _onClose(options) {
    for (const [name, id] of this._progressionHooks ?? []) {
      Hooks.off(name, id);
    }
    this._progressionHooks = null;
    return super._onClose(options);
  }

  /** @override */
  async _prepareContext(options) {
    const entries = this.actor.items
      .filter((i) => i.type === PROGRESSION_TYPE)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => {
        const type = i.system.type || "custom";
        const descKey = `STA_TC.Progression.Desc.${type}`;
        const description =
          type === "custom"
            ? i.system.notes || ""
            : game.i18n.has(descKey)
              ? game.i18n.localize(descKey)
              : i.system.notes || "";
        return {
          id: i.id,
          name: i.name,
          saved: i.system.saved,
          type,
          notes: i.system.notes,
          description,
        };
      });
    return { entries };
  }

  /**
   * Create a new blank Progression item on the actor.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async _onCreateEntry(event, target) {
    await Item.create(
      {
        name: game.i18n.localize("STA_TC.Progression.NewEntry"),
        type: PROGRESSION_TYPE,
      },
      { parent: this.actor },
    );
    this.render();
  }

  /**
   * Delete a Progression item from the actor.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async _onDeleteEntry(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    await item.delete();
    this.render();
  }

  /**
   * Open the Progression item's own sheet for full editing.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async _onOpenEntry(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) item.sheet.render(true);
  }

  /**
   * Toggle the `saved` boolean on a Progression item.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async _onToggleSaved(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    await item.update({ "system.saved": !item.system.saved });
    this.render();
  }

  /**
   * Activate a saved progression award.  Dispatches to a type-specific helper,
   * then marks the item as unsaved (so the Activate button disappears) and
   * prompts whether to delete the entry.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async _onActivateEntry(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const type = item.system.type || "custom";
    const tracker = this.actor;
    let handled = false;

    // ---- Import the power dialog lazily to avoid circular deps ----
    const { ProgressionPowerDialog } =
      await import("./progression-power-dialog.mjs");

    switch (type) {
      case "flexibleDeployments": {
        if (!tracker.system.turnPhase) {
          ui.notifications.warn(
            game.i18n.localize("STA_TC.Wizard.StartTurnFirst"),
          );
          return;
        }
        await tracker.update({ "system.turnFlexibleDeployments": true });
        ui.notifications.info(
          game.i18n.localize("STA_TC.Progression.FlexibleDeploymentsActive"),
        );
        handled = true;
        break;
      }
      case "damageControl": {
        handled = await ProgressionPowerDialog.promptRemoveLoss(
          tracker,
          "ship",
        );
        break;
      }
      case "miraculousEscape": {
        handled = await ProgressionPowerDialog.promptRemoveLoss(
          tracker,
          "character",
        );
        break;
      }
      default: {
        // Chat reminder for manual awards (favourOwed, allyGained, etc.)
        await ChatMessage.create({
          content: `<div class="progression-result-card">
            <h3><i class="fas fa-star"></i> ${game.i18n.localize("STA_TC.Progression.ChatResult")}: ${item.name}</h3>
            <p>${game.i18n.localize(`STA_TC.Progression.Desc.${type}`)}</p>
          </div>`,
          speaker: { alias: this.actor.name },
        });
        handled = true;
        break;
      }
    }

    if (!handled) return;

    // Mark as no-longer-saved so the activate button disappears, and prompt to delete
    await item.update({ "system.saved": false });
    const del = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize(`STA_TC.Progression.Type.${type}`),
      },
      content: `<p>${game.i18n.localize("STA_TC.Progression.Delete")} — ${item.name}?</p>`,
      yes: { label: game.i18n.localize("STA_TC.Progression.Delete") },
      no: { label: game.i18n.localize("STA_TC.Cancel") },
      rejectClose: false,
    });
    if (del) await item.delete();
    this.render();
  }

  /**
   * Factory method: open (or bring to front) the log for a given actor.
   * @param {Actor} actor  The campaign tracker actor
   * @returns {ProgressionLog}
   */
  static open(actor) {
    const log = new ProgressionLog(actor);
    log.render(true);
    return log;
  }
}
