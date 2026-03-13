/**
 * Event Item Sheet for STA Tactical Campaign
 * ApplicationV2-based sheet for Event items
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

import {
  buildEffectAutoName,
  showPresetPicker,
  PoiEffectEditor,
  POI_EFFECT_FIELDS,
} from "../apps/poi-effect-editor.mjs";
import {
  ComplexEffectEditor,
  COMPLEX_EFFECT_TYPES,
} from "../apps/complex-effect-editor.mjs";

const MODULE_ID = "sta-tactical-campaign";

export class EventSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sta-tactical-campaign", "event-sheet"],
    actions: {
      addEffect: EventSheet._onAddEffect,
      editEffect: EventSheet._onEditEffect,
      deleteEffect: EventSheet._onDeleteEffect,
      toggleEffect: EventSheet._onToggleEffect,
      addComplexEffect: EventSheet._onAddComplexEffect,
      editComplexEffect: EventSheet._onEditComplexEffect,
      deleteComplexEffect: EventSheet._onDeleteComplexEffect,
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
    position: {
      height: 420,
      width: 480,
    },
    window: {
      resizable: true,
    },
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "modules/sta-tactical-campaign/templates/event-sheet.hbs",
    },
  };

  /** @override */
  get title() {
    return `${this.item.name} - ${game.i18n.localize("STA_TC.Types.Event")}`;
  }

  /** @override */
  async _prepareContext(options) {
    const item = this.item;
    const system = item.system;

    const effects = item.effects.map((effect) => ({
      id: effect.id,
      name: effect.name,
      img: effect.img,
      disabled: effect.disabled,
      transfer: effect.transfer,
      changes: effect.changes,
    }));

    const typeLabels = Object.fromEntries(
      COMPLEX_EFFECT_TYPES.map((t) => [
        t.value,
        game.i18n.localize(t.labelKey),
      ]),
    );
    const complexEffects = (system.complexEffects ?? []).map((eff) => ({
      id: eff.id,
      label: eff.label || eff.type,
      typeName: typeLabels[eff.type] ?? eff.type,
    }));

    return {
      item,
      system,
      effects,
      complexEffects,
      hasAnyEffects: effects.length > 0 || complexEffects.length > 0,
    };
  }

  /**
   * Show the preset picker, then create the chosen Active Effect on the item.
   * Choosing "Custom…" opens the guided PoiEffectEditor instead.
   */
  static async _onAddEffect(event, target) {
    const preset = await showPresetPicker();

    // undefined = cancelled
    if (preset === undefined) return;

    let effectName, fieldKey, modeName, value;

    if (preset === null) {
      // "Custom…" — open the guided editor
      const result = await PoiEffectEditor.show();
      if (!result) return;
      ({ fieldKey, modeName, value, effectName } = result);
    } else {
      fieldKey = preset.key;
      modeName = preset.modeName;
      value = preset.value;
      effectName = buildEffectAutoName(fieldKey, modeName, value);
    }

    await foundry.documents.ActiveEffect.create(
      {
        name: effectName,
        img: "icons/svg/aura.svg",
        transfer: true,
        disabled: false,
        changes: [
          {
            key: fieldKey,
            mode: CONST.ACTIVE_EFFECT_MODES[modeName],
            value: String(value),
            priority: 20,
          },
        ],
      },
      { parent: this.item },
    );
  }

  /**
   * Open the guided PoiEffectEditor for known PoI fields,
   * or fall back to the native AE config sheet for unknown keys.
   */
  static async _onEditEffect(event, target) {
    const effectId = target.closest("[data-effect-id]").dataset.effectId;
    const effect = this.item.effects.get(effectId);
    if (!effect) return;

    const change = effect.changes?.[0];
    const isKnownField =
      change && POI_EFFECT_FIELDS.some((f) => f.key === change.key);

    if (!isKnownField) {
      // Fall back to native editor for manually-created effects
      return effect.sheet.render(true);
    }

    // Look up mode name from CONST value
    const modeName =
      Object.entries(CONST.ACTIVE_EFFECT_MODES).find(
        ([, v]) => v === change.mode,
      )?.[0] ?? "ADD";

    const result = await PoiEffectEditor.show({
      fieldKey: change.key,
      modeName,
      value: isNaN(Number(change.value)) ? change.value : Number(change.value),
      effectName: effect.name,
    });

    if (!result) return;

    await effect.update({
      name: result.effectName,
      changes: [
        {
          key: result.fieldKey,
          mode: CONST.ACTIVE_EFFECT_MODES[result.modeName],
          value: String(result.value),
          priority: 20,
        },
      ],
    });
  }

  // ---------------------------------------------------------------------------
  // Complex effect actions
  // ---------------------------------------------------------------------------

  /** Open the ComplexEffectEditor to create a new complex effect. */
  static async _onAddComplexEffect(event, target) {
    const result = await ComplexEffectEditor.show();
    if (!result) return;

    const newEntry = {
      id: foundry.utils.randomID(),
      type: result.type,
      label: result.label,
      params: JSON.stringify(result.params ?? {}),
    };

    const existing = this.item.system.complexEffects ?? [];
    await this.item.update({
      "system.complexEffects": [...existing, newEntry],
    });
  }

  /** Open the ComplexEffectEditor pre-populated to edit an existing complex effect. */
  static async _onEditComplexEffect(event, target) {
    const entryId = target.closest("[data-complex-id]").dataset.complexId;
    const existing = this.item.system.complexEffects ?? [];
    const entry = existing.find((e) => e.id === entryId);
    if (!entry) return;

    let params;
    try {
      params = JSON.parse(entry.params || "{}");
    } catch {
      params = {};
    }

    const result = await ComplexEffectEditor.show({
      type: entry.type,
      label: entry.label,
      params,
    });
    if (!result) return;

    await this.item.update({
      "system.complexEffects": existing.map((e) =>
        e.id === entryId
          ? {
              ...e,
              type: result.type,
              label: result.label,
              params: JSON.stringify(result.params ?? {}),
            }
          : e,
      ),
    });
  }

  /** Delete a complex effect entry by id. */
  static async _onDeleteComplexEffect(event, target) {
    const entryId = target.closest("[data-complex-id]").dataset.complexId;
    const existing = this.item.system.complexEffects ?? [];
    await this.item.update({
      "system.complexEffects": existing.filter((e) => e.id !== entryId),
    });
  }

  /**
   * Delete an Active Effect from the item
   */
  static async _onDeleteEffect(event, target) {
    const effectId = target.closest("[data-effect-id]").dataset.effectId;
    const effect = this.item.effects.get(effectId);
    if (effect) await effect.delete();
  }

  /**
   * Toggle the disabled state of an Active Effect
   */
  static async _onToggleEffect(event, target) {
    const effectId = target.closest("[data-effect-id]").dataset.effectId;
    const effect = this.item.effects.get(effectId);
    if (effect) await effect.update({ disabled: !effect.disabled });
  }
}
