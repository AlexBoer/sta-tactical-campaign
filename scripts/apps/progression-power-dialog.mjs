/**
 * Shared dialog helper for progression results that modify asset power or focus.
 * Opens a DialogV2 prompting the user to pick an eligible asset and a power/focus,
 * then creates a permanent Active Effect on the chosen asset.
 */

const MODULE_ID = "sta-tactical-campaign";

const POWERS = ["medical", "military", "personal", "science", "social"];

/**
 * @typedef {Object} PowerModConfig
 * @property {Actor}    tracker    - The campaign tracker actor (used to enumerate eligible assets).
 * @property {string[]} assetTypes - e.g. ["ship"] or ["character", "ship"] or ["resource"]
 * @property {"power"|"focus"} mode - Whether to modify a power value or a focus value.
 * @property {number}  delta       - Amount to apply (typically +1).
 * @property {string}  title       - Dialog window title.
 * @property {string}  [description] - Optional description shown above the pickers.
 */

export class ProgressionPowerDialog {
  /**
   * Prompt the user to pick an eligible asset and a power/focus to modify,
   * then apply a permanent Active Effect to the chosen asset.
   *
   * @param {PowerModConfig} config
   * @returns {Promise<boolean>} true if an effect was applied, false if cancelled.
   */
  static async prompt(config) {
    const {
      tracker,
      assetTypes,
      mode = "power",
      delta = 1,
      title,
      description,
    } = config;

    // ---- 1. Gather eligible assets ----
    const allUuids = [
      ...(tracker.system.characterAssets || []),
      ...(tracker.system.shipAssets || []),
      ...(tracker.system.resourceAssets || []),
    ];

    const eligible = [];
    for (const uuid of allUuids) {
      const actor = await fromUuid(uuid);
      if (!actor) continue;
      if (!assetTypes.includes(actor.system?.assetType)) continue;
      // Skip lost assets — they can't benefit from improvements
      if (actor.effects?.some((e) => e.flags?.[MODULE_ID]?.lost)) continue;
      eligible.push({ uuid, name: actor.name, img: actor.img });
    }

    if (!eligible.length) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Progression.NoEligibleAssets"),
      );
      return false;
    }

    // ---- 2. Build dialog HTML ----
    const assetOptions = eligible
      .map(
        (a, i) =>
          `<option value="${a.uuid}" ${i === 0 ? "selected" : ""}>${a.name}</option>`,
      )
      .join("");

    const powerLabel =
      mode === "focus"
        ? game.i18n.localize("STA_TC.Progression.PickFocus")
        : game.i18n.localize("STA_TC.Progression.PickPower");
    const powerOptions = POWERS.map(
      (p, i) =>
        `<option value="${p}" ${i === 0 ? "selected" : ""}>${game.i18n.localize(`STA_TC.Powers.${p.charAt(0).toUpperCase() + p.slice(1)}`)}</option>`,
    ).join("");

    const descHtml = description
      ? `<p style="margin:0 0 10px;color:var(--sta-tc-text-muted,#aaa);font-size:0.9em;">${description}</p>`
      : "";

    const content = `
      <form class="progression-power-form" style="display:flex;flex-direction:column;gap:10px;padding:8px 0;">
        ${descHtml}
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-weight:bold;">${game.i18n.localize("STA_TC.Progression.PickAsset")}</label>
          <select name="assetUuid" style="width:100%;">${assetOptions}</select>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-weight:bold;">${powerLabel}</label>
          <select name="power" style="width:100%;">${powerOptions}</select>
        </div>
      </form>`;

    // ---- 3. Show dialog ----
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title },
      content,
      ok: {
        label: game.i18n.localize("STA_TC.Converter.Confirm"),
        callback: (_ev, button) => ({
          assetUuid: button.form.elements.assetUuid.value,
          power: button.form.elements.power.value,
        }),
      },
      rejectClose: false,
    });

    if (!result) return false;

    // ---- 4. Apply the permanent Active Effect ----
    const { assetUuid, power } = result;
    const asset = await fromUuid(assetUuid);
    if (!asset) return false;

    const statKey =
      mode === "focus"
        ? `system.powers.${power}.focus`
        : `system.powers.${power}.value`;
    const powerLabel2 = game.i18n.localize(
      `STA_TC.Powers.${power.charAt(0).toUpperCase() + power.slice(1)}`,
    );
    const effectName =
      mode === "focus"
        ? `Progression: ${power.charAt(0).toUpperCase() + power.slice(1)} focus +${delta}`
        : `Progression: ${power.charAt(0).toUpperCase() + power.slice(1)} +${delta}`;

    await asset.createEmbeddedDocuments("ActiveEffect", [
      {
        name: effectName,
        changes: [{ key: statKey, mode: 2 /* ADD */, value: String(delta) }],
        disabled: false,
        flags: { [MODULE_ID]: { progressionEffect: true } },
      },
    ]);

    const msg =
      mode === "focus"
        ? game.i18n.format("STA_TC.Progression.FocusModApplied", {
            delta,
            power: powerLabel2,
            name: asset.name,
          })
        : game.i18n.format("STA_TC.Progression.PowerModApplied", {
            delta,
            stat: powerLabel2,
            name: asset.name,
          });
    ui.notifications.info(msg);
    return true;
  }

  /**
   * Prompt the user to pick an asset with a loss/unavailability result and remove it.
   * Used by "Miraculous Escape" (characters) and "Damage Control" (ships).
   *
   * @param {Actor}   tracker   - The campaign tracker actor.
   * @param {string|null} assetType - "character", "ship", or null for any type.
   * @returns {Promise<boolean>} true if effects were removed, false if cancelled.
   */
  static async promptRemoveLoss(tracker, assetType = null) {
    const allUuids = [
      ...(tracker.system.characterAssets || []),
      ...(tracker.system.shipAssets || []),
      ...(tracker.system.resourceAssets || []),
    ];

    const affectedAssets = [];
    for (const uuid of allUuids) {
      const actor = await fromUuid(uuid);
      if (!actor) continue;
      if (assetType && actor.system?.assetType !== assetType) continue;
      const hasLost = actor.effects?.some((e) => e.flags?.[MODULE_ID]?.lost);
      // For ships, also include assets with an unavailability AE (heavily damaged)
      const hasUnavailable =
        assetType === "ship" &&
        actor.effects?.some((e) => e.flags?.[MODULE_ID]?.unavailable);
      if (hasLost || hasUnavailable) {
        affectedAssets.push({ uuid, name: actor.name });
      }
    }

    if (!affectedAssets.length) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Progression.NoLostAssets"),
      );
      return false;
    }

    const options = affectedAssets
      .map(
        (a, i) =>
          `<option value="${a.uuid}" ${i === 0 ? "selected" : ""}>${a.name}</option>`,
      )
      .join("");

    const content = `
      <form style="padding:8px 0;">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-weight:bold;">${game.i18n.localize("STA_TC.Progression.PickAsset")}</label>
          <select name="assetUuid" style="width:100%;">${options}</select>
        </div>
      </form>`;

    const titleKey =
      assetType === "ship"
        ? "STA_TC.Progression.Type.damageControl"
        : "STA_TC.Progression.Type.miraculousEscape";

    const chosen = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize(titleKey) },
      content,
      ok: {
        label: game.i18n.localize("STA_TC.Converter.Confirm"),
        callback: (_ev, button) => button.form.elements.assetUuid.value,
      },
      rejectClose: false,
    });

    if (!chosen) return false;

    const asset = await fromUuid(chosen);
    if (!asset) return false;

    // Remove Lost and (for ships) Unavailable AEs
    const effectsToRemove = asset.effects.filter(
      (e) =>
        e.flags?.[MODULE_ID]?.lost ||
        (assetType === "ship" && e.flags?.[MODULE_ID]?.unavailable),
    );
    for (const e of effectsToRemove) await e.delete();

    ui.notifications.info(
      game.i18n.format("STA_TC.Progression.MiraculousEscapeApplied", {
        name: asset.name,
      }),
    );
    return true;
  }
}
