const MODULE_ID = "sta-tactical-campaign";

const SOURCE_CONFIG = {
  poi: {
    settingBySubKey: {
      tacticalThreat: "tableTacticalThreat",
      exploration: "tableExploration",
      routine: "tableRoutine",
      unknown: "tableUnknown",
    },
    usedKey: "usedPoiResults",
    actorSettingKey: "poiActorCompendium",
    actorType: `${MODULE_ID}.poi`,
  },
  asset: {
    settingBySubKey: {
      character: "tableAssetCharacter",
      ship: "tableAssetShip",
      resource: "tableAssetResource",
    },
    usedKey: "usedAssetResults",
    actorSettingKey: "assetActorCompendium",
    actorType: `${MODULE_ID}.asset`,
  },
  progression: {
    settingBySubKey: {
      progression: "tableProgression",
    },
    usedKey: "usedProgressionResults",
    actorSettingKey: null,
    actorType: null,
    itemSettingKey: "progressionItemCompendium",
    itemType: `${MODULE_ID}.progression`,
    itemCategoryField: "system.progressionCategory",
    itemCategoryValue: "progression",
  },
  escalation: {
    settingBySubKey: {
      escalation: "tableEscalation",
    },
    usedKey: "usedEscalationResults",
    actorSettingKey: null,
    actorType: null,
    itemSettingKey: "progressionItemCompendium",
    itemType: `${MODULE_ID}.progression`,
    itemCategoryField: "system.progressionCategory",
    itemCategoryValue: "escalation",
  },
  event: {
    settingBySubKey: {
      event: "tableEvents",
    },
    usedKey: "usedEventResults",
    actorSettingKey: null,
    actorType: null,
    itemSettingKey: "eventItemCompendium",
    itemType: `${MODULE_ID}.event`,
    itemCategoryField: null,
    itemCategoryValue: null,
  },
};

export class RollTableManagerService {
  static TEMP_TABLE_FLAG_PATH = `${MODULE_ID}.rtmTempTable`;

  static COMPENDIUM_FOLDER_LAYOUT = {
    asset: {
      root: { name: "Assets", color: "#2C95A3" },
      children: {
        character: "Character Assets",
        ship: "Starship Assets",
        resource: "Resource Assets",
      },
    },
    poi: {
      root: { name: "Points of Interest", color: "#2E8E5D" },
      children: {
        tacticalThreat: "Points of Interest - Tactical Threat",
        exploration: "Points of Interest - Exploration",
        routine: "Points of Interest - Routine",
        unknown: "Points of Interest - Unknown",
      },
    },
  };

  static #isRollTableDocument(doc) {
    if (!doc) return false;
    if (doc.documentName === "RollTable") return true;
    if (doc.constructor?.name === "RollTable") return true;

    // Fallback shape checks for proxied documents in some Foundry contexts.
    return (
      typeof doc.createEmbeddedDocuments === "function" &&
      typeof doc.normalize === "function" &&
      doc.results != null
    );
  }

  static getSourceConfig(source) {
    const config = SOURCE_CONFIG[source];
    if (!config) throw new Error(`Unknown source '${source}'`);
    return config;
  }

  static getTableSettingKey(source, subKey) {
    return this.getSourceConfig(source).settingBySubKey[subKey] || null;
  }

  static getTableUuid(source, subKey) {
    const settingKey = this.getTableSettingKey(source, subKey);
    if (!settingKey) return "";
    return game.settings.get(MODULE_ID, settingKey);
  }

  /**
   * Soft limit above which we warn that a table is large enough to hurt
   * load/edit performance (Foundry must construct every embedded result).
   */
  static OVERSIZED_RESULT_WARNING = 500;

  /**
   * Resolve the editable RollTable for a source/subKey.
   *
   * The behaviour is determined automatically by *where the configured table
   * lives*:
   * - Setting points at a **world** RollTable → edit it directly (private to
   *   this world, fastest).
   * - Setting points at a **compendium** RollTable → edit it in place so the
   *   change is shared with any other world that loads the same pack (requires
   *   the pack to be unlocked).
   *
   * Use `migrateRollTablesToWorld()` / `publishTablesToCompendium()` to move a
   * table between the two and repoint the setting.
   */
  static async loadEditableTable(source, subKey) {
    const uuid = this.getTableUuid(source, subKey);
    if (!uuid) {
      throw new Error(
        game.i18n.localize("STA_TC.RollTableManager.Errors.TableNotConfigured"),
      );
    }

    // Guard against selecting a compendium PACK UUID instead of a table document UUID.
    if (/^Compendium\.[^.]+\.[^.]+$/.test(uuid)) {
      throw new Error(
        `${game.i18n.localize("STA_TC.RollTableManager.Errors.TableNotConfigured")} (compendium pack UUID configured; set a specific RollTable UUID)`,
      );
    }

    const table = await fromUuid(uuid);
    if (!table) {
      throw new Error(
        game.i18n.localize("STA_TC.RollTableManager.Errors.TableNotFound"),
      );
    }

    if (!this.#isRollTableDocument(table)) {
      throw new Error(
        `${game.i18n.localize("STA_TC.RollTableManager.Errors.TableNotFound")} (resolved UUID type: ${table?.documentName || table?.constructor?.name || "unknown"})`,
      );
    }

    this.#warnIfOversized(table, `${source}:${subKey}`);

    // Compendium table → shared, in-place editing. The pack must be
    // unlocked for edits to persist.
    if (table.pack) {
      const pack = game.packs.get(table.pack);
      if (pack?.locked) {
        throw new Error(
          game.i18n.localize("STA_TC.RollTableManager.Errors.CompendiumLocked"),
        );
      }
      return table;
    }

    // World table → directly editable and already in memory.
    return table;
  }

  static #warnIfOversized(table, label) {
    const count = this.getResultCount(table);
    if (count > this.OVERSIZED_RESULT_WARNING) {
      console.warn(
        `${MODULE_ID} | RTM | Table "${table?.name}" (${label}) has ${count} results — large tables are slow to load/edit. Consider de-duplicating or running migrateRollTablesToWorld().`,
      );
    }
  }

  static #findManagedWorldTable(importedFrom) {
    if (!importedFrom) return null;
    return (
      game.tables.find(
        (t) =>
          t.getFlag(MODULE_ID, "managedTable")?.importedFrom === importedFrom,
      ) || null
    );
  }

  static #findLegacyTempTable(sourceUuid) {
    if (!sourceUuid) return null;
    return (
      game.tables.find(
        (t) => t.getFlag(MODULE_ID, "rtmTempTable")?.sourceUuid === sourceUuid,
      ) || null
    );
  }

  static isTempTable(table) {
    // Legacy temp tables created by the previous compendium-sync design.
    return !!table?.getFlag?.(MODULE_ID, "rtmTempTable");
  }

  static isManagedTable(table) {
    return !!table?.getFlag?.(MODULE_ID, "managedTable");
  }

  static getTableNotice(table) {
    if (table?.pack) {
      return game.i18n.localize(
        "STA_TC.RollTableManager.CompendiumBackedNotice",
      );
    }
    if (this.isManagedTable(table)) {
      return game.i18n.localize("STA_TC.RollTableManager.ManagedTableNotice");
    }
    if (this.isTempTable(table)) {
      return game.i18n.localize("STA_TC.RollTableManager.TempTableNotice");
    }
    return "";
  }

  /**
   * De-duplicate an array of raw TableResult data.
   * Identity is the linked document UUID when present, else name + description.
   * @param {object[]} results
   * @returns {object[]}
   */
  static dedupeResultsData(results = []) {
    const seen = new Set();
    const output = [];
    for (const raw of results) {
      const data = foundry.utils.deepClone(raw);
      delete data._id;
      const identity =
        data.documentUuid ||
        `${data.type ?? ""}|${String(data.name ?? "").trim()}|${String(
          data.description ?? "",
        ).trim()}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      output.push(data);
    }
    return output;
  }

  static async #repointSetting(source, subKey, uuid) {
    if (!game.user?.isGM) return;
    const key = this.getTableSettingKey(source, subKey);
    if (!key) return;
    if (game.settings.get(MODULE_ID, key) === uuid) return;
    await game.settings.set(MODULE_ID, key, uuid);
  }

  /**
   * Build a de-duplicated world RollTable from a source table (world or
   * compendium) and repoint the source/subKey setting at the new world table.
   * @returns {Promise<RollTable>}
   */
  static async #migrateTableToWorld(sourceTable, source, subKey, importedFrom) {
    const data = sourceTable.toObject();
    const deduped = this.dedupeResultsData(data.results || []);

    delete data._id;
    delete data.folder;
    delete data.sort;
    delete data.ownership;
    data.name = String(sourceTable.name || "Roll Table").replace(
      /^\[RTM\]\s*/,
      "",
    );
    data.results = deduped;
    data.flags = data.flags || {};
    data.flags[MODULE_ID] = data.flags[MODULE_ID] || {};
    delete data.flags[MODULE_ID].rtmTempTable;
    data.flags[MODULE_ID].managedTable = {
      source,
      subKey,
      importedFrom: importedFrom || sourceTable.uuid,
      importedAt: Date.now(),
    };

    const world = await RollTable.create(data);
    await world.normalize();
    await this.#repointSetting(source, subKey, world.uuid);

    return world;
  }

  /**
   * One-time repair/migration: convert every configured POI/Asset table into a
   * de-duplicated world RollTable, repoint the settings, and delete legacy temp
   * tables from the previous compendium-sync design.
   * @returns {Promise<object[]>} A report describing what happened per table.
   */
  static async migrateRollTablesToWorld({ deleteLegacyTemp = true } = {}) {
    if (!game.user?.isGM) {
      ui.notifications?.warn(
        game.i18n.localize("STA_TC.RollTableManager.Errors.GmOnly"),
      );
      return [];
    }

    const report = [];
    for (const source of Object.keys(SOURCE_CONFIG)) {
      const subKeys = Object.keys(SOURCE_CONFIG[source].settingBySubKey);
      for (const subKey of subKeys) {
        const uuid = this.getTableUuid(source, subKey);
        if (!uuid) {
          report.push({ source, subKey, status: "unset" });
          continue;
        }
        try {
          // Reuse an already-migrated world copy for this source.
          const existingManaged = this.#findManagedWorldTable(uuid);
          if (existingManaged) {
            await this.#repointSetting(source, subKey, existingManaged.uuid);
            report.push({
              source,
              subKey,
              status: "already-migrated",
              uuid: existingManaged.uuid,
              count: existingManaged.results?.size ?? 0,
            });
            continue;
          }

          // Prefer an in-memory legacy temp mirror to avoid constructing a
          // potentially huge compendium document.
          const legacyTemp = this.#findLegacyTempTable(uuid);
          const src = legacyTemp || (await fromUuid(uuid));
          if (!src || !this.#isRollTableDocument(src)) {
            report.push({ source, subKey, status: "missing", uuid });
            continue;
          }

          // Already an editable world table (not a legacy temp) → nothing to do.
          if (!src.pack && !this.isTempTable(src)) {
            await this.#repointSetting(source, subKey, src.uuid);
            report.push({
              source,
              subKey,
              status: "already-world",
              uuid: src.uuid,
              count: src.results?.size ?? 0,
            });
            continue;
          }

          const world = await this.#migrateTableToWorld(
            src,
            source,
            subKey,
            uuid,
          );
          report.push({
            source,
            subKey,
            status: "migrated",
            uuid: world.uuid,
            count: world.results?.size ?? 0,
          });
        } catch (error) {
          report.push({
            source,
            subKey,
            status: "error",
            error: error?.message,
          });
        }
      }
    }

    if (deleteLegacyTemp) {
      const temps = game.tables.filter((t) =>
        t.getFlag(MODULE_ID, "rtmTempTable"),
      );
      for (const t of temps) {
        report.push({
          status: "deleted-temp",
          name: t.name,
          count: t.results?.size ?? 0,
        });
        await t.delete();
      }
    }

    console.log(`${MODULE_ID} | RTM | migrateRollTablesToWorld report`, report);
    ui.notifications?.info(
      game.i18n.localize("STA_TC.RollTableManager.MigrationComplete"),
    );
    return report;
  }

  /**
   * Publish the current editable tables into a compendium pack you control so
   * multiple worlds can share them. For each configured source/subKey this:
   *  1. loads the current editable table,
   *  2. de-duplicates its results,
   *  3. creates or updates a RollTable in the target pack (identity-safe, no
   *     duplication),
   *  4. repoints the world setting at the compendium table.
   *
   * Repointing the setting at the compendium table is what makes editing
   * "shared": from then on `loadEditableTable` edits the pack table in place.
   *
   * Do NOT target a shared community pack — use a pack in a module/world you own.
   *
   * @param {string} packId  Collection id of an unlocked RollTable compendium.
   * @returns {Promise<object[]>} Per-table publish report.
   */
  static async publishTablesToCompendium(packId) {
    if (!game.user?.isGM) {
      ui.notifications?.warn(
        game.i18n.localize("STA_TC.RollTableManager.Errors.GmOnly"),
      );
      return [];
    }

    const pack = game.packs.get(packId);
    if (!pack) {
      throw new Error(`Compendium pack not found: ${packId}`);
    }
    if (pack.documentName !== "RollTable") {
      throw new Error(
        `Compendium pack "${packId}" is not a RollTable pack (it holds ${pack.documentName}).`,
      );
    }
    if (pack.locked) {
      throw new Error(
        game.i18n.localize("STA_TC.RollTableManager.Errors.CompendiumLocked"),
      );
    }

    await pack.getIndex();
    const report = [];

    for (const source of Object.keys(SOURCE_CONFIG)) {
      const subKeys = Object.keys(SOURCE_CONFIG[source].settingBySubKey);
      for (const subKey of subKeys) {
        if (!this.getTableUuid(source, subKey)) {
          report.push({ source, subKey, status: "unset" });
          continue;
        }
        try {
          const editable = await this.loadEditableTable(source, subKey);
          const deduped = this.dedupeResultsData(
            [...editable.results].map((r) => r.toObject()),
          );
          const publishedFor = `${source}:${subKey}`;

          // Find a previously published target (by flag) else by matching name.
          const indexEntry =
            pack.index.find(
              (e) =>
                foundry.utils.getProperty(
                  e,
                  `flags.${MODULE_ID}.publishedFor`,
                ) === publishedFor,
            ) || pack.index.find((e) => e.name === editable.name);

          let target = indexEntry
            ? await pack.getDocument(indexEntry._id)
            : null;

          if (target) {
            const existingIds = [...target.results].map((r) => r.id);
            if (existingIds.length) {
              await target.deleteEmbeddedDocuments("TableResult", existingIds);
            }
            if (deduped.length) {
              await target.createEmbeddedDocuments(
                "TableResult",
                deduped.map((d) => {
                  const clone = { ...d };
                  delete clone._id;
                  return clone;
                }),
              );
            }
            await target.update({
              name: editable.name,
              img: editable.img,
              description: editable.description,
              formula: editable.formula,
              [`flags.${MODULE_ID}.publishedFor`]: publishedFor,
              [`flags.${MODULE_ID}.publishedAt`]: Date.now(),
            });
            await target.normalize();
          } else {
            target = await RollTable.create(
              {
                name: editable.name,
                img: editable.img,
                description: editable.description,
                formula: editable.formula,
                results: deduped.map((d) => {
                  const clone = { ...d };
                  delete clone._id;
                  return clone;
                }),
                flags: {
                  [MODULE_ID]: {
                    publishedFor,
                    publishedAt: Date.now(),
                  },
                },
              },
              { pack: packId },
            );
            await target.normalize();
          }

          await this.#repointSetting(source, subKey, target.uuid);
          report.push({
            source,
            subKey,
            status: "published",
            uuid: target.uuid,
            count: deduped.length,
          });
        } catch (error) {
          report.push({
            source,
            subKey,
            status: "error",
            error: error?.message,
          });
        }
      }
    }

    console.log(
      `${MODULE_ID} | RTM | publishTablesToCompendium(${packId}) report`,
      report,
    );
    ui.notifications?.info(
      game.i18n.localize("STA_TC.RollTableManager.PublishComplete"),
    );
    return report;
  }

  static async listResults(table) {
    return this.listResultsCapped(table, {});
  }

  static getResultCount(table) {
    const results = table?.results;
    if (!results) return 0;
    if (typeof results.size === "number") return results.size;
    if (typeof results.length === "number") return results.length;
    return 0;
  }

  static async listResultsCapped(table, { limit = null } = {}) {
    const output = [];
    const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;

    for (const result of table.results || []) {
      output.push({
        id: result.id,
        name:
          result.name ||
          game.i18n.localize("STA_TC.RollTableManager.UnknownResult"),
        img: result.img || "icons/svg/d20-grey.svg",
        documentUuid: result.documentUuid || "",
        weight: result.weight || 1,
        range: Array.isArray(result.range) ? [...result.range] : null,
        drawn: !!result.drawn,
        valid: !!result.documentUuid,
      });

      if (max && output.length >= max) break;
    }

    return output;
  }

  static async addActorResult(table, actor, { weight = 1 } = {}) {
    if (!actor?.uuid) {
      throw new Error(
        game.i18n.localize("STA_TC.RollTableManager.Errors.ActorRequired"),
      );
    }

    const type = CONST.TABLE_RESULT_TYPES?.DOCUMENT || "document";
    const [created] = await table.createEmbeddedDocuments("TableResult", [
      {
        type,
        name: actor.name,
        img: actor.img || "icons/svg/d20-grey.svg",
        description: "",
        documentUuid: actor.uuid,
        weight: Math.max(1, Number(weight) || 1),
        range: [1, 1],
        drawn: false,
      },
    ]);

    await table.normalize();
    return created;
  }

  static buildUsedRecord({ result, table, source, subKey, origin = "manual" }) {
    const snapshot = result.toObject();
    return {
      sourceActorUuid: result.documentUuid || "",
      resultName: result.name || "",
      resultImg: result.img || "",
      tableUuid: table.uuid,
      subKey,
      weight: result.weight || 1,
      resultSnapshot: snapshot,
      movedAt: Date.now(),
      origin,
      source,
    };
  }

  static async removeResultToUsedRecord(
    table,
    resultId,
    { source, subKey, origin = "manual" },
  ) {
    const result = table.results.get(resultId);
    if (!result) {
      throw new Error(
        game.i18n.localize("STA_TC.RollTableManager.Errors.ResultNotFound"),
      );
    }

    const usedRecord = this.buildUsedRecord({
      result,
      table,
      source,
      subKey,
      origin,
    });
    await table.deleteEmbeddedDocuments("TableResult", [result.id]);
    await table.normalize();
    return usedRecord;
  }

  static async restoreUsedRecord(usedRecord) {
    const table = await fromUuid(usedRecord.tableUuid);
    if (!table) {
      throw new Error(
        game.i18n.localize("STA_TC.RollTableManager.Errors.TableNotFound"),
      );
    }

    const snapshot = foundry.utils.deepClone(usedRecord.resultSnapshot || {});
    delete snapshot._id;
    snapshot.drawn = false;

    await table.createEmbeddedDocuments("TableResult", [snapshot]);
    await table.normalize();
    return table;
  }

  static getUsedKey(source) {
    return this.getSourceConfig(source).usedKey;
  }

  static async appendUsedRecord(tracker, source, usedRecord) {
    const usedKey = this.getUsedKey(source);
    const list = foundry.utils.deepClone(tracker.system[usedKey] || []);
    list.unshift(usedRecord);
    await tracker.update({ [`system.${usedKey}`]: list });
  }

  static async removeUsedRecordAtIndex(tracker, source, index) {
    const usedKey = this.getUsedKey(source);
    const list = foundry.utils.deepClone(tracker.system[usedKey] || []);
    if (index < 0 || index >= list.length) return;
    list.splice(index, 1);
    await tracker.update({ [`system.${usedKey}`]: list });
  }

  /**
   * Return whether the table has auto-move-to-used-on-draw enabled.
   * @param {RollTable} table
   * @returns {boolean}
   */
  static getAutoMoveOnDraw(table) {
    return !!table?.getFlag?.(MODULE_ID, "autoMoveOnDraw");
  }

  /**
   * Set the auto-move-to-used-on-draw flag on a table.
   * @param {RollTable} table
   * @param {boolean} value
   */
  static async setAutoMoveOnDraw(table, value) {
    await table.setFlag(MODULE_ID, "autoMoveOnDraw", !!value);
  }

  /**
   * Find which source and subKey the given table UUID is configured for.
   * Returns null if the table is not managed by the RTM.
   * @param {string} tableUuid
   * @returns {{source: string, subKey: string}|null}
   */
  static findSourceForTable(tableUuid) {
    if (!tableUuid) return null;
    for (const [source, config] of Object.entries(SOURCE_CONFIG)) {
      for (const [subKey, settingKey] of Object.entries(
        config.settingBySubKey,
      )) {
        try {
          if (game.settings.get(MODULE_ID, settingKey) === tableUuid)
            return { source, subKey };
        } catch {
          // Setting may not exist yet during early init.
        }
      }
    }
    return null;
  }

  /**
   * Auto-move drawn results to the Used section.
   * Called from the drawRollTable hook when autoMoveOnDraw is enabled.
   * @param {RollTable} table
   * @param {TableResult[]} drawnResults
   */
  static async handleAutoMoveOnDraw(table, drawnResults) {
    if (!game.user?.isGM) return;
    if (!Array.isArray(drawnResults) || drawnResults.length === 0) return;

    const entry = this.findSourceForTable(table.uuid);
    if (!entry) return;
    const { source, subKey } = entry;

    const tracker = await this.getTracker(null);
    if (!tracker) return;

    const resultIds = [];
    const usedRecords = [];
    for (const result of drawnResults) {
      if (!table.results.has(result.id)) continue;
      usedRecords.push(
        this.buildUsedRecord({ result, table, source, subKey, origin: "draw" }),
      );
      resultIds.push(result.id);
    }

    if (!resultIds.length) return;

    await table.deleteEmbeddedDocuments("TableResult", resultIds);
    await table.normalize();

    const usedKey = this.getUsedKey(source);
    const list = foundry.utils.deepClone(tracker.system[usedKey] || []);
    for (const record of usedRecords) {
      list.unshift(record);
    }
    await tracker.update({ [`system.${usedKey}`]: list });
  }

  static async getTracker(preferredTracker) {
    if (preferredTracker) return preferredTracker;

    const configuredUuid = game.settings.get(MODULE_ID, "worldCampaignTracker");
    if (configuredUuid) {
      const tracker = await fromUuid(configuredUuid);
      if (tracker) return tracker;
    }

    return (
      game.actors.find((a) => a.type === `${MODULE_ID}.campaignTracker`) || null
    );
  }

  static async ensureTrackerQueues(tracker) {
    const updates = {};
    if (!Array.isArray(tracker.system.usedPoiResults)) {
      updates["system.usedPoiResults"] = [];
    }
    if (!Array.isArray(tracker.system.usedAssetResults)) {
      updates["system.usedAssetResults"] = [];
    }
    if (!Array.isArray(tracker.system.usedProgressionResults)) {
      updates["system.usedProgressionResults"] = [];
    }
    if (!Array.isArray(tracker.system.usedEscalationResults)) {
      updates["system.usedEscalationResults"] = [];
    }
    if (!Array.isArray(tracker.system.usedEventResults)) {
      updates["system.usedEventResults"] = [];
    }
    if (Object.keys(updates).length) {
      await tracker.update(updates);
    }
  }

  static async inferCompendium(source, table) {
    const settingKey = this.getSourceConfig(source).actorSettingKey;
    if (!settingKey) return "";
    const configured = game.settings.get(MODULE_ID, settingKey) || "";
    if (configured) return configured;

    const actorUuids = (table.results || [])
      .map((r) => r.documentUuid || "")
      .filter(Boolean);

    for (const uuid of actorUuids) {
      const match = /^Compendium\.([^.]+\.[^.]+)\./.exec(uuid);
      if (match?.[1]) return match[1];
    }

    return "";
  }

  static #findCompendiumFolder(pack, name, parentId = null) {
    const folders = pack?.folders;
    if (!folders) return null;
    return (
      folders.find(
        (f) =>
          f.type === "Actor" &&
          f.name === name &&
          (f.folder?.id || null) === parentId,
      ) || null
    );
  }

  static async #createCompendiumFolder(pack, { name, parentId = null, color }) {
    const [created] =
      await foundry.documents.Folder.implementation.createDocuments(
        [
          {
            name,
            type: "Actor",
            folder: parentId,
            ...(color ? { color } : {}),
          },
        ],
        { pack: pack.collection },
      );
    return created || null;
  }

  static async #getOrCreateCompendiumFolder(
    pack,
    { name, parentId = null, color },
  ) {
    const existing = this.#findCompendiumFolder(pack, name, parentId);
    if (existing) return existing;
    return this.#createCompendiumFolder(pack, { name, parentId, color });
  }

  static async #getOrCreateCompendiumActorFolder(pack, { source, subKey }) {
    const layout = this.COMPENDIUM_FOLDER_LAYOUT[source];
    if (!layout) return null;

    const childName = layout.children[subKey];
    if (!childName) return null;

    // Ensure folder metadata is loaded for lookups and parent/child linking.
    await pack.getIndex();

    const root = await this.#getOrCreateCompendiumFolder(pack, {
      name: layout.root.name,
      parentId: null,
      color: layout.root.color,
    });
    if (!root) return null;

    return this.#getOrCreateCompendiumFolder(pack, {
      name: childName,
      parentId: root.id,
    });
  }

  static #normalizeActorSubKey(source, rawSubKey) {
    const value = String(rawSubKey || "");
    if (!value) return null;
    const valid = Object.keys(this.getSourceConfig(source).settingBySubKey);
    return valid.includes(value) ? value : null;
  }

  static #classifyCompendiumActor(indexEntry) {
    if (!indexEntry) return null;
    const type = String(indexEntry.type || "");

    if (type === this.getSourceConfig("asset").actorType) {
      const subKey = this.#normalizeActorSubKey(
        "asset",
        foundry.utils.getProperty(indexEntry, "system.assetType"),
      );
      return subKey ? { source: "asset", subKey } : null;
    }

    if (type === this.getSourceConfig("poi").actorType) {
      const subKey = this.#normalizeActorSubKey(
        "poi",
        foundry.utils.getProperty(indexEntry, "system.poiType"),
      );
      return subKey ? { source: "poi", subKey } : null;
    }

    return null;
  }

  static #collectConfiguredActorPackIds() {
    const ids = new Set();
    for (const source of Object.keys(SOURCE_CONFIG)) {
      const key = SOURCE_CONFIG[source].actorSettingKey;
      if (!key) continue;
      const packId = String(game.settings.get(MODULE_ID, key) || "").trim();
      if (packId) ids.add(packId);
    }
    return [...ids];
  }

  /**
   * Move existing Tactical Campaign actors in one or more Actor compendiums
   * into the standard folder hierarchy used by the Roll Table Manager:
   * - Assets > Character/Starship/Resource Assets
   * - Points of Interest > Exploration/Routine/Tactical Threat/Unknown
   *
   * By default, this targets pack ids configured in module settings
   * (`assetActorCompendium`, `poiActorCompendium`). You can also target a
   * specific pack or explicit list of pack ids.
   *
   * @param {object} [options]
   * @param {string} [options.packId]                 Optional single Actor pack id.
   * @param {string[]} [options.packIds]              Optional Actor pack ids.
   * @param {boolean} [options.dryRun=false]          When true, no updates are written.
   * @returns {Promise<object[]>}                     Per-pack migration report.
   */
  static async migrateCompendiumActorsToFolders({
    packId = "",
    packIds = [],
    dryRun = false,
  } = {}) {
    if (!game.user?.isGM) {
      ui.notifications?.warn(
        game.i18n.localize("STA_TC.RollTableManager.Errors.GmOnly"),
      );
      return [];
    }

    const targets = new Set();
    if (packId) targets.add(String(packId).trim());
    if (Array.isArray(packIds)) {
      for (const id of packIds) {
        const clean = String(id || "").trim();
        if (clean) targets.add(clean);
      }
    }
    if (!targets.size) {
      for (const configured of this.#collectConfiguredActorPackIds()) {
        targets.add(configured);
      }
    }

    const report = [];
    for (const targetPackId of targets) {
      const pack = game.packs.get(targetPackId);
      if (!pack) {
        report.push({ packId: targetPackId, status: "missing-pack" });
        continue;
      }
      if (pack.documentName !== "Actor") {
        report.push({
          packId: targetPackId,
          status: "wrong-pack-type",
          documentName: pack.documentName,
        });
        continue;
      }
      if (pack.locked && !dryRun) {
        report.push({ packId: targetPackId, status: "locked" });
        continue;
      }

      const index = await pack.getIndex({
        fields: [
          "name",
          "type",
          "folder",
          "system.poiType",
          "system.assetType",
        ],
      });

      const updates = [];
      let eligible = 0;
      let alreadyCorrect = 0;
      let skippedUnknownType = 0;
      let skippedMissingSubType = 0;

      for (const entry of index) {
        const classification = this.#classifyCompendiumActor(entry);
        if (!classification) {
          const isTcType =
            entry.type === this.getSourceConfig("asset").actorType ||
            entry.type === this.getSourceConfig("poi").actorType;
          if (isTcType) skippedMissingSubType += 1;
          else skippedUnknownType += 1;
          continue;
        }

        eligible += 1;
        const folder = await this.#getOrCreateCompendiumActorFolder(pack, {
          source: classification.source,
          subKey: classification.subKey,
        });
        if (!folder) {
          skippedMissingSubType += 1;
          continue;
        }

        const currentFolder = entry.folder || null;
        if (currentFolder === folder.id) {
          alreadyCorrect += 1;
          continue;
        }

        updates.push({ _id: entry._id, folder: folder.id });
      }

      if (updates.length && !dryRun) {
        await pack.documentClass.updateDocuments(updates, {
          pack: pack.collection,
        });
      }

      report.push({
        packId: targetPackId,
        status: dryRun ? "dry-run" : "migrated",
        eligible,
        moved: updates.length,
        alreadyCorrect,
        skippedUnknownType,
        skippedMissingSubType,
      });
    }

    console.log(
      `${MODULE_ID} | RTM | migrateCompendiumActorsToFolders report`,
      report,
    );

    if (!report.length) {
      ui.notifications?.warn(
        `${MODULE_ID} | No target actor compendium packs configured.`,
      );
    } else {
      const movedTotal = report.reduce(
        (sum, r) => sum + Number(r.moved || 0),
        0,
      );
      ui.notifications?.info(
        `${MODULE_ID} | Compendium actor folder migration complete (${movedTotal} moved).`,
      );
    }

    return report;
  }

  /**
   * Add a plain text result to a table (used for non-actor-backed sources like
   * Progression/Escalation where there is no associated actor compendium).
   */
  static async createTextResult({ name, table }) {
    const [created] = await table.createEmbeddedDocuments("TableResult", [
      {
        type: CONST.TABLE_RESULT_TYPES?.TEXT ?? 0,
        text: name,
        name,
        img: "icons/svg/d20-grey.svg",
        weight: 1,
        range: [1, 1],
        drawn: false,
      },
    ]);
    await table.normalize();
    return created;
  }

  /** True when source links to Item documents rather than Actors. */
  static isItemBasedSource(source) {
    return !!this.getSourceConfig(source).itemSettingKey;
  }

  /**
   * Infer the Item compendium pack ID for item-based sources (Progression/
   * Escalation). Checks the configured setting first, then falls back to
   * scanning existing table result UUIDs for an Item compendium.
   */
  static async inferItemCompendium(source, table) {
    const config = this.getSourceConfig(source);
    const settingKey = config.itemSettingKey;
    if (!settingKey) return "";
    const configured = game.settings.get(MODULE_ID, settingKey) || "";
    if (configured) return configured;

    // Fall back: scan table results for Compendium Item UUIDs
    const itemUuids = (table?.results || [])
      .map((r) => r.documentUuid || "")
      .filter(Boolean);
    for (const uuid of itemUuids) {
      const match = /^Compendium\.([^.]+\.[^.]+)\.Item\./.exec(uuid);
      if (match?.[1]) return match[1];
    }
    return "";
  }

  /**
   * Create a new Progression item in the configured item compendium and
   * immediately add it as a document result in the given table.
   */
  static async createItemQuick({ name, source, table, folderId = null }) {
    const config = this.getSourceConfig(source);
    const packId = await this.inferItemCompendium(source, table);
    if (!packId) {
      throw new Error(
        game.i18n.localize("STA_TC.RollTableManager.Errors.CompendiumMissing"),
      );
    }
    const pack = game.packs.get(packId);
    if (!pack) {
      throw new Error(
        game.i18n.localize("STA_TC.RollTableManager.Errors.CompendiumNotFound"),
      );
    }
    const categoryKey = (config.itemCategoryField || "").replace("system.", "");
    const data = {
      name,
      type: config.itemType,
      img: "icons/svg/d20-grey.svg",
      system: categoryKey ? { [categoryKey]: config.itemCategoryValue } : {},
      ...(folderId ? { folder: folderId } : {}),
    };
    const item = await pack.documentClass.create(data, {
      pack: pack.metadata.id,
    });
    // Reuse addActorResult — it works for any document UUID
    await this.addActorResult(table, item);
    return item;
  }

  static async createActorQuick({
    name,
    source,
    subKey,
    table,
    folderId = null,
  }) {
    const packId = await this.inferCompendium(source, table);
    if (!packId) {
      throw new Error(
        game.i18n.localize("STA_TC.RollTableManager.Errors.CompendiumMissing"),
      );
    }

    const pack = game.packs.get(packId);
    if (!pack) {
      throw new Error(
        game.i18n.localize("STA_TC.RollTableManager.Errors.CompendiumNotFound"),
      );
    }

    const actorType = this.getSourceConfig(source).actorType;
    // Use the explicit folder when the RTM filter is set, otherwise
    // fall back to the automatic folder layout.
    let resolvedFolder = null;
    if (folderId) {
      resolvedFolder = pack.folders?.get(folderId) ?? null;
    } else {
      resolvedFolder = await this.#getOrCreateCompendiumActorFolder(pack, {
        source,
        subKey,
      });
    }
    const data = {
      name,
      type: actorType,
      img: "icons/svg/mystery-man.svg",
      ...(resolvedFolder ? { folder: resolvedFolder.id } : {}),
      system:
        source === "poi"
          ? { poiType: subKey }
          : { assetType: subKey === "ship" ? "ship" : subKey },
    };

    const actor = await pack.documentClass.create(data, {
      pack: pack.metadata.id,
    });
    await this.addActorResult(table, actor);
    return actor;
  }

  static async deleteActorWithWarning(actorUuid, { force = false } = {}) {
    const actor = await fromUuid(actorUuid);
    if (!actor) return;

    const warnings = [];
    for (const tracker of game.actors.filter(
      (a) => a.type === `${MODULE_ID}.campaignTracker`,
    )) {
      const sys = tracker.system;
      const inAssets =
        (sys.characterAssets || []).includes(actor.uuid) ||
        (sys.shipAssets || []).includes(actor.uuid) ||
        (sys.resourceAssets || []).includes(actor.uuid);
      const inPoiLists = [
        ...(sys.poiListThreat || []),
        ...(sys.poiListExploration || []),
        ...(sys.poiListRoutine || []),
        ...(sys.poiListUnknown || []),
      ].some(
        (e) =>
          e.actorUuid === actor.uuid ||
          e.asset1Uuid === actor.uuid ||
          e.asset2Uuid === actor.uuid,
      );
      if (inAssets || inPoiLists) {
        warnings.push(tracker.name);
      }
    }

    if (warnings.length && !force) {
      throw new Error(
        game.i18n.format("STA_TC.RollTableManager.Errors.ActorReferenced", {
          trackers: warnings.join(", "),
        }),
      );
    }

    await actor.delete();
  }

  static async drawTimeMoveResultToUsed({ tracker, subKey, sourceActorUuid }) {
    const table = await this.loadEditableTable("poi", subKey);
    const match = (table.results || []).find(
      (r) => (r.documentUuid || "") === (sourceActorUuid || ""),
    );
    if (!match) return false;

    const usedRecord = await this.removeResultToUsedRecord(table, match.id, {
      source: "poi",
      subKey,
      origin: "draw",
    });

    await this.appendUsedRecord(tracker, "poi", usedRecord);
    return true;
  }

  /**
   * Keep an actor's roll-table membership in sync with its type. When a POI or
   * Asset actor changes sub-type (e.g. unknown → routine), move its result from
   * the old type's table to the new type's table. No-op if the actor isn't in
   * any of its source's tables.
   * @param {Actor} actor
   */
  static async syncActorTableMembership(actor) {
    const source =
      actor?.type === `${MODULE_ID}.poi`
        ? "poi"
        : actor?.type === `${MODULE_ID}.asset`
          ? "asset"
          : null;
    if (!source) return;

    const newSubKey =
      source === "poi" ? actor.system?.poiType : actor.system?.assetType;
    if (!newSubKey) return;

    const subKeys = Object.keys(SOURCE_CONFIG[source].settingBySubKey);
    for (const subKey of subKeys) {
      if (subKey === newSubKey) continue;

      let oldTable;
      try {
        oldTable = await this.loadEditableTable(source, subKey);
      } catch {
        continue;
      }

      const result = [...oldTable.results].find(
        (r) => (r.documentUuid || "") === actor.uuid,
      );
      if (!result) continue;

      await oldTable.deleteEmbeddedDocuments("TableResult", [result.id]);
      await oldTable.normalize();

      let newTable;
      try {
        newTable = await this.loadEditableTable(source, newSubKey);
      } catch {
        return;
      }
      const already = [...newTable.results].some(
        (r) => (r.documentUuid || "") === actor.uuid,
      );
      if (!already) await this.addActorResult(newTable, actor);
      return;
    }
  }
}
