/**
 * Asset Sheet for STA Tactical Campaign
 * ApplicationV2-based sheet for Asset actors
 */

import { AssetEffectEditor } from "../apps/asset-effect-editor.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const MODULE_ID = "sta-tactical-campaign";

export class AssetSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sta-tactical-campaign", "asset-sheet"],
    actions: {
      performTest: AssetSheet._onPerformTest,
      editImage: AssetSheet._onEditImage,
      rollForLoss: AssetSheet._onRollForLoss,
      undoLossResult: AssetSheet._onUndoLossResult,
      addTimedEffect: AssetSheet._onAddTimedEffect,
      editEffect: AssetSheet._onEditEffect,
      deleteEffect: AssetSheet._onDeleteEffect,
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
    position: {
      height: 680,
      width: 640,
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

    // Split powers into two columns for the 2-col layout
    const powersCol1 = powers.filter((p) =>
      ["medical", "military", "personal"].includes(p.key),
    );
    const powersCol2 = powers.filter((p) =>
      ["science", "social"].includes(p.key),
    );

    // Build active effects list (all AEs, including unavailable)
    const tracker = game.actors.find(
      (a) => a.type === `${MODULE_ID}.campaignTracker`,
    );
    const currentTurn = tracker?.system?.campaignTurnNumber ?? 0;
    const effects = actor.effects.map((e) => {
      const expiryTurn = e.flags?.[MODULE_ID]?.expireAfterTurn ?? null;
      return {
        id: e.id,
        name: e.name,
        img: e.img || "icons/svg/aura.svg",
        expiryTurn,
        turnsLeft:
          expiryTurn != null ? Math.max(0, expiryTurn - currentTurn) : null,
        isPermanent: expiryTurn == null,
        isUnavailable: !!e.flags?.[MODULE_ID]?.unavailable, // flag still marks the campaign-turn expiry AE specifically
        changesSummary: AssetSheet._buildChangesSummary(e.changes ?? []),
      };
    });

    return {
      actor,
      system,
      powers,
      powersCol1,
      powersCol2,
      hasPrimaryPower,
      effects,
      hasLossEffect: actor.effects.some((e) => e.flags?.[MODULE_ID]?.lost),
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
   * Handle the Roll for Loss button click.
   * Rolls 1d20 against hardcoded character/ship loss tables and applies the outcome.
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The button element
   */
  static async _onRollForLoss(event, target) {
    const actor = this.actor;
    const assetType = actor.system.assetType;

    // Roll 1d20
    const roll = await new Roll("1d20").evaluate();
    const rollValue = roll.total;

    // Determine outcome
    let resultTitle;
    let resultDesc;
    let markLost = false;
    let markUnavailable = false;

    if (assetType === "ship") {
      if (rollValue === 1) {
        resultTitle = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipLostAllHands",
        );
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipLostAllHandsDesc",
        );
        markLost = true;
      } else if (rollValue <= 4) {
        resultTitle = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipBeyondRecovery",
        );
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipBeyondRecoveryDesc",
        );
        markLost = true;
      } else if (rollValue <= 12) {
        resultTitle = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipDamaged",
        );
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipDamagedDesc",
        );
        markUnavailable = true;
      } else {
        resultTitle = game.i18n.localize("STA_TC.Wizard.LossOutcome.ShipMinor");
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipMinorDesc",
        );
      }
    } else {
      if (rollValue <= 2) {
        resultTitle = game.i18n.localize("STA_TC.Wizard.LossOutcome.CharMIA");
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.CharMIADesc",
        );
        markLost = true;
      } else if (rollValue <= 10) {
        resultTitle = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.CharInjured",
        );
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.CharInjuredDesc",
        );
        markUnavailable = true;
      } else {
        resultTitle = game.i18n.localize("STA_TC.Wizard.LossOutcome.CharNone");
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.CharNoneDesc",
        );
      }
    }

    // Apply outcomes
    if (markLost) {
      // Create a permanent Lost AE (deleting it "rescues" the asset)
      const existingLost = actor.effects.find(
        (e) => e.flags?.[MODULE_ID]?.lost,
      );
      if (existingLost) await existingLost.delete();
      await actor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: resultTitle,
          img: "icons/svg/skull.svg",
          disabled: false,
          statuses: ["sta-tc.lost"],
          changes: [
            {
              key: "system.lost",
              mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE,
              value: "1",
              priority: 20,
            },
          ],
          flags: { [MODULE_ID]: { lost: true } },
        },
      ]);
    }
    if (markUnavailable) {
      const tracker = game.actors.find(
        (a) => a.type === `${MODULE_ID}.campaignTracker`,
      );
      const currentTurn = tracker?.system?.campaignTurnNumber ?? 0;
      const expireAfterTurn = currentTurn + 1;
      const existing = actor.effects.find(
        (e) => e.flags?.[MODULE_ID]?.unavailable,
      );
      if (existing) await existing.delete();
      await actor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: resultTitle,
          img: "icons/svg/sleep.svg",
          disabled: false,
          statuses: ["sta-tc.unavailable"],
          changes: [
            {
              key: "system.unavailable",
              mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE,
              value: "1",
              priority: 20,
            },
          ],
          flags: { [MODULE_ID]: { unavailable: true, expireAfterTurn } },
        },
      ]);
    }

    // For "lost with all hands" ship result, remind the GM about assigned characters
    const allHandsNote =
      markLost && assetType === "ship" && rollValue === 1
        ? `<p style="font-size:0.85em;color:#ffaaa0;margin-top:6px;"><i class="fas fa-exclamation-triangle"></i> Any Character assets assigned to this ship's mission should also be marked Lost.</p>`
        : "";

    await ChatMessage.create({
      content: `<div style="background:#333;border-radius:8px;padding:10px;color:#eee;border-left:4px solid #e74c3c;">
        <h3 style="margin:0 0 6px;color:#e74c3c;">&#x1F480; ${game.i18n.localize("STA_TC.RollForLoss")} \u2014 ${rollValue}/20</h3>
        <p><strong>${actor.name}:</strong> <em>${resultTitle}</em></p>
        <p style="font-size:0.9em;opacity:0.8;margin-top:4px;">${resultDesc}</p>${allHandsNote}
      </div>`,
      speaker: { alias: actor.name },
    });
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

  static async _onAddTimedEffect(event, target) {
    AssetEffectEditor.open(this.actor);
  }

  static async _onEditEffect(event, target) {
    const effectId = target.dataset.effectId;
    if (!effectId) return;
    const effect = this.actor.effects.get(effectId);
    if (!effect) return;
    AssetEffectEditor.open(this.actor, effect);
  }

  static async _onDeleteEffect(event, target) {
    const effectId = target.dataset.effectId;
    if (!effectId) return;
    await this.actor.effects.get(effectId)?.delete();
  }

  /**
   * Remove all Lost Active Effects from this asset ("Undo Loss" button).
   * Intended for use with the Miraculous Escape progression award or manual GM correction.
   */
  static async _onUndoLossResult(event, target) {
    const actor = this.actor;
    const lostEffects = actor.effects.filter((e) => e.flags?.[MODULE_ID]?.lost);
    if (!lostEffects.length) {
      ui.notifications.info("No loss effect found on this asset.");
      return;
    }
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("STA_TC.UndoLossResult") },
      content: `<p>${game.i18n.localize("STA_TC.UndoLossResult")}: <strong>${actor.name}</strong>?</p>`,
      yes: { label: game.i18n.localize("STA_TC.Converter.Confirm") },
      no: { label: game.i18n.localize("STA_TC.Cancel") },
    });
    if (!confirmed) return;
    for (const e of lostEffects) await e.delete();
  }

  /**
   * Build a human-readable summary array from a Foundry AE changes array.
   * @param {object[]} changes
   * @returns {string[]}
   */
  static _buildChangesSummary(changes) {
    const summary = [];
    const POWER_KEYS = ["medical", "military", "personal", "science", "social"];

    for (const change of changes) {
      const { key, value } = change;
      const num = Number(value);
      const sign = num >= 0 ? `+${num}` : `${num}`;

      if (key === "system.lost") {
        summary.push(game.i18n.localize("STA_TC.Status.Lost"));
      } else if (key === "system.unavailable") {
        summary.push(game.i18n.localize("STA_TC.Status.Unavailable"));
      } else if (key === "system.primaryPower") {
        const label = game.i18n.localize(
          `STA_TC.Powers.${value.charAt(0).toUpperCase() + value.slice(1)}`,
        );
        summary.push(
          game.i18n.format("STA_TC.EffectEditor.PrimaryArrow", {
            power: label,
          }),
        );
      } else if (key === "system.assetType") {
        const label = game.i18n.localize(
          `STA_TC.AssetTypes.${value.charAt(0).toUpperCase() + value.slice(1)}`,
        );
        summary.push(
          game.i18n.format("STA_TC.EffectEditor.TypeArrow", { type: label }),
        );
      } else {
        for (const power of POWER_KEYS) {
          if (key === `system.powers.${power}.value`) {
            const label = game.i18n.localize(
              `STA_TC.Powers.${power.charAt(0).toUpperCase() + power.slice(1)}`,
            );
            summary.push(`${label} ${sign}`);
            break;
          }
          if (key === `system.powers.${power}.focus`) {
            const label = game.i18n.localize(
              `STA_TC.Powers.${power.charAt(0).toUpperCase() + power.slice(1)}`,
            );
            summary.push(
              game.i18n.format("STA_TC.EffectEditor.FocusSummary", {
                power: label,
                delta: sign,
              }),
            );
            break;
          }
        }
      }
    }
    return summary;
  }
}
