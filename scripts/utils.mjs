/**
 * Shared utility helpers for STA Tactical Campaign.
 */

/**
 * Convert an editor-facing change name to a registered Foundry V14 type.
 *
 * @param {string} name
 * @returns {string}
 */
export function aeType(name) {
  const type = String(name || "add").toLowerCase();
  const changeTypes =
    foundry.documents.ActiveEffect.implementation.CHANGE_TYPES;
  return type in changeTypes ? type : "add";
}

/**
 * Build a Foundry V14 Active Effect change.
 *
 * @param {string} key
 * @param {string} type
 * @param {*} value
 * @returns {{key: string, type: string, value: *, phase: string}}
 */
export function buildAeChange(key, type, value) {
  return { key, type: aeType(type), value, phase: "initial" };
}

/**
 * Convert a Foundry V14 change type to the editor-facing uppercase name.
 *
 * @param {string} type
 * @returns {string}
 */
export function aeTypeToName(type) {
  return aeType(type).toUpperCase();
}
