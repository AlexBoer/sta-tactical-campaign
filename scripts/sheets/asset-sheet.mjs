/**
 * Asset Sheet for STA Tactical Campaign
 * ApplicationV2-based sheet for Asset actors
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class AssetSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sta-tactical-campaign", "asset-sheet"],
    actions: {
      performTest: AssetSheet._onPerformTest,
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
      minimizable: true,
    },
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "modules/sta-tactical-campaign/templates/asset-sheet.hbs",
    },
  };

  /** @override */
  get title() {
    return `${this.actor.name} - ${game.i18n.localize("STA_TC.Types.Asset")}`;
  }

  /** @override */
  async _prepareContext(options) {
    const actor = this.actor;
    const system = actor.system;

    // Prepare powers array for template iteration
    const powerCategories = [
      "medical",
      "military",
      "personal",
      "science",
      "social",
    ];
    const selectedPower = system.selectedPower || "medical";
    const powers = powerCategories.map((key) => ({
      key,
      label: game.i18n.localize(
        `STA_TC.Powers.${key.charAt(0).toUpperCase() + key.slice(1)}`,
      ),
      value: system.powers[key].value,
      focus: system.powers[key].focus,
      valuePath: `system.powers.${key}.value`,
      focusPath: `system.powers.${key}.focus`,
      isSelected: key === selectedPower,
    }));

    return {
      actor,
      system,
      powers,
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

  /**
   * Handle the Perform Test button click
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The button element
   */
  static async _onPerformTest(event, target) {
    event.preventDefault();
    const sheet = this;
    const actor = sheet.actor;
    const system = actor.system;

    // Get the selected power from the stored system data
    const powerType = system.selectedPower || "medical";
    const power = system.powers[powerType];

    if (!power) {
      ui.notifications.warn(`Power type "${powerType}" not found.`);
      return;
    }

    const powerValue = power.value || 0;
    const focusValue = power.focus || 0;

    // Calculate attribute value (power - focus)
    const attributeValue = Math.max(0, powerValue - focusValue);

    // Get the localized power name for display
    const powerLabel = game.i18n.localize(
      `STA_TC.Powers.${powerType.charAt(0).toUpperCase() + powerType.slice(1)}`,
    );

    // Load and render the dialog template
    const dialogContent = await renderTemplate(
      "modules/sta-tactical-campaign/templates/dice-pool-dialog.hbs",
      {},
    );

    // Show the dice pool configuration dialog using DialogV2
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize("STA_TC.DicePool"),
        icon: "fa-solid fa-dice",
      },
      position: {
        width: 330,
      },
      classes: ["sta", "dialogue"],
      content: dialogContent,
      buttons: [
        {
          action: "roll",
          icon: "fa-solid fa-dice",
          label: game.i18n.localize("STA_TC.RollDice"),
          default: true,
          callback: (event, button, dialog) => {
            // dialog is the DialogV2 application instance, use .element to get HTMLElement
            const form = dialog.element.querySelector("#dice-pool-form");
            return {
              usingFocus: form.querySelector("#usingFocus").checked,
              usingDedicatedFocus: form.querySelector("#usingDedicatedFocus")
                .checked,
              usingDetermination: form.querySelector("#usingDetermination")
                .checked,
              complicationRange:
                parseInt(form.querySelector("#complicationRange").value) || 1,
              dicePool:
                parseInt(form.querySelector("#dicePoolSlider").value) || 2,
            };
          },
        },
        {
          action: "cancel",
          icon: "fa-solid fa-xmark",
          label: game.i18n.localize("STA_TC.Cancel"),
        },
      ],
      rejectClose: false,
    });

    // If dialog was cancelled or closed, do nothing
    if (!result || result === "cancel") return;

    // Build the speaker object
    const speaker = {
      id: actor.id,
      type: "sidebar",
      name: actor.name,
    };

    // Create a new STARoll instance and perform the test
    const roller = new STARoll();
    await roller.performAttributeTest(
      result.dicePool,
      result.usingFocus,
      result.usingDedicatedFocus,
      result.usingDetermination,
      powerLabel, // selectedAttribute (display name)
      attributeValue, // selectedAttributeValue (power - focus)
      game.i18n.localize("STA_TC.Powers.Power"), // selectedDiscipline ("Power")
      focusValue, // selectedDisciplineValue (focus)
      result.complicationRange,
      speaker,
    );
  }
}
