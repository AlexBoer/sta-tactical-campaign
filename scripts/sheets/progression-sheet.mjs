/**
 * Progression Item Sheet for STA Tactical Campaign
 * ApplicationV2-based sheet for Progression items
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const MODULE_ID = "sta-tactical-campaign";

export class ProgressionSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sta-tactical-campaign", "progression-sheet"],
    actions: {},
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
    position: {
      height: 350,
      width: 380,
    },
    window: {
      resizable: true,
    },
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "modules/sta-tactical-campaign/templates/progression-sheet.hbs",
    },
  };

  /** @override */
  get title() {
    return `${this.item.name} - ${game.i18n.localize("STA_TC.Types.Progression")}`;
  }

  /** @override */
  async _prepareContext(options) {
    const type = this.item.system.type || "custom";
    const descKey = `STA_TC.Progression.Desc.${type}`;
    const description =
      type === "custom"
        ? this.item.system.notes || ""
        : game.i18n.has(descKey)
          ? game.i18n.localize(descKey)
          : this.item.system.notes || "";
    return {
      item: this.item,
      system: this.item.system,
      description,
    };
  }
}
