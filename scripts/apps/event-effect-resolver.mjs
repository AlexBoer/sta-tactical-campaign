/**
 * EventEffectResolver — evaluates complex effects from Event items on a PoI actor.
 *
 * Complex effects are stored in EventData.system.complexEffects and cannot be
 * expressed as native Foundry Active Effects. Results are always ephemeral —
 * the resolver never modifies actor data.
 *
 * Usage:
 *   const { poiOverrides, assetMods, descriptions, assetEffectDescriptions } =
 *     EventEffectResolver.resolve(poi, assignedAssets);
 *
 * Returns:
 *   poiOverrides            – { "system.fieldName": resolvedValue } for changed PoI fields
 *   assetMods               – [{ actor, powerDeltas: { powerKey: delta } }]
 *   descriptions            – readable strings for PoI-field effects (for sheet display)
 *   assetEffectDescriptions – readable strings for asset-targeting effects
 */

const MODULE_ID = "sta-tactical-campaign";

// Hardcoded STA power vocabulary — powers are stable and not expected to change.
const ALL_POWERS = ["medical", "military", "personal", "science", "social"];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _clampDifficulty(v) {
  return Math.min(5, Math.max(1, Math.round(v)));
}

function _clampUrgency(v) {
  return Math.min(5, Math.max(1, Math.round(v)));
}

function _evaluateCondition(currentValue, op, threshold) {
  const a = Number(currentValue ?? 0);
  const b = Number(threshold ?? 0);
  switch (op) {
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
    case "eq":
      return a === b;
    case "gte":
      return a >= b;
    case "gt":
      return a > b;
    default:
      return false;
  }
}

/**
 * Apply a simple field effect { field, op: "add"|"set", value } to the
 * working snapshot, clamping numeric fields to their valid ranges.
 */
function _applyFieldEffect(working, effect) {
  const { field, op, value } = effect;
  if (!field || op == null || value == null) return;
  const current = working[field] ?? 0;
  let next = op === "add" ? current + Number(value) : Number(value);
  if (field === "difficulty" || field === "difficulty2")
    next = _clampDifficulty(next);
  if (field === "urgency") next = _clampUrgency(next);
  working[field] = next;
}

function _capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Returns "+N" or "-N" given before (b) and after (a) numeric values. */
function _signedDelta(a, b) {
  const d = a - b;
  return d >= 0 ? `+${d}` : `${d}`;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export class EventEffectResolver {
  /**
   * Resolve all complex effects from Event items embedded on a PoI actor.
   *
   * @param {Actor}   poi            – The PoI actor
   * @param {Actor[]} [assets=[]]    – Assigned asset actors (used by asset_power_modify)
   * @returns {{
   *   poiOverrides:            Object<string, *>,
   *   assetMods:               Array<{actor: Actor, powerDeltas: Object<string, number>}>,
   *   descriptions:            string[],
   *   assetEffectDescriptions: string[]
   * }}
   */
  static resolve(poi, assets = []) {
    const sys = poi.system;

    // Working snapshot — starts from current (post-AE) PoI system values.
    const working = {
      difficulty: sys.difficulty ?? 1,
      difficulty2: sys.difficulty2 ?? null,
      urgency: sys.urgency ?? 1,
      power: sys.power ?? "military",
      power2: sys.power2 ?? "",
      poiType: sys.poiType ?? "unknown",
    };
    const original = { ...working };

    const assetMods = [];
    const descriptions = [];
    const assetEffectDescriptions = [];
    const unavailableAssets = [];

    // Gather all complex effects from all embedded Event items on this PoI.
    const allEffects = [];
    for (const item of poi.items) {
      if (item.type !== `${MODULE_ID}.event`) continue;
      for (const eff of item.system?.complexEffects ?? []) {
        let parsedParams;
        try {
          parsedParams = JSON.parse(eff.params || "{}");
        } catch {
          parsedParams = {};
        }
        allEffects.push({
          type: eff.type,
          label: eff.label,
          params: parsedParams,
        });
      }
    }

    // Evaluate each effect in order against the working snapshot.
    for (const eff of allEffects) {
      const p = eff.params;
      switch (eff.type) {
        case "difficulty_if_power":
          this._resolveDifficultyIfPower(working, p, descriptions);
          break;
        case "substitute_power":
          this._resolveSubstitutePower(working, p, descriptions);
          break;
        case "asset_power_modify":
          this._resolveAssetPowerModify(
            assets,
            p,
            assetMods,
            assetEffectDescriptions,
          );
          break;
        case "asset_unavailable":
          this._resolveAssetUnavailable(
            assets,
            eff.label,
            p,
            unavailableAssets,
            assetEffectDescriptions,
          );
          break;
        case "conditional":
          this._resolveConditional(working, p, descriptions);
          break;
        default:
          break; // Unknown type — skip silently
      }
    }

    // Build poiOverrides: full system-path keys for every field that changed.
    const poiOverrides = {};
    for (const key of Object.keys(original)) {
      if (working[key] !== original[key]) {
        poiOverrides[`system.${key}`] = working[key];
      }
    }

    return {
      poiOverrides,
      assetMods,
      descriptions,
      assetEffectDescriptions,
      unavailableAssets,
    };
  }

  // ---------------------------------------------------------------------------
  // Per-type resolvers
  // ---------------------------------------------------------------------------

  /**
   * difficulty_if_power — add delta to the matching power slot's difficulty.
   * Params: { matchPowers: string[], delta: number }
   */
  static _resolveDifficultyIfPower(working, p, descriptions) {
    const { matchPowers = [], delta = 0 } = p;
    if (!delta || !matchPowers.length) return;

    if (matchPowers.includes(working.power)) {
      const before = working.difficulty;
      working.difficulty = _clampDifficulty((working.difficulty ?? 1) + delta);
      const sign = _signedDelta(working.difficulty, before);
      descriptions.push(`${_capitalize(working.power)} Difficulty ${sign}`);
    }

    if (working.power2 && matchPowers.includes(working.power2)) {
      const before = working.difficulty2 ?? 1;
      working.difficulty2 = _clampDifficulty(before + delta);
      const sign = _signedDelta(working.difficulty2, before);
      descriptions.push(
        `${_capitalize(working.power2)} Alt. Difficulty ${sign}`,
      );
    }
  }

  /**
   * substitute_power — replace power slot value if it matches fromPowers.
   * Params: { fromPowers: string[], toPower: string }
   */
  static _resolveSubstitutePower(working, p, descriptions) {
    const { fromPowers = [], toPower = "" } = p;
    if (!toPower || !fromPowers.length) return;

    if (fromPowers.includes(working.power)) {
      descriptions.push(
        `Replace ${_capitalize(working.power)} with ${_capitalize(toPower)}`,
      );
      working.power = toPower;
    }

    if (working.power2 && fromPowers.includes(working.power2)) {
      descriptions.push(
        `Replace ${_capitalize(working.power2)} with ${_capitalize(toPower)} (alt.)`,
      );
      working.power2 = toPower;
    }
  }

  /**
   * asset_power_modify — compute power deltas for matching assigned assets.
   * Params: { targetAssetTypes: string[], targetPowers: string[], delta: number }
   * "all" in either array means all values.
   */
  static _resolveAssetPowerModify(assets, p, assetMods, descriptions) {
    const { targetAssetTypes = [], targetPowers = [], delta = 0 } = p;
    if (!delta || !targetPowers.length || !targetAssetTypes.length) return;

    const powers = targetPowers.includes("all") ? ALL_POWERS : targetPowers;
    const allTypes = targetAssetTypes.includes("all");
    const typeLabel = allTypes
      ? "All assets"
      : targetAssetTypes.map(_capitalize).join("/") + " assets";
    const powerLabel = powers.map(_capitalize).join(", ");
    const sign = delta > 0 ? `+${delta}` : `${delta}`;
    descriptions.push(`${typeLabel}: ${powerLabel} power ${sign}`);

    for (const asset of assets) {
      if (!asset) continue;
      const assetType = asset.system?.assetType;
      if (!allTypes && !targetAssetTypes.includes(assetType)) continue;
      const powerDeltas = {};
      for (const pwr of powers) {
        if (asset.system?.powers?.[pwr] !== undefined) {
          powerDeltas[pwr] = delta;
        }
      }
      if (Object.keys(powerDeltas).length) {
        assetMods.push({ actor: asset, powerDeltas });
      }
    }
  }

  /**
   * asset_unavailable — mark matching assigned assets as unavailable for N turns.
   * Params: { targetAssetTypes: string[], turns: number }
   * Returns entries in unavailableAssets so _onEndTurn can apply the AE.
   */
  static _resolveAssetUnavailable(
    assets,
    effLabel,
    p,
    unavailableAssets,
    descriptions,
  ) {
    const { targetAssetTypes = [], turns = 1 } = p;
    if (!turns || !targetAssetTypes.length) return;

    const allTypes = targetAssetTypes.includes("all");
    const typeLabel = allTypes
      ? "All assets"
      : targetAssetTypes.map(_capitalize).join("/") + " assets";
    const turnWord = turns === 1 ? "turn" : "turns";
    descriptions.push(`${typeLabel}: Unavailable ×${turns} ${turnWord}`);

    for (const asset of assets) {
      if (!asset) continue;
      const assetType = asset.system?.assetType;
      if (!allTypes && !targetAssetTypes.includes(assetType)) continue;
      const label = effLabel || `Unavailable (${turns} ${turnWord})`;
      unavailableAssets.push({ actor: asset, turns, label });
    }
  }

  /**
   * conditional — evaluate a two-branch condition and apply the matching effect.
   * Params: {
   *   conditionField: string,
   *   conditionOp: "lt"|"lte"|"eq"|"gte"|"gt",
   *   conditionValue: number,
   *   thenEffect: { field, op: "add"|"set", value },
   *   elseEffect?: { field, op: "add"|"set", value }
   * }
   */
  static _resolveConditional(working, p, descriptions) {
    const {
      conditionField,
      conditionOp,
      conditionValue,
      thenEffect,
      elseEffect,
    } = p;
    if (
      !conditionField ||
      !conditionOp ||
      conditionValue == null ||
      !thenEffect
    )
      return;

    const condMet = _evaluateCondition(
      working[conditionField] ?? 0,
      conditionOp,
      conditionValue,
    );
    const effectToApply = condMet ? thenEffect : elseEffect;
    if (!effectToApply) return;

    const before = working[effectToApply.field];
    _applyFieldEffect(working, effectToApply);
    const after = working[effectToApply.field];

    if (after !== before) {
      const change =
        typeof after === "number" && typeof before === "number"
          ? _signedDelta(after, before)
          : `→ ${after}`;
      descriptions.push(
        `${_capitalize(effectToApply.field)} ${change} (conditional)`,
      );
    }
  }
}
