const MODULE_ID = "sta-tactical-campaign";
const MIGRATION_VERSION = 1;
const ASSET_TYPE = `${MODULE_ID}.asset`;
const EVENT_TYPE = `${MODULE_ID}.event`;

const ASSET_CHANGE_TYPES = new Map([
  ["system.lost", "upgrade"],
  ["system.unavailable", "upgrade"],
  ["system.primaryPower", "override"],
  ["system.assetType", "override"],
]);

const EVENT_SELECT_KEYS = new Set([
  "system.poiType",
  "system.power",
  "system.power2",
]);
const EVENT_NUMERIC_KEYS = new Set([
  "system.difficulty",
  "system.difficulty2",
  "system.urgency",
]);

function _canonicalType(change, owner, effect) {
  if (owner.type === ASSET_TYPE) {
    if (ASSET_CHANGE_TYPES.has(change.key)) {
      return ASSET_CHANGE_TYPES.get(change.key);
    }
    if (/^system\.powers\.[^.]+\.(value|focus)$/.test(change.key)) {
      return "add";
    }
    if (effect.flags?.[MODULE_ID]?.progressionEffect) return "add";
  }

  if (owner.type === EVENT_TYPE && EVENT_SELECT_KEYS.has(change.key)) {
    return "override";
  }
  return null;
}

function _canonicalValue(change) {
  if (["system.lost", "system.unavailable"].includes(change.key)) return true;
  if (
    EVENT_NUMERIC_KEYS.has(change.key) ||
    /^system\.powers\.[^.]+\.(value|focus)$/.test(change.key)
  ) {
    const value = Number(change.value);
    return Number.isFinite(value) ? value : change.value;
  }
  return change.value;
}

function _isValidChangeType(type) {
  const changeTypes =
    foundry.documents.ActiveEffect.implementation.CHANGE_TYPES;
  return typeof type === "string" && type in changeTypes;
}

// Only genuinely un-migrated numeric Event effects are ambiguous. A change that
// already carries a valid V14 type (e.g. "add") is a faithful additive modifier
// and needs no repair.
function _isAmbiguousEventChange(change, owner) {
  return (
    owner.type === EVENT_TYPE &&
    EVENT_NUMERIC_KEYS.has(change.key) &&
    !_isValidChangeType(change.type)
  );
}

async function _processEffect(effect, owner, report, apply) {
  const sourceChanges = foundry.utils.deepClone(effect.system.changes ?? []);
  const changes = sourceChanges.map((change) => {
    if (_isAmbiguousEventChange(change, owner)) {
      report.ambiguous.push({
        effectUuid: effect.uuid,
        ownerUuid: owner.uuid,
        key: change.key,
        currentType: change.type,
      });
      return change;
    }

    const type = _canonicalType(change, owner, effect);
    if (!type) return change;
    return {
      ...change,
      type,
      value: _canonicalValue(change),
      phase: "initial",
    };
  });

  const update = {};
  if (!foundry.utils.equals(sourceChanges, changes)) {
    update["system.changes"] = changes;
  }
  if (
    (effect.flags?.[MODULE_ID]?.lost ||
      effect.flags?.[MODULE_ID]?.unavailable) &&
    effect.showIcon !== CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS
  ) {
    update.showIcon = CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS;
  }
  if (!Object.keys(update).length) return;

  const entry = {
    effectUuid: effect.uuid,
    ownerUuid: owner.uuid,
    fields: Object.keys(update),
  };
  if (apply) {
    await effect.update(update);
    report.updated.push(entry);
  } else report.pending.push(entry);
}

async function _processDocument(document, report, apply) {
  if (document.type === ASSET_TYPE || document.type === EVENT_TYPE) {
    for (const effect of document.effects) {
      await _processEffect(effect, document, report, apply);
    }
  }

  if (document.documentName === "Actor") {
    for (const item of document.items) {
      if (item.type !== EVENT_TYPE) continue;
      for (const effect of item.effects) {
        await _processEffect(effect, item, report, apply);
      }
    }
  }
}

async function _processConfiguredCompendiums(report, apply) {
  const packIds = new Set([
    game.settings.get(MODULE_ID, "assetActorCompendium"),
    game.settings.get(MODULE_ID, "poiActorCompendium"),
    game.settings.get(MODULE_ID, "eventItemCompendium"),
  ]);
  packIds.delete("");

  for (const packId of packIds) {
    const pack = game.packs.get(packId);
    if (!pack) {
      report.skipped.push({ packId, reason: "missing" });
      continue;
    }
    if (apply && pack.locked) {
      report.skipped.push({ packId, reason: "locked" });
      continue;
    }
    for (const document of await pack.getDocuments()) {
      await _processDocument(document, report, apply);
    }
  }
}

export class ActiveEffectMigration {
  static VERSION = MIGRATION_VERSION;

  static async run({ apply = true, includeCompendiums = true } = {}) {
    if (!game.user?.isGM)
      throw new Error("Active Effect migration is GM-only.");

    const report = { updated: [], pending: [], ambiguous: [], skipped: [] };
    for (const actor of game.actors) {
      await _processDocument(actor, report, apply);
    }
    for (const item of game.items) {
      await _processDocument(item, report, apply);
    }
    if (includeCompendiums) {
      await _processConfiguredCompendiums(report, apply);
    }
    return report;
  }

  static async migrateIfNeeded() {
    if (!game.users.activeGM?.isSelf) return null;
    const current = game.settings.get(
      MODULE_ID,
      "activeEffectMigrationVersion",
    );
    if (current >= MIGRATION_VERSION) return null;

    const report = await this.run();
    await game.settings.set(
      MODULE_ID,
      "activeEffectMigrationVersion",
      MIGRATION_VERSION,
    );
    console.info(
      `${MODULE_ID} | Active Effects 2.0 migration complete`,
      report,
    );
    if (report.ambiguous.length || report.skipped.length) {
      ui.notifications.warn(
        game.i18n.format("STA_TC.ActiveEffectMigration.ReviewNeeded", {
          ambiguous: report.ambiguous.length,
          skipped: report.skipped.length,
        }),
      );
    }
    return report;
  }
}
