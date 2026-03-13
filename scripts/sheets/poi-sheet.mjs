/**
 * Point of Interest Sheet for STA Tactical Campaign
 * ApplicationV2-based sheet for POI actors
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

import { EventEffectResolver } from "../apps/event-effect-resolver.mjs";

const MODULE_ID = "sta-tactical-campaign";

export class PoiSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sta-tactical-campaign", "poi-sheet"],
    actions: {
      editImage: PoiSheet._onEditImage,
      openEvent: PoiSheet._onOpenEvent,
      deleteEvent: PoiSheet._onDeleteEvent,
      toggleEffect: PoiSheet._onToggleEffect,
      rollRandomEvent: PoiSheet._onRollRandomEvent,
      addCustomEvent: PoiSheet._onAddCustomEvent,
    },
    dragDrop: [{ dragSelector: null, dropSelector: null }],
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
    position: {
      height: 520,
      width: 640,
    },
    window: {
      resizable: true,
    },
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "modules/sta-tactical-campaign/templates/poi-sheet.hbs",
    },
  };

  /** @override */
  get title() {
    return `${this.actor.name} - ${game.i18n.localize("STA_TC.Types.PointOfInterest")}`;
  }

  /** @override */
  async _prepareContext(options) {
    const actor = this.actor;
    const system = actor.system;

    const poiTypeChoices = [
      {
        value: "tacticalThreat",
        label: game.i18n.localize("STA_TC.Poi.Types.TacticalThreat"),
        selected: system.poiType === "tacticalThreat",
      },
      {
        value: "exploration",
        label: game.i18n.localize("STA_TC.Poi.Types.Exploration"),
        selected: system.poiType === "exploration",
      },
      {
        value: "routine",
        label: game.i18n.localize("STA_TC.Poi.Types.Routine"),
        selected: system.poiType === "routine",
      },
      {
        value: "unknown",
        label: game.i18n.localize("STA_TC.Poi.Types.Unknown"),
        selected: system.poiType === "unknown",
      },
    ];

    const events = this.actor.items
      .filter((i) => i.type === `${MODULE_ID}.event`)
      .map((i) => ({ id: i.id, name: i.name, img: i.img }));

    // Run the complex-effect resolver (no assets on the PoI sheet itself)
    const { poiOverrides, descriptions, assetEffectDescriptions } =
      EventEffectResolver.resolve(this.actor);

    // Merge native AE overrides with complex overrides — both use flat system paths.
    // displayOverrides drives the .ae-modified amber indicator on each field.
    const displayOverrides = {
      ...(this.actor.overrides ?? {}),
      ...poiOverrides,
    };

    return {
      actor,
      system,
      poiTypes: poiTypeChoices,
      isTacticalThreat: system.poiType === "tacticalThreat",
      events,
      displayOverrides,
      complexDescriptions: descriptions,
      assetEffectDescriptions,
      hasEventTable: !!game.settings.get(MODULE_ID, "tableEvents"),
    };
  }

  /** @override */
  async _onDropItem(event, data) {
    const item = await fromUuid(data.uuid);
    if (!item || item.type !== `${MODULE_ID}.event`) {
      ui.notifications.warn(game.i18n.localize("STA_TC.Poi.DropEventOnly"));
      return;
    }
    const itemData = item.toObject();
    // Ensure effects transfer to the actor when the item is owned
    for (const effect of itemData.effects ?? []) {
      effect.transfer = true;
    }
    await PoiSheet._clearExistingEvents(this.actor);
    await this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  /** Open an owned Event item's sheet */
  static _onOpenEvent(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    this.actor.items.get(itemId)?.sheet.render(true);
  }

  /** Delete an owned Event item from this actor */
  static async _onDeleteEvent(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
  }

  /** Toggle the disabled flag of an applied effect on this actor */
  static async _onToggleEffect(event, target) {
    const effectId = target.closest("[data-effect-id]").dataset.effectId;
    const effect = this.actor.effects.get(effectId);
    if (effect) await effect.update({ disabled: !effect.disabled });
  }

  /**
   * Handle clicking the profile image to change it
   * @param {Event} event - The click event
   * @param {HTMLElement} target - The image element
   */
  static _onEditImage(event, target) {
    const sheet = this;
    new FilePicker({
      type: "image",
      current: sheet.actor.img,
      callback: (path) => {
        sheet.actor.update({ img: path });
      },
    }).browse();
  }

  // ---------------------------------------------------------------------------
  // Event helpers
  // ---------------------------------------------------------------------------

  /** Delete all embedded Event items from an actor (enforces the 1-event limit). */
  static async _clearExistingEvents(actor) {
    const ids = actor.items
      .filter((i) => i.type === `${MODULE_ID}.event`)
      .map((i) => i.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
  }

  /**
   * Roll on the Events table and embed the result as an Event item on this PoI.
   * If the table result references an Event item document, copy it directly;
   * otherwise build a minimal event from the result text.
   */
  static async _onRollRandomEvent(event, target) {
    const tableUuid = game.settings.get(MODULE_ID, "tableEvents");
    if (!tableUuid) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Wizard.EventTableNotConfigured"),
      );
      return;
    }
    const table = await fromUuid(tableUuid);
    if (!table) {
      ui.notifications.error(
        game.i18n.format("STA_TC.Poi.Generator.TableNotFound", {
          name: "Events",
        }),
      );
      return;
    }

    const roll = await table.roll();
    const result = roll.results?.[0];

    // Prefer a directly-referenced Event item document in the table result.
    let itemData = null;
    const docUuid = result?.documentUuid?.trim();
    if (docUuid) {
      const doc = await fromUuid(docUuid);
      if (doc?.documentName === "Item" && doc.type === `${MODULE_ID}.event`) {
        itemData = doc.toObject();
        for (const effect of itemData.effects ?? []) effect.transfer = true;
      }
    }

    // Fallback: build a minimal event from the roll result text.
    if (!itemData) {
      const resultText = result?.text || result?.name || "";
      const resultName =
        result?.name && result.name !== resultText
          ? result.name
          : resultText
              .split(/[.:!?]/)[0]
              .trim()
              .slice(0, 60) || game.i18n.localize("STA_TC.EventName");
      itemData = {
        name: resultName,
        type: `${MODULE_ID}.event`,
        system: { description: resultText },
      };
    }

    await PoiSheet._clearExistingEvents(this.actor);
    const [created] = await this.actor.createEmbeddedDocuments("Item", [
      itemData,
    ]);
    created?.sheet.render(true);
  }

  /** Create a blank Event item on this PoI and open its sheet for editing. */
  static async _onAddCustomEvent(event, target) {
    await PoiSheet._clearExistingEvents(this.actor);
    const [created] = await this.actor.createEmbeddedDocuments("Item", [
      {
        name: game.i18n.localize("STA_TC.EventName"),
        type: `${MODULE_ID}.event`,
      },
    ]);
    created?.sheet.render(true);
  }
}
