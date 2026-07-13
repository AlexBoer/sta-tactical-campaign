/**
 * Shared utility helpers for STA Tactical Campaign.
 */

/**
 * Returns the Active Effect change mode value compatible with both v13 and v14.
 *
 * - Foundry v13: `changes[].mode` is a numeric constant from CONST.ACTIVE_EFFECT_MODES.
 * - Foundry v14: `changes[].mode` is a string key (e.g. "UPGRADE", "ADD").
 *   Accessing the old numeric constant raises a deprecation warning.
 *
 * @param {"ADD"|"MULTIPLY"|"OVERRIDE"|"UPGRADE"|"DOWNGRADE"|"CUSTOM"} name
 * @returns {number|string}
 */
export function aeMode(name) {
  // v14 exposes CONST.ACTIVE_EFFECT_CHANGE_TYPES; use string keys there.
  if (CONST.ACTIVE_EFFECT_CHANGE_TYPES) return name;
  // v13 fallback: numeric constants.
  return CONST.ACTIVE_EFFECT_MODES[name];
}

/**
 * Given a change mode value (number on v13, string on v14), return the
 * canonical uppercase string name (e.g. "UPGRADE").
 *
 * @param {number|string} value
 * @returns {string}
 */
export function aeModeToName(value) {
  if (typeof value === "string") return value;
  // v13 numeric → look up in CONST.ACTIVE_EFFECT_MODES
  const entry = Object.entries(CONST.ACTIVE_EFFECT_MODES ?? {}).find(
    ([, v]) => v === value,
  );
  return entry?.[0] ?? "ADD";
}
