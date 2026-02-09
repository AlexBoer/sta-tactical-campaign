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
      // Define sheet actions here
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
    position: {
      height: "auto",
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

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Handle profile image click to open file picker
    const img = this.element.querySelector(".profile-img");
    if (img) {
      img.style.cursor = "pointer";
      img.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._onEditImage(event);
      });
    }
  }

  /**
   * Handle clicking the profile image to change it
   * @param {Event} event - The click event
   */
  _onEditImage(event) {
    new FilePicker({
      type: "image",
      current: this.actor.img,
      callback: (path) => {
        this.actor.update({ img: path });
      },
    }).browse();
  }
}
