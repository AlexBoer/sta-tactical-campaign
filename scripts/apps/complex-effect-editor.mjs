/**
 * ComplexEffectEditor — guided editor for complex Event effects on Points of Interest.
 * These are effect types that cannot be expressed as native Foundry Active Effects.
 *
 * Usage:
 *   const result = await ComplexEffectEditor.show();
 *   // result: { type, label, params } or null if cancelled
 */

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

// Hardcoded STA power vocabulary — powers are stable and not expected to change.
const POWERS = ["medical", "military", "personal", "science", "social"];
const ASSET_TYPES = ["character", "ship", "resource"];
const CONDITION_FIELDS = ["difficulty", "urgency"];
const CONDITION_OPS = ["lt", "lte", "eq", "gte", "gt"];
const EFFECT_FIELDS = ["difficulty", "urgency", "difficulty2"];
const EFFECT_OPS = ["add", "set"];

/** All valid complex effect type definitions, in display order. */
export const COMPLEX_EFFECT_TYPES = [
  {
    value: "difficulty_if_power",
    labelKey: "STA_TC.ComplexEffect.Type.difficulty_if_power",
  },
  {
    value: "substitute_power",
    labelKey: "STA_TC.ComplexEffect.Type.substitute_power",
  },
  {
    value: "asset_power_modify",
    labelKey: "STA_TC.ComplexEffect.Type.asset_power_modify",
  },
  { value: "conditional", labelKey: "STA_TC.ComplexEffect.Type.conditional" },
  {
    value: "asset_unavailable",
    labelKey: "STA_TC.ComplexEffect.Type.asset_unavailable",
  },
];

export class ComplexEffectEditor extends HandlebarsApplicationMixin(
  ApplicationV2,
) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sta-tactical-campaign", "complex-effect-editor"],
    tag: "form",
    window: {
      resizable: false,
      minimizable: false,
    },
    position: {
      width: 430,
      height: "auto",
    },
    actions: {
      submitEditor: ComplexEffectEditor._onSubmitEditor,
      cancelEditor: ComplexEffectEditor._onCancelEditor,
    },
  };

  /** @override */
  static PARTS = {
    form: {
      template:
        "modules/sta-tactical-campaign/templates/complex-effect-editor.hbs",
    },
  };

  // Track the single open editor instance to prevent duplicates
  static #openEditor = null;

  // Private state
  #resolve = null;
  #type = "difficulty_if_power";
  #label = "";
  #params = {};
  #isEdit = false;

  /**
   * Open the complex effect editor and return a result or null.
   * @param {object} [options]
   * @param {string} [options.type]   – pre-selected effect type (for editing)
   * @param {string} [options.label]  – pre-filled label (for editing)
   * @param {object} [options.params] – pre-filled params object (for editing)
   * @returns {Promise<{type: string, label: string, params: object}|null>}
   */
  static show({ type, label, params } = {}) {
    // If an editor is already open/rendering, bring it to front and ignore the
    // duplicate call rather than stacking a second window behind the first.
    if (ComplexEffectEditor.#openEditor) {
      if (ComplexEffectEditor.#openEditor.rendered) {
        ComplexEffectEditor.#openEditor.bringToFront();
      }
      return Promise.resolve(null);
    }

    const editor = new ComplexEffectEditor();
    ComplexEffectEditor.#openEditor = editor;
    editor.#isEdit = !!type;
    editor.#type = type ?? "difficulty_if_power";
    editor.#label = label ?? "";
    editor.#params = params && typeof params === "object" ? { ...params } : {};

    return new Promise((resolve) => {
      editor.#resolve = resolve;
      editor.render(true);
    });
  }

  /** @override */
  get title() {
    return game.i18n.localize(
      this.#isEdit
        ? "STA_TC.ComplexEffect.Editor.TitleEdit"
        : "STA_TC.ComplexEffect.Editor.TitleAdd",
    );
  }

  /** @override */
  async _prepareContext(options) {
    const p = this.#params;

    // Localisation helpers
    const _powerLabel = (pw) =>
      game.i18n.localize(
        `STA_TC.Powers.${pw.charAt(0).toUpperCase() + pw.slice(1)}`,
      );
    const _fieldLabel = (f) =>
      game.i18n.localize(`STA_TC.ComplexEffect.Field.${f}`);

    // --- Type selector ---
    const types = COMPLEX_EFFECT_TYPES.map((t) => ({
      value: t.value,
      label: game.i18n.localize(t.labelKey),
      selected: t.value === this.#type,
    }));

    // --- difficulty_if_power ---
    const matchPowers = POWERS.map((pw) => ({
      value: pw,
      label: _powerLabel(pw),
      checked: (p.matchPowers ?? []).includes(pw),
    }));

    // --- substitute_power ---
    const fromPowers = POWERS.map((pw) => ({
      value: pw,
      label: _powerLabel(pw),
      checked: (p.fromPowers ?? []).includes(pw),
    }));
    const toPowerChoices = POWERS.map((pw) => ({
      value: pw,
      label: _powerLabel(pw),
      selected: pw === (p.toPower ?? "military"),
    }));

    // --- asset_power_modify ---
    const assetTypeChoices = [
      ...ASSET_TYPES.map((t) => ({
        value: t,
        label: game.i18n.localize(`STA_TC.ComplexEffect.AssetType.${t}`),
        checked: (p.targetAssetTypes ?? []).includes(t),
      })),
      {
        value: "all",
        label: game.i18n.localize("STA_TC.ComplexEffect.All"),
        checked: (p.targetAssetTypes ?? []).includes("all"),
      },
    ];
    const assetPowerChoices = [
      ...POWERS.map((pw) => ({
        value: pw,
        label: _powerLabel(pw),
        checked: (p.targetPowers ?? []).includes(pw),
      })),
      {
        value: "all",
        label: game.i18n.localize("STA_TC.ComplexEffect.All"),
        checked: (p.targetPowers ?? []).includes("all"),
      },
    ];

    // --- conditional ---
    const conditionFieldChoices = CONDITION_FIELDS.map((f) => ({
      value: f,
      label: _fieldLabel(f),
      selected: f === (p.conditionField ?? "urgency"),
    }));
    const conditionOpChoices = CONDITION_OPS.map((op) => ({
      value: op,
      label: game.i18n.localize(`STA_TC.ComplexEffect.Op.${op}`),
      selected: op === (p.conditionOp ?? "lte"),
    }));
    const thenFieldChoices = EFFECT_FIELDS.map((f) => ({
      value: f,
      label: _fieldLabel(f),
      selected: f === (p.thenEffect?.field ?? "urgency"),
    }));
    const thenOpChoices = EFFECT_OPS.map((op) => ({
      value: op,
      label: game.i18n.localize(`STA_TC.ComplexEffect.EffectOp.${op}`),
      selected: op === (p.thenEffect?.op ?? "add"),
    }));
    const elseFieldChoices = EFFECT_FIELDS.map((f) => ({
      value: f,
      label: _fieldLabel(f),
      selected: f === (p.elseEffect?.field ?? "difficulty"),
    }));
    const elseOpChoices = EFFECT_OPS.map((op) => ({
      value: op,
      label: game.i18n.localize(`STA_TC.ComplexEffect.EffectOp.${op}`),
      selected: op === (p.elseEffect?.op ?? "add"),
    }));

    return {
      label: this.#label,
      types,
      currentType: this.#type,
      isDifficultyIfPower: this.#type === "difficulty_if_power",
      isSubstitutePower: this.#type === "substitute_power",
      isAssetPowerModify: this.#type === "asset_power_modify",
      isConditional: this.#type === "conditional",
      isAssetUnavailable: this.#type === "asset_unavailable",
      unavailTurns: p.turns ?? 1,
      // difficulty_if_power
      matchPowers,
      difDelta: p.delta ?? 1,
      // substitute_power
      fromPowers,
      toPowerChoices,
      // asset_power_modify
      assetTypeChoices,
      assetPowerChoices,
      assetDelta: p.delta ?? -1,
      // conditional
      conditionFieldChoices,
      conditionOpChoices,
      conditionValue: p.conditionValue ?? 2,
      thenFieldChoices,
      thenOpChoices,
      thenValue: p.thenEffect?.value ?? 1,
      elseFieldChoices,
      elseOpChoices,
      elseValue: p.elseEffect?.value ?? 1,
      hasElseEffect: p.elseEffect != null,
    };
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Re-render when the type changes, resetting params for the new type.
    // { once: true } prevents listener accumulation across re-renders.
    this.element.querySelector(".type-select")?.addEventListener(
      "change",
      (e) => {
        this.#type = e.target.value;
        this.#params = {};
        this.#label = "";
        this.render();
      },
      { once: true },
    );
  }

  /** @override */
  async close(options = {}) {
    if (ComplexEffectEditor.#openEditor === this) {
      ComplexEffectEditor.#openEditor = null;
    }
    this.#resolve?.(null);
    this.#resolve = null;
    return super.close(options);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Return the values of all checked checkboxes with a given name. */
  static _readChecked(form, name) {
    return Array.from(form.querySelectorAll(`[name="${name}"]:checked`)).map(
      (el) => el.value,
    );
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Build params from the current form state and resolve the promise.
   * @this {ComplexEffectEditor}
   */
  static async _onSubmitEditor(_event, _target) {
    const form = this.element;
    const type = form.querySelector("[name='effectType']").value;
    const _cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    let params = {};
    let autoLabel = "";

    switch (type) {
      case "difficulty_if_power": {
        const matchPowers = ComplexEffectEditor._readChecked(
          form,
          "matchPowers",
        );
        const delta = Number(
          form.querySelector("[name='difDelta']").value ?? 1,
        );
        params = { matchPowers, delta };
        const sign = delta >= 0 ? `+${delta}` : `${delta}`;
        autoLabel = `${matchPowers.map(_cap).join("/") || "none"} Difficulties ${sign}`;
        break;
      }

      case "substitute_power": {
        const fromPowers = ComplexEffectEditor._readChecked(form, "fromPowers");
        const toPower = form.querySelector("[name='toPower']").value;
        params = { fromPowers, toPower };
        autoLabel = `${fromPowers.map(_cap).join("/") || "none"} → ${_cap(toPower)}`;
        break;
      }

      case "asset_power_modify": {
        const targetAssetTypes = ComplexEffectEditor._readChecked(
          form,
          "targetAssetTypes",
        );
        const targetPowers = ComplexEffectEditor._readChecked(
          form,
          "targetPowers",
        );
        const delta = Number(
          form.querySelector("[name='assetDelta']").value ?? -1,
        );
        params = { targetAssetTypes, targetPowers, delta };
        const sign = delta >= 0 ? `+${delta}` : `${delta}`;
        autoLabel = `${targetPowers.map(_cap).join("/") || "none"} ${targetAssetTypes.map(_cap).join(" and ") || "none"} Powers ${sign}`;
        break;
      }

      case "conditional": {
        const conditionField = form.querySelector(
          "[name='conditionField']",
        ).value;
        const conditionOp = form.querySelector("[name='conditionOp']").value;
        const conditionValue = Number(
          form.querySelector("[name='conditionValue']").value,
        );
        const thenField = form.querySelector("[name='thenField']").value;
        const thenOp = form.querySelector("[name='thenOp']").value;
        const thenValue = Number(
          form.querySelector("[name='thenValue']").value,
        );
        const hasElse =
          form.querySelector("[name='hasElseEffect']")?.checked ?? false;

        let elseEffect;
        if (hasElse) {
          const elseField = form.querySelector("[name='elseField']").value;
          const elseOp = form.querySelector("[name='elseOp']").value;
          const elseValue = Number(
            form.querySelector("[name='elseValue']").value,
          );
          elseEffect = { field: elseField, op: elseOp, value: elseValue };
        }

        params = {
          conditionField,
          conditionOp,
          conditionValue,
          thenEffect: { field: thenField, op: thenOp, value: thenValue },
          elseEffect,
        };

        const opSymbol =
          { lt: "<", lte: "≤", eq: "=", gte: "≥", gt: ">" }[conditionOp] ??
          conditionOp;
        const thenStr =
          thenOp === "add"
            ? thenValue >= 0
              ? `+${thenValue}`
              : `${thenValue}`
            : `= ${thenValue}`;
        autoLabel = `If ${_cap(conditionField)} ${opSymbol} ${conditionValue}: ${_cap(thenField)} ${thenStr}`;
        break;
      }

      case "asset_unavailable": {
        const targetAssetTypes = ComplexEffectEditor._readChecked(
          form,
          "targetAssetTypes",
        );
        const turns = Number(
          form.querySelector("[name='unavailTurns']")?.value ?? 1,
        );
        params = { targetAssetTypes, turns };
        const turnWord = turns === 1 ? "turn" : "turns";
        autoLabel = `${targetAssetTypes.map(_cap).join("+") || "none"} assets: Unavailable ${turns} ${turnWord}`;
        break;
      }

      default:
        break;
    }

    const labelInput = form.querySelector("[name='effectLabel']");
    const label = labelInput?.value.trim() || autoLabel;

    this.#resolve({ type, label, params });
    this.#resolve = null;
    this.close();
  }

  /**
   * Cancel — resolve null and close.
   * @this {ComplexEffectEditor}
   */
  static _onCancelEditor(_event, _target) {
    this.#resolve?.(null);
    this.#resolve = null;
    this.close();
  }
}
