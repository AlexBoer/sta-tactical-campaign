/**
 * PoI Effect Editor — Custom guided Active Effect editor for Points of Interest.
 * Used by EventSheet to replace the raw Foundry AE config dialog.
 */

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const MODULE_ID = "sta-tactical-campaign";

// ---------------------------------------------------------------------------
// Field definitions — one entry per targetable PoI system field
// ---------------------------------------------------------------------------

export const POI_EFFECT_FIELDS = [
  {
    key: "system.difficulty",
    label: "STA_TC.Poi.Difficulty",
    type: "number",
    modes: ["ADD", "OVERRIDE", "UPGRADE", "DOWNGRADE"],
    min: 1,
    max: 5,
    initial: 1,
  },
  {
    key: "system.difficulty2",
    label: "STA_TC.Poi.Difficulty2",
    type: "number",
    modes: ["ADD", "OVERRIDE", "UPGRADE", "DOWNGRADE"],
    min: 1,
    max: 5,
    initial: 1,
  },
  {
    key: "system.urgency",
    label: "STA_TC.Poi.Urgency",
    type: "number",
    modes: ["ADD", "OVERRIDE", "UPGRADE", "DOWNGRADE"],
    min: 1,
    max: 5,
    initial: 1,
  },
  {
    key: "system.poiType",
    label: "STA_TC.Poi.Type",
    type: "select",
    modes: ["OVERRIDE"],
    choices: [
      { value: "tacticalThreat", label: "STA_TC.Poi.Types.TacticalThreat" },
      { value: "exploration", label: "STA_TC.Poi.Types.Exploration" },
      { value: "routine", label: "STA_TC.Poi.Types.Routine" },
      { value: "unknown", label: "STA_TC.Poi.Types.Unknown" },
    ],
    initial: "tacticalThreat",
  },
  {
    key: "system.power",
    label: "STA_TC.Poi.Power",
    type: "select",
    modes: ["OVERRIDE"],
    choices: [
      { value: "medical", label: "STA_TC.Powers.Medical" },
      { value: "military", label: "STA_TC.Powers.Military" },
      { value: "personal", label: "STA_TC.Powers.Personal" },
      { value: "science", label: "STA_TC.Powers.Science" },
      { value: "social", label: "STA_TC.Powers.Social" },
    ],
    initial: "military",
  },
  {
    key: "system.power2",
    label: "STA_TC.Poi.AltPower",
    type: "select",
    modes: ["OVERRIDE"],
    choices: [
      { value: "", label: "STA_TC.Poi.SecondPowerNone" },
      { value: "medical", label: "STA_TC.Powers.Medical" },
      { value: "military", label: "STA_TC.Powers.Military" },
      { value: "personal", label: "STA_TC.Powers.Personal" },
      { value: "science", label: "STA_TC.Powers.Science" },
      { value: "social", label: "STA_TC.Powers.Social" },
    ],
    initial: "",
  },
];

// ---------------------------------------------------------------------------
// Preset definitions — used by the preset picker dialog
// ---------------------------------------------------------------------------

export const POI_EFFECT_PRESETS = [
  // Difficulty
  {
    key: "system.difficulty",
    modeName: "ADD",
    value: 1,
    group: "STA_TC.EffectEditor.GroupDifficulty",
  },
  {
    key: "system.difficulty",
    modeName: "ADD",
    value: 2,
    group: "STA_TC.EffectEditor.GroupDifficulty",
  },
  {
    key: "system.difficulty",
    modeName: "ADD",
    value: -1,
    group: "STA_TC.EffectEditor.GroupDifficulty",
  },
  {
    key: "system.difficulty",
    modeName: "OVERRIDE",
    value: 5,
    group: "STA_TC.EffectEditor.GroupDifficulty",
  },
  // Difficulty 2
  {
    key: "system.difficulty2",
    modeName: "ADD",
    value: 1,
    group: "STA_TC.EffectEditor.GroupDifficulty2",
  },
  {
    key: "system.difficulty2",
    modeName: "ADD",
    value: 2,
    group: "STA_TC.EffectEditor.GroupDifficulty2",
  },
  {
    key: "system.difficulty2",
    modeName: "ADD",
    value: -1,
    group: "STA_TC.EffectEditor.GroupDifficulty2",
  },
  {
    key: "system.difficulty2",
    modeName: "OVERRIDE",
    value: 5,
    group: "STA_TC.EffectEditor.GroupDifficulty2",
  },
  // Urgency
  {
    key: "system.urgency",
    modeName: "ADD",
    value: 1,
    group: "STA_TC.EffectEditor.GroupUrgency",
  },
  {
    key: "system.urgency",
    modeName: "ADD",
    value: 2,
    group: "STA_TC.EffectEditor.GroupUrgency",
  },
  {
    key: "system.urgency",
    modeName: "ADD",
    value: -1,
    group: "STA_TC.EffectEditor.GroupUrgency",
  },
  {
    key: "system.urgency",
    modeName: "OVERRIDE",
    value: 5,
    group: "STA_TC.EffectEditor.GroupUrgency",
  },
  // PoI Type
  {
    key: "system.poiType",
    modeName: "OVERRIDE",
    value: "tacticalThreat",
    group: "STA_TC.EffectEditor.GroupPoiType",
  },
  {
    key: "system.poiType",
    modeName: "OVERRIDE",
    value: "exploration",
    group: "STA_TC.EffectEditor.GroupPoiType",
  },
  {
    key: "system.poiType",
    modeName: "OVERRIDE",
    value: "routine",
    group: "STA_TC.EffectEditor.GroupPoiType",
  },
  {
    key: "system.poiType",
    modeName: "OVERRIDE",
    value: "unknown",
    group: "STA_TC.EffectEditor.GroupPoiType",
  },
  // Power Type
  {
    key: "system.power",
    modeName: "OVERRIDE",
    value: "military",
    group: "STA_TC.EffectEditor.GroupPower",
  },
  {
    key: "system.power",
    modeName: "OVERRIDE",
    value: "medical",
    group: "STA_TC.EffectEditor.GroupPower",
  },
  {
    key: "system.power",
    modeName: "OVERRIDE",
    value: "personal",
    group: "STA_TC.EffectEditor.GroupPower",
  },
  {
    key: "system.power",
    modeName: "OVERRIDE",
    value: "science",
    group: "STA_TC.EffectEditor.GroupPower",
  },
  {
    key: "system.power",
    modeName: "OVERRIDE",
    value: "social",
    group: "STA_TC.EffectEditor.GroupPower",
  },
  // Alt Power
  {
    key: "system.power2",
    modeName: "OVERRIDE",
    value: "military",
    group: "STA_TC.EffectEditor.GroupAltPower",
  },
  {
    key: "system.power2",
    modeName: "OVERRIDE",
    value: "medical",
    group: "STA_TC.EffectEditor.GroupAltPower",
  },
  {
    key: "system.power2",
    modeName: "OVERRIDE",
    value: "personal",
    group: "STA_TC.EffectEditor.GroupAltPower",
  },
  {
    key: "system.power2",
    modeName: "OVERRIDE",
    value: "science",
    group: "STA_TC.EffectEditor.GroupAltPower",
  },
  {
    key: "system.power2",
    modeName: "OVERRIDE",
    value: "social",
    group: "STA_TC.EffectEditor.GroupAltPower",
  },
  {
    key: "system.power2",
    modeName: "OVERRIDE",
    value: "",
    group: "STA_TC.EffectEditor.GroupAltPower",
  },
];

/**
 * Generate a human-readable default name for an effect.
 * @param {string} fieldKey
 * @param {string} modeName  - e.g. "ADD", "OVERRIDE"
 * @param {string|number} value
 * @returns {string}
 */
export function buildEffectAutoName(fieldKey, modeName, value) {
  const field = POI_EFFECT_FIELDS.find((f) => f.key === fieldKey);
  const fieldLabel = field ? game.i18n.localize(field.label) : fieldKey;

  if (modeName === "ADD") {
    const sign = Number(value) >= 0 ? "+" : "";
    return `${fieldLabel} ${sign}${value}`;
  }

  if (modeName === "OVERRIDE") {
    if (field?.type === "select") {
      const choice = field.choices.find((c) => c.value === value);
      const valueLabel = choice
        ? game.i18n.localize(choice.label)
        : value || game.i18n.localize("STA_TC.Poi.SecondPowerNone");
      return `${fieldLabel} → ${valueLabel}`;
    }
    return `${fieldLabel} = ${value}`;
  }

  if (modeName === "UPGRADE") return `${fieldLabel} ↑ ${value}`;
  if (modeName === "DOWNGRADE") return `${fieldLabel} ↓ ${value}`;

  return `${fieldLabel} (${modeName}) ${value}`;
}

// ---------------------------------------------------------------------------
// Preset picker dialog — DialogV2.wait() wrapper
// ---------------------------------------------------------------------------

/**
 * Show the preset picker and return the selected preset, or null for "Custom",
 * or undefined if cancelled.
 * @returns {Promise<object|null|undefined>}
 *   - object  → a POI_EFFECT_PRESETS entry
 *   - null    → "Custom…" chosen, open the guided editor
 *   - undefined → cancelled
 */
export async function showPresetPicker() {
  // Build grouped <select> HTML
  const groups = {};
  for (const preset of POI_EFFECT_PRESETS) {
    if (!groups[preset.group]) groups[preset.group] = [];
    groups[preset.group].push(preset);
  }

  let optionsHtml = "";
  let globalIndex = 0;
  for (const [groupKey, presets] of Object.entries(groups)) {
    const groupLabel = game.i18n.localize(groupKey);
    optionsHtml += `<optgroup label="${groupLabel}">`;
    for (const preset of presets) {
      const label = buildEffectAutoName(
        preset.key,
        preset.modeName,
        preset.value,
      );
      optionsHtml += `<option value="${globalIndex}">${label}</option>`;
      globalIndex++;
    }
    optionsHtml += `</optgroup>`;
  }
  // Custom option
  optionsHtml += `<option value="custom">${game.i18n.localize("STA_TC.EffectEditor.Custom")}</option>`;

  const content = `
    <div class="form-group">
      <label>${game.i18n.localize("STA_TC.EffectEditor.ChoosePreset")}</label>
      <select id="effect-preset-select" style="width:100%;">${optionsHtml}</select>
    </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize("STA_TC.EffectEditor.PresetTitle"),
      icon: "fa-solid fa-wand-magic-sparkles",
    },
    content,
    buttons: [
      {
        action: "add",
        icon: "fa-solid fa-plus",
        label: game.i18n.localize("STA_TC.EffectEditor.Add"),
        default: true,
        callback: (_event, _button, dialog) => {
          return dialog.element.querySelector("#effect-preset-select").value;
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

  if (!result || result === "cancel") return undefined;
  if (result === "custom") return null;
  return POI_EFFECT_PRESETS[Number(result)];
}

// ---------------------------------------------------------------------------
// PoiEffectEditor — guided ApplicationV2 editor
// ---------------------------------------------------------------------------

export class PoiEffectEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sta-tactical-campaign", "poi-effect-editor"],
    tag: "form",
    window: {
      resizable: false,
      minimizable: false,
    },
    position: {
      width: 380,
      height: "auto",
    },
    actions: {
      submitEditor: PoiEffectEditor._onSubmitEditor,
      cancelEditor: PoiEffectEditor._onCancelEditor,
    },
  };

  /** @override */
  static PARTS = {
    form: {
      template: "modules/sta-tactical-campaign/templates/poi-effect-editor.hbs",
    },
  };

  // Internal state
  #resolve = null;
  #fieldKey = POI_EFFECT_FIELDS[0].key;
  #modeName = POI_EFFECT_FIELDS[0].modes[0];
  #value = POI_EFFECT_FIELDS[0].initial;
  #effectName = "";
  #isEdit = false;

  /**
   * Open the guided editor and return a result or null.
   * @param {object} [options]
   * @param {string} [options.fieldKey]   - pre-selected field key (for editing)
   * @param {string} [options.modeName]   - pre-selected mode name (for editing)
   * @param {*}      [options.value]      - pre-filled value (for editing)
   * @param {string} [options.effectName] - pre-filled effect name (for editing)
   * @returns {Promise<{fieldKey, modeName, value, effectName}|null>}
   */
  static show({ fieldKey, modeName, value, effectName } = {}) {
    const editor = new PoiEffectEditor();
    editor.#isEdit = !!fieldKey;

    // Apply initial state
    const firstField = POI_EFFECT_FIELDS[0];
    const resolvedField = fieldKey
      ? (POI_EFFECT_FIELDS.find((f) => f.key === fieldKey) ?? firstField)
      : firstField;

    editor.#fieldKey = resolvedField.key;
    editor.#modeName =
      modeName && resolvedField.modes.includes(modeName)
        ? modeName
        : resolvedField.modes[0];
    editor.#value = value ?? resolvedField.initial;
    editor.#effectName =
      effectName ??
      buildEffectAutoName(editor.#fieldKey, editor.#modeName, editor.#value);

    return new Promise((resolve) => {
      editor.#resolve = resolve;
      editor.render(true);
    });
  }

  /** @override */
  get title() {
    return game.i18n.localize(
      this.#isEdit
        ? "STA_TC.EffectEditor.TitleEdit"
        : "STA_TC.EffectEditor.TitleAdd",
    );
  }

  /** @override */
  async _prepareContext(options) {
    const field = POI_EFFECT_FIELDS.find((f) => f.key === this.#fieldKey);

    const fields = POI_EFFECT_FIELDS.map((f) => ({
      key: f.key,
      label: game.i18n.localize(f.label),
      selected: f.key === this.#fieldKey,
    }));

    const modes = field.modes.map((m) => ({
      name: m,
      label: game.i18n.localize(`STA_TC.EffectEditor.Mode.${m}`),
      selected: m === this.#modeName,
    }));

    const isNumber = field.type === "number";
    const isSelect = field.type === "select";

    const choices = isSelect
      ? field.choices.map((c) => ({
          value: c.value,
          label: game.i18n.localize(c.label),
          selected: c.value === this.#value,
        }))
      : [];

    return {
      effectName: this.#effectName,
      fields,
      modes,
      isNumber,
      isSelect,
      valueNumber: isNumber ? this.#value : 1,
      valueSelect: isSelect ? this.#value : "",
      choices,
      fieldMin: field.min ?? null,
      fieldMax: field.max ?? null,
    };
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Wire the field <select> change to re-render with updated modes/value
    this.element
      .querySelector(".field-select")
      ?.addEventListener("change", (e) =>
        PoiEffectEditor._onChangeField.call(this, e, e.target),
      );
  }

  /**
   * React to field selection change — re-render with updated modes/value.
   * @this {PoiEffectEditor}
   */
  static _onChangeField(event, target) {
    const form = this.element;
    const newFieldKey = form.querySelector("[name='fieldKey']").value;
    const field = POI_EFFECT_FIELDS.find((f) => f.key === newFieldKey);
    if (!field) return;

    this.#fieldKey = field.key;
    this.#modeName = field.modes[0];
    this.#value = field.initial;
    // Auto-update name only if it looks auto-generated (user hasn't customised it)
    this.#effectName = buildEffectAutoName(
      this.#fieldKey,
      this.#modeName,
      this.#value,
    );

    this.render();
  }

  /**
   * Submit the editor — resolve the promise and close.
   * @this {PoiEffectEditor}
   */
  static async _onSubmitEditor(event, target) {
    const form = this.element;
    const fieldKey = form.querySelector("[name='fieldKey']").value;
    const modeName = form.querySelector("[name='modeName']").value;
    const field = POI_EFFECT_FIELDS.find((f) => f.key === fieldKey);

    let value;
    if (field?.type === "number") {
      value = Number(form.querySelector("[name='valueNumber']").value);
    } else {
      value = form.querySelector("[name='valueSelect']").value;
    }

    const nameInput = form.querySelector("[name='effectName']");
    const effectName =
      nameInput.value.trim() || buildEffectAutoName(fieldKey, modeName, value);

    this.#resolve({ fieldKey, modeName, value, effectName });
    this.#resolve = null;
    this.close();
  }

  /**
   * Cancel — resolve null and close.
   * @this {PoiEffectEditor}
   */
  static _onCancelEditor(event, target) {
    this.#resolve?.(null);
    this.#resolve = null;
    this.close();
  }

  /** @override */
  async close(options = {}) {
    // If closed via window X without submitting
    this.#resolve?.(null);
    this.#resolve = null;
    return super.close(options);
  }
}
