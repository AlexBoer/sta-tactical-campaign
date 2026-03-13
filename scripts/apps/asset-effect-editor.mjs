/**
 * AssetEffectEditor — structured dialog for creating and editing Active Effects
 * on Asset actors.
 *
 * Supports:
 *   - Lost / Unavailable status toggles
 *   - Per-power value delta modifiers (ADD mode)
 *   - Per-power focus delta modifiers (ADD mode)
 *   - Primary Power override
 *   - Asset Type override
 *   - Custom name, image, and optional campaign-turn duration
 */

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const MODULE_ID = "sta-tactical-campaign";
const ALL_POWERS = ["medical", "military", "personal", "science", "social"];
const ASSET_TYPES = ["character", "ship", "resource"];

export class AssetEffectEditor extends HandlebarsApplicationMixin(
  ApplicationV2,
) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "asset-effect-editor",
    classes: ["sta-tactical-campaign", "asset-effect-editor"],
    tag: "form",
    form: {
      closeOnSubmit: true,
      submitOnChange: false,
    },
    position: { width: 420, height: "auto" },
    window: { resizable: false, minimizable: false },
    actions: {
      submit: AssetEffectEditor._onSubmit,
    },
  };

  /** @override */
  static PARTS = {
    form: {
      template:
        "modules/sta-tactical-campaign/templates/asset-effect-editor.hbs",
    },
  };

  /**
   * @param {Actor}             actor    The asset actor that will own this AE.
   * @param {ActiveEffect|null} [effect] Existing AE to edit, or null to create.
   */
  constructor(actor, effect = null, options = {}) {
    super(options);
    this._actor = actor;
    this._effect = effect; // null = create mode
  }

  /** @override */
  get title() {
    return this._effect
      ? game.i18n.localize("STA_TC.EffectEditor.TitleEdit")
      : game.i18n.localize("STA_TC.EffectEditor.TitleAdd");
  }

  /**
   * Convenience factory — opens the editor and returns the application instance.
   * @param {Actor}             actor
   * @param {ActiveEffect|null} [effect]
   */
  static open(actor, effect = null) {
    const editor = new AssetEffectEditor(actor, effect);
    editor.render({ force: true });
    return editor;
  }

  /** @override */
  async _prepareContext(options) {
    const e = this._effect;
    const changes = e?.changes ?? [];

    // --- Decode existing changes back into form-friendly values ---------------

    // Status flags
    const isLost = changes.some((c) => c.key === "system.lost");
    const isUnavailable = changes.some((c) => c.key === "system.unavailable");

    // Power / focus deltas
    const powerDeltas = {};
    const focusDeltas = {};
    for (const power of ALL_POWERS) {
      const pChange = changes.find(
        (c) => c.key === `system.powers.${power}.value`,
      );
      const fChange = changes.find(
        (c) => c.key === `system.powers.${power}.focus`,
      );
      powerDeltas[power] = pChange ? Number(pChange.value) : 0;
      focusDeltas[power] = fChange ? Number(fChange.value) : 0;
    }

    // Override fields
    const primaryPowerChange = changes.find(
      (c) => c.key === "system.primaryPower",
    );
    const assetTypeChange = changes.find((c) => c.key === "system.assetType");
    const selectedPrimaryPower = primaryPowerChange?.value ?? "";
    const selectedAssetType = assetTypeChange?.value ?? "";

    // Duration from flag
    const expireAfterTurn = e?.flags?.[MODULE_ID]?.expireAfterTurn ?? null;
    const currentTurn =
      game.actors.find((a) => a.type === `${MODULE_ID}.campaignTracker`)?.system
        ?.campaignTurnNumber ?? 0;
    const duration =
      expireAfterTurn != null
        ? Math.max(1, expireAfterTurn - currentTurn)
        : null;

    // Build per-power rows for the template
    const powerRows = ALL_POWERS.map((key) => ({
      key,
      label: game.i18n.localize(
        `STA_TC.Powers.${key.charAt(0).toUpperCase() + key.slice(1)}`,
      ),
      powerDelta: powerDeltas[key],
      focusDelta: focusDeltas[key],
    }));

    // Primary power options
    const primaryPowerOptions = [
      { value: "", label: game.i18n.localize("STA_TC.EffectEditor.NoChange") },
      ...ALL_POWERS.map((p) => ({
        value: p,
        label: game.i18n.localize(
          `STA_TC.Powers.${p.charAt(0).toUpperCase() + p.slice(1)}`,
        ),
        selected: p === selectedPrimaryPower,
      })),
    ];

    // Asset type options
    const assetTypeOptions = [
      { value: "", label: game.i18n.localize("STA_TC.EffectEditor.NoChange") },
      ...ASSET_TYPES.map((t) => ({
        value: t,
        label: game.i18n.localize(
          `STA_TC.AssetTypes.${t.charAt(0).toUpperCase() + t.slice(1)}`,
        ),
        selected: t === selectedAssetType,
      })),
    ];

    return {
      name: e?.name ?? "",
      img: e?.img ?? "icons/svg/aura.svg",
      duration,
      isLost,
      isUnavailable,
      powerRows,
      primaryPowerOptions,
      assetTypeOptions,
    };
  }

  /**
   * Build the changes array from the submitted form data.
   * @param {FormDataExtended} formData
   * @returns {{ changes: object[], flags: object, statuses: string[] }}
   */
  _buildEffectData(formData) {
    const data = formData.object;
    const changes = [];
    const statuses = [];

    if (data.isLost) {
      changes.push({
        key: "system.lost",
        mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE,
        value: "1",
        priority: 20,
      });
      statuses.push("sta-tc.lost");
    }

    if (data.isUnavailable) {
      changes.push({
        key: "system.unavailable",
        mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE,
        value: "1",
        priority: 20,
      });
      statuses.push("sta-tc.unavailable");
    }

    for (const power of ALL_POWERS) {
      const pDelta = Number(data[`powerDelta_${power}`] ?? 0);
      const fDelta = Number(data[`focusDelta_${power}`] ?? 0);

      if (pDelta !== 0) {
        changes.push({
          key: `system.powers.${power}.value`,
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: String(pDelta),
          priority: 20,
        });
      }
      if (fDelta !== 0) {
        changes.push({
          key: `system.powers.${power}.focus`,
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: String(fDelta),
          priority: 20,
        });
      }
    }

    const primaryPower = data.primaryPower ?? "";
    if (primaryPower) {
      changes.push({
        key: "system.primaryPower",
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: primaryPower,
        priority: 20,
      });
    }

    const assetType = data.assetType ?? "";
    if (assetType) {
      changes.push({
        key: "system.assetType",
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: assetType,
        priority: 20,
      });
    }

    // Build flags — preserve existing MODULE_ID flags if editing
    const existingModuleFlags = this._effect?.flags?.[MODULE_ID] ?? {};
    const newModuleFlags = { ...existingModuleFlags };

    // Update expiry from duration input
    const durationRaw = data.duration;
    if (durationRaw != null && durationRaw !== "" && Number(durationRaw) > 0) {
      const currentTurn =
        game.actors.find((a) => a.type === `${MODULE_ID}.campaignTracker`)
          ?.system?.campaignTurnNumber ?? 0;
      newModuleFlags.expireAfterTurn = currentTurn + Number(durationRaw);
    } else if (
      durationRaw === "" ||
      durationRaw == null ||
      Number(durationRaw) <= 0
    ) {
      // Permanent — clear expiry
      delete newModuleFlags.expireAfterTurn;
    }

    // Sync unavailable/lost flags to match changes
    if (data.isUnavailable) {
      newModuleFlags.unavailable = true;
    } else {
      delete newModuleFlags.unavailable;
    }
    if (data.isLost) {
      newModuleFlags.lost = true;
    } else {
      delete newModuleFlags.lost;
    }

    return {
      name: data.name || game.i18n.localize("STA_TC.EffectEditor.DefaultName"),
      img: data.img || "icons/svg/aura.svg",
      disabled: false,
      changes,
      statuses,
      flags: { [MODULE_ID]: newModuleFlags },
    };
  }

  /** Submit action — create or update the AE. */
  static async _onSubmit(event, target) {
    const form = this.element.querySelector("form") ?? this.element;
    const formData = new FormDataExtended(form);
    const effectData = this._buildEffectData(formData);

    if (this._effect) {
      await this._effect.update(effectData);
    } else {
      await this._actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    }
  }

  /** @override — wire our submit action to the native form submit too */
  async _onSubmitForm(formConfig, event) {
    event.preventDefault();
    const formData = new FormDataExtended(this.element);
    const effectData = this._buildEffectData(formData);

    if (this._effect) {
      await this._effect.update(effectData);
    } else {
      await this._actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    }

    await this.close();
  }
}
