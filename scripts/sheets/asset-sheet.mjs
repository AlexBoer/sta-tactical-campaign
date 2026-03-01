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
      editImage: AssetSheet._onEditImage,
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
    position: {
      height: 700,
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
    const primaryPower = system.primaryPower || "";
    const hasPrimaryPower = system.assetType !== "resource";
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
      isPrimary: key === primaryPower,
    }));

    return {
      actor,
      system,
      powers,
      hasPrimaryPower,
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
    const dialogContent = await foundry.applications.handlebars.renderTemplate(
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

    // Build the task data object for the new STA v2.5.0 rollTask API
    // Using rolltype 'custom' allows us to set our own flavor text
    const taskData = {
      speakerName: actor.name,
      selectedAttributeValue: attributeValue, // power - focus
      selectedDisciplineValue: focusValue,
      rolltype: "custom",
      flavor: `${powerLabel} ${game.i18n.localize("STA_TC.Powers.Power")}`,
      dicePool: result.dicePool,
      usingFocus: result.usingFocus,
      usingDedicatedFocus: result.usingDedicatedFocus,
      usingDetermination: result.usingDetermination,
      complicationRange: result.complicationRange,
    };

    // Create a new STARoll instance and perform the roll
    const roller = new STARoll();
    await roller.rollTask(taskData);
  }
}
