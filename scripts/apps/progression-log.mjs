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
    dragDrop: [{ dragSelector: null, dropSelector: ".progression-log-body" }],
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
    // Wire up drop target
    this._dragDrop?.bind(this.element);
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
        return {
          id: i.id,
          name: i.name,
          saved: i.system.saved,
          description: i.system.effect || "",
        };
      });
    return { entries };
  }

  /**
   * Accept a dropped Progression item (from a chat link or compendium)
   * and create an embedded copy on the tracker, marked as saved.
   */
  async _onDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (data.type !== "Item" || !data.uuid) return;
    const item = await fromUuid(data.uuid);
    if (!item || item.type !== PROGRESSION_TYPE) return;
    // Don't re-import an item that already lives on this actor
    if (item.parent?.id === this.actor.id) {
      ui.notifications.info(
        game.i18n.localize("STA_TC.Progression.AlreadyInLog"),
      );
      return;
    }
    const itemData = item.toObject();
    delete itemData._id;
    itemData.system = itemData.system || {};
    itemData.system.saved = true;
    await this.actor.createEmbeddedDocuments("Item", [itemData]);
    ui.notifications.info(
      game.i18n.format("STA_TC.Progression.SavedToLog", { name: item.name }),
    );
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
   * Activate a saved progression award.
   * Posts the item's effect text to chat as a reminder, then prompts
   * whether to delete the entry. No automation is applied.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async _onActivateEntry(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const safeName = foundry.utils.escapeHTML(item.name);
    const effect = item.system?.effect || "";
    const img = item.img || "";
    const uuid = item.uuid || "";
    const imgHtml = img
      ? `<img src="${img}" alt="" style="width:44px;height:44px;object-fit:cover;border:none;border-radius:4px;flex:0 0 auto;" />`
      : "";
    const effectHtml = effect
      ? `<div style="margin-top:6px;line-height:1.4;">${effect}</div>`
      : "";
    const linkHtml = uuid
      ? `<div style="margin-top:8px;font-size:0.9em;opacity:0.9;">@UUID[${uuid}]{${safeName}}</div>`
      : "";
    await ChatMessage.create({
      content: `<div style="border-left:4px solid #3498db;background:rgba(0,0,0,0.25);border-radius:6px;padding:10px;">
        <div style="font-weight:bold;color:#3498db;text-transform:uppercase;font-size:0.8em;letter-spacing:0.5px;margin-bottom:6px;">${game.i18n.localize("STA_TC.Progression.ActivateTitle").replace("{name}", safeName)}</div>
        <div style="display:flex;gap:8px;align-items:flex-start;">
          ${imgHtml}
          <div style="flex:1;"><div style="font-weight:bold;font-size:1.05em;">${safeName}</div>${effectHtml}${linkHtml}</div>
        </div>
      </div>`,
      speaker: { alias: this.actor.name },
      whisper: [game.user.id],
    });

    await item.update({ "system.saved": false });
    const del = await foundry.applications.api.DialogV2.confirm({
      window: { title: safeName },
      content: `<p>${game.i18n.format("STA_TC.Progression.DeleteConfirm", { name: safeName })}</p>`,
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
