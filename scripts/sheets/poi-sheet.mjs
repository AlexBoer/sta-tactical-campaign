/**
 * Point of Interest Sheet for STA Tactical Campaign
 * ApplicationV2-based sheet for POI actors
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class PoiSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sta-tactical-campaign", "poi-sheet"],
    actions: {
      editImage: PoiSheet._onEditImage,
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
    position: {
      height: 500,
      width: 330,
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

    return {
      actor,
      system,
      enrichedDescription: await foundry.applications.ux.TextEditor.enrichHTML(
        system.description,
        {
          secrets: this.actor.isOwner,
          relativeTo: this.actor,
          async: true,
        },
      ),
    };
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
}
