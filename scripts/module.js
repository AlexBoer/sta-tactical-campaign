/**
 * STA Tactical Campaign Module
 * Adds Assets and Points of Interest for Federation-Klingon War Tactical Campaign rules
 */

import {
  AssetData,
  PoiData,
  CampaignTrackerData,
  EventData,
  ProgressionData,
} from "./data-models.js";
import { AssetSheet } from "./sheets/asset-sheet.mjs";
import { PoiSheet } from "./sheets/poi-sheet.mjs";
import { CampaignTrackerSheet } from "./sheets/campaign-tracker-sheet.mjs";
import { EventSheet } from "./sheets/event-sheet.mjs";
import { ProgressionSheet } from "./sheets/progression-sheet.mjs";
import { registerSettings } from "./settings.js";
import { PoiGenerator } from "./poi-generator.mjs";
import { AssetGenerator } from "./asset-generator.mjs";
import { ActorConverter } from "./actor-converter.mjs";
import { PoiImporter } from "./poi-importer.mjs";
import { PoiExporter } from "./poi-exporter.mjs";
import { RollTableManager } from "./apps/roll-table-manager.mjs";
import { RollTableManagerService } from "./apps/roll-table-manager-service.mjs";
import { DefaultFoldersForm } from "./apps/default-folders-form.mjs";

const MODULE_ID = "sta-tactical-campaign";

/** Default images for new POI actors, keyed by POI type. */
const POI_DEFAULT_IMAGES = {
  tacticalThreat: "icons/svg/combat.svg",
  exploration: "icons/svg/daze.svg",
  routine: "icons/svg/book.svg",
  unknown: "icons/svg/portal.svg",
};

/** Default prototype token tint colors for POI types. */
const POI_DEFAULT_TINTS = {
  tacticalThreat: "#ff3333",
  exploration: "#16eefe",
  routine: "#33f07b",
  unknown: "#9836e7",
};

const POI_TINT_SETTING_BY_TYPE = {
  tacticalThreat: "poiTintTacticalThreat",
  exploration: "poiTintExploration",
  routine: "poiTintRoutine",
  unknown: "poiTintUnknown",
};

function _normalizeHexColor(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toLowerCase() : fallback;
}

function _getPoiTokenTint(poiType) {
  const type = POI_DEFAULT_TINTS[poiType] ? poiType : "unknown";
  const settingKey = POI_TINT_SETTING_BY_TYPE[type];
  const fallback = POI_DEFAULT_TINTS[type];
  const configured = settingKey ? game.settings.get(MODULE_ID, settingKey) : "";
  return _normalizeHexColor(configured, fallback);
}

function _gpuDebugCount(metric, delta = 1) {
  globalThis.__staGpuDebugCollector?.count?.(MODULE_ID, metric, delta);
}

function _gpuDebugTime(metric, ms) {
  globalThis.__staGpuDebugCollector?.time?.(MODULE_ID, metric, ms);
}

/** Return all CampaignTracker actors in the world. */
function _getTrackers() {
  return game.actors.filter((a) => a.type === `${MODULE_ID}.campaignTracker`);
}

/**
 * Initialize the module
 */
Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing STA Tactical Campaign module`);

  // Register module settings (table UUIDs, template actors)
  registerSettings();

  // Register data models for custom Actor types
  Object.assign(CONFIG.Actor.dataModels, {
    [`${MODULE_ID}.asset`]: AssetData,
    [`${MODULE_ID}.poi`]: PoiData,
    [`${MODULE_ID}.campaignTracker`]: CampaignTrackerData,
  });

  // Register data models for custom Item types
  Object.assign(CONFIG.Item.dataModels, {
    [`${MODULE_ID}.event`]: EventData,
    [`${MODULE_ID}.progression`]: ProgressionData,
  });

  // Register Actor sheets
  registerSheets();

  // Register drag-to-canvas hooks for the POI generator
  PoiGenerator.registerHooks();

  // Register custom status effects so token icons appear when AEs are applied
  CONFIG.statusEffects.push(
    {
      id: "sta-tc.lost",
      name: "STA_TC.Status.Lost",
      img: "icons/svg/skull.svg",
    },
    {
      id: "sta-tc.unavailable",
      name: "STA_TC.Status.Unavailable",
      img: "icons/svg/sleep.svg",
    },
  );

  console.log(`${MODULE_ID} | Initialization complete`);

  // Register custom Handlebars helpers
  Handlebars.registerHelper("strlen", (str) =>
    typeof str === "string" ? str.length : 0,
  );
});

/**
 * Register custom Actor sheet classes
 */
function registerSheets() {
  const SheetConfig = foundry.applications.apps.DocumentSheetConfig;

  // Register Event item sheet
  SheetConfig.registerSheet(Item, MODULE_ID, EventSheet, {
    types: [`${MODULE_ID}.event`],
    label: game.i18n.localize("STA_TC.Sheets.Event"),
    makeDefault: true,
  });

  // Register Progression item sheet
  SheetConfig.registerSheet(Item, MODULE_ID, ProgressionSheet, {
    types: [`${MODULE_ID}.progression`],
    label: game.i18n.localize("STA_TC.Sheets.Progression"),
    makeDefault: true,
  });

  // Register Asset sheet
  SheetConfig.registerSheet(Actor, MODULE_ID, AssetSheet, {
    types: [`${MODULE_ID}.asset`],
    label: game.i18n.localize("STA_TC.Sheets.Asset"),
    makeDefault: true,
  });

  // Register Point of Interest sheet
  SheetConfig.registerSheet(Actor, MODULE_ID, PoiSheet, {
    types: [`${MODULE_ID}.poi`],
    label: game.i18n.localize("STA_TC.Sheets.PointOfInterest"),
    makeDefault: true,
  });

  // Register Campaign Tracker sheet
  SheetConfig.registerSheet(Actor, MODULE_ID, CampaignTrackerSheet, {
    types: [`${MODULE_ID}.campaignTracker`],
    label: game.i18n.localize("STA_TC.Sheets.CampaignTracker"),
    makeDefault: true,
  });
}

/**
 * When ready, expose the public API and log module status
 */
Hooks.once("ready", () => {
  const moduleInstance = game.modules.get(MODULE_ID);
  if (!moduleInstance) {
    console.error(
      `${MODULE_ID} | Failed to register API: module not found in game.modules.`,
    );
    return;
  }

  const api = {
    /**
     * Generate a Point of Interest by rolling on the configured tables.
     * Posts the result to chat with drag-to-canvas buttons.
     * @returns {Promise<{typeResult: object, subResult: object, subTableKey: string}|null>}
     */
    generatePoi: () => PoiGenerator.generate(),

    /**
     * Generate an Asset by rolling on the configured tables.
     * Posts the resolved actor to chat.
     * @returns {Promise<{typeResult: object, subResult: object, subTableKey: string, actor: Actor|null}|null>}
     */
    generateAsset: () => AssetGenerator.generate(),

    /** Direct access to the PoiGenerator class for advanced usage. */
    PoiGenerator,

    /** Direct access to the AssetGenerator class for advanced usage. */
    AssetGenerator,

    /**
     * Convert an STA character or ship actor into a Tactical Campaign asset.
     * Prompts the user to select an actor (or uses the selected token).
     * @returns {Promise<Actor|null>}
     */
    convertActor: () => ActorConverter.convert(),

    /**
     * Convert all eligible actors in a folder into assets in a new folder.
     * Prompts the user to select a source folder.
     * @returns {Promise<Actor[]>}
     */
    convertFolder: () => ActorConverter.convertFolder(),

    /** Direct access to the ActorConverter class for advanced usage. */
    ActorConverter,

    /**
     * Import POIs into a new folder.
     *
     * Usage:
     * - importPois() opens a paste dialog
     * - importPois(text) imports newline-delimited entries or JSON array text
     * - importPois(strings) imports an array of key-value entries
     *
     * @param {string[]|string} [input]
     * @param {object}          [options]
     * @param {string}          [options.folderName]  Folder name (defaults to "Imported POIs")
     * @returns {Promise<Folder|null>}
     */
    importPois: (input, options) => {
      if (input == null) return PoiImporter.promptAndImport(options);
      if (Array.isArray(input)) return PoiImporter.import(input, options);
      return PoiImporter.importFromText(String(input), options);
    },

    /**
     * Export POIs to an array of JSON objects.
     *
     * Usage:
     * - exportPois() opens a folder picker dialog, then shows a copy dialog
     * - exportPois(folderOrId) exports directly from a folder instance, ID, or name
     *
     * @param {string|Folder} [folderOrId]
     * @returns {Promise<object[]>|object[]}
     */
    exportPois: (folderOrId) => {
      if (folderOrId == null) return PoiExporter.promptAndExport();
      return PoiExporter.export(folderOrId);
    },

    /** Direct access to the PoiImporter class for advanced usage. */
    PoiImporter,

    /** Direct access to the PoiExporter class for advanced usage. */
    PoiExporter,

    /** Open the unified roll-table manager dialog for a tracker (or world tracker). */
    openRollTableManager: async (tracker) => {
      const resolvedTracker = await RollTableManagerService.getTracker(tracker);
      if (!resolvedTracker) {
        ui.notifications.warn(
          game.i18n.localize("STA_TC.RollTableManager.Errors.NoTracker"),
        );
        return null;
      }
      await RollTableManagerService.ensureTrackerQueues(resolvedTracker);
      return RollTableManager.open(resolvedTracker);
    },

    /**
     * One-time repair/migration for the roll tables used by the POI/Asset
     * generators and the Roll Table Manager. Converts compendium-backed tables
     * into de-duplicated, editable world tables, repoints the settings, and
     * deletes obsolete temporary tables from the previous sync-based design.
     *
     * Run once from the console:
     *   await game.modules.get("sta-tactical-campaign").api.migrateRollTablesToWorld()
     *
     * @returns {Promise<object[]>} Per-table migration report.
     */
    migrateRollTablesToWorld: (options) =>
      RollTableManagerService.migrateRollTablesToWorld(options),

    /**
     * Publish the current editable tables into a compendium pack you control so
     * multiple worlds can share them, and repoint the settings at the
     * compendium tables. Because the mode is derived from where each setting
     * points, repointing at the compendium table makes editing shared.
     *
     * Run from the console (use a pack you own, NOT a shared community pack):
     *   await game.modules.get("sta-tactical-campaign").api
     *     .publishTablesToCompendium("my-module.my-tables")
     *
     * @param {string} packId  Collection id of an unlocked RollTable compendium.
     * @returns {Promise<object[]>} Per-table publish report.
     */
    publishTablesToCompendium: (packId) =>
      RollTableManagerService.publishTablesToCompendium(packId),

    /**
     * Re-folder existing Tactical Campaign actors in Actor compendiums so they
     * match the manager layout (Assets/* and Points of Interest/* groups).
     *
     * By default this uses the configured actor compendium settings. You can
     * optionally target a specific pack or run a dry-run preview.
     *
     * Example:
     *   await game.modules.get("sta-tactical-campaign").api
     *     .migrateCompendiumActorsToFolders({ dryRun: true })
     *
     * @param {object} [options]
     * @param {string} [options.packId]
     * @param {string[]} [options.packIds]
     * @param {boolean} [options.dryRun=false]
     * @returns {Promise<object[]>} Per-pack migration report.
     */
    migrateCompendiumActorsToFolders: (options) =>
      RollTableManagerService.migrateCompendiumActorsToFolders(options),

    /** Direct access to RollTableManagerService for advanced automation. */
    RollTableManagerService,

    /**
     * Open the Default Folders configuration form.
     * Allows GMs to set where new actors/items are created in compendiums.
     */
    showDefaultFoldersForm: () => new DefaultFoldersForm().render(true),

    /** Direct access to DefaultFoldersForm for advanced usage. */
    DefaultFoldersForm,
  };

  moduleInstance.api = api;

  // Macro-friendly global alias in addition to game.modules.get(MODULE_ID).api.
  // Example macro usage: globalThis.STATacticalCampaign.exportPois("My POIs")
  globalThis.STATacticalCampaign = api;

  console.log(
    `${MODULE_ID} | Module ready – API available at game.modules.get("${MODULE_ID}").api`,
  );

  // Ensure new used-result queue fields exist on existing campaign trackers.
  Promise.resolve().then(async () => {
    for (const tracker of _getTrackers()) {
      await RollTableManagerService.ensureTrackerQueues(tracker);
    }
  });
});

/**
 * When any actor is deleted, scrub its UUID from every open campaign tracker
 * so the sheet never gets stuck with stale references.
 */
Hooks.on("deleteActor", async (deletedActor) => {
  const uuid = deletedActor.uuid;
  const poiLists = [
    "poiListThreat",
    "poiListExploration",
    "poiListRoutine",
    "poiListUnknown",
  ];

  for (const tracker of _getTrackers()) {
    const updates = {};
    for (const key of ["characterAssets", "shipAssets", "resourceAssets"]) {
      const list = tracker.system[key] || [];
      if (list.includes(uuid)) {
        updates[`system.${key}`] = list.filter((u) => u !== uuid);
      }
    }

    // Remove POI entries or clear asset slots within them
    for (const listKey of poiLists) {
      const entries = foundry.utils.deepClone(tracker.system[listKey] || []);
      let changed = false;
      const cleaned = entries.filter((entry) => {
        if (entry.actorUuid === uuid) return false; // remove whole POI entry
        if (entry.asset1Uuid === uuid) {
          entry.asset1Uuid = "";
          changed = true;
        }
        if (entry.asset2Uuid === uuid) {
          entry.asset2Uuid = "";
          changed = true;
        }
        return true;
      });
      if (cleaned.length !== entries.length || changed) {
        updates[`system.${listKey}`] = cleaned;
      }
    }

    // Also remove from generated POIs list
    const generated = tracker.system.turnGeneratedPois || [];
    if (generated.includes(uuid)) {
      updates["system.turnGeneratedPois"] = generated.filter((u) => u !== uuid);
    }

    // Clear scenario POI if it was the deleted actor
    if (tracker.system.scenarioPoi === uuid) {
      updates["system.scenarioPoi"] = "";
    }

    if (Object.keys(updates).length) await tracker.update(updates);
  }
});

/**
 * When a POI or asset actor is updated, re-render any open campaign tracker
 * sheets that reference it so changes (power, difficulty, note, type, etc.)
 * are reflected immediately without requiring a manual refresh.
 */
Hooks.on("updateActor", (updatedActor, changed) => {
  const relevantTypes = [`${MODULE_ID}.asset`, `${MODULE_ID}.poi`];
  if (!relevantTypes.includes(updatedActor.type)) return;

  // If the actor's sub-type changed (e.g. POI unknown → routine), move its
  // result from the old type's roll table to the new type's roll table.
  if (game.user?.isGM) {
    const typeChanged =
      updatedActor.type === `${MODULE_ID}.poi`
        ? foundry.utils.hasProperty(changed, "system.poiType")
        : foundry.utils.hasProperty(changed, "system.assetType");
    if (typeChanged) {
      RollTableManagerService.syncActorTableMembership(updatedActor);

      // Keep POI portrait and prototype token art aligned to the selected POI type.
      if (updatedActor.type === `${MODULE_ID}.poi`) {
        const poiType = updatedActor.system?.poiType ?? "unknown";
        const nextImg =
          POI_DEFAULT_IMAGES[poiType] || POI_DEFAULT_IMAGES.unknown;
        const nextTint = _getPoiTokenTint(poiType);
        const actorImg = updatedActor.img;
        const tokenImg = foundry.utils.getProperty(
          updatedActor,
          "prototypeToken.texture.src",
        );
        const tokenTint = foundry.utils.getProperty(
          updatedActor,
          "prototypeToken.texture.tint",
        );

        const updates = {};
        if (actorImg !== nextImg) updates.img = nextImg;
        if (tokenImg !== nextImg)
          updates["prototypeToken.texture.src"] = nextImg;
        if (_normalizeHexColor(tokenTint, "") !== nextTint) {
          updates["prototypeToken.texture.tint"] = nextTint;
        }
        if (Object.keys(updates).length) {
          updatedActor
            .update(updates)
            .catch((err) =>
              console.error(
                `${MODULE_ID} | Failed to synchronize POI image after type change`,
                err,
              ),
            );
        }
      }
    }
  }

  const t0 = performance.now();
  let trackersScanned = 0;
  let trackerRenders = 0;

  const uuid = updatedActor.uuid;
  const poiLists = [
    "poiListThreat",
    "poiListExploration",
    "poiListRoutine",
    "poiListUnknown",
  ];

  for (const tracker of _getTrackers()) {
    trackersScanned += 1;
    const sys = tracker.system;

    // Check asset strip lists
    const inAssets =
      (sys.characterAssets || []).includes(uuid) ||
      (sys.shipAssets || []).includes(uuid) ||
      (sys.resourceAssets || []).includes(uuid);

    // Check POI lists (as POI actor or as assigned asset)
    const inPois = poiLists.some((key) =>
      (sys[key] || []).some(
        (e) =>
          e.actorUuid === uuid ||
          e.asset1Uuid === uuid ||
          e.asset2Uuid === uuid,
      ),
    );

    // Check generated POIs staging list
    const inGenerated = (sys.turnGeneratedPois || []).includes(uuid);

    if (inAssets || inPois || inGenerated) {
      tracker.sheet?.render();
      trackerRenders += 1;
    }
  }

  _gpuDebugCount("hook.updateActor.relevantCalls", 1);
  _gpuDebugCount("hook.updateActor.trackersScanned", trackersScanned);
  _gpuDebugCount("hook.updateActor.trackerRenders", trackerRenders);
  _gpuDebugTime("hook.updateActor.handlerMs", performance.now() - t0);
});

/**
 * Helper: re-render any open campaign tracker sheets that reference the given asset UUID.
 */
function _rerenderTrackersForAsset(actor) {
  if (actor.type !== `${MODULE_ID}.asset`) return;
  const uuid = actor.uuid;
  for (const tracker of _getTrackers()) {
    const sys = tracker.system;
    const inAssets =
      (sys.characterAssets || []).includes(uuid) ||
      (sys.shipAssets || []).includes(uuid) ||
      (sys.resourceAssets || []).includes(uuid);
    if (inAssets) tracker.sheet?.render();
  }
}

/**
 * Helper: re-render any open campaign tracker sheets that reference the given POI UUID.
 */
function _rerenderTrackersForPoi(actor) {
  if (actor.type !== `${MODULE_ID}.poi`) return;
  const uuid = actor.uuid;
  const poiLists = [
    "poiListThreat",
    "poiListExploration",
    "poiListRoutine",
    "poiListUnknown",
  ];
  for (const tracker of _getTrackers()) {
    const sys = tracker.system;
    const inPois = poiLists.some((key) =>
      (sys[key] || []).some((e) => e.actorUuid === uuid),
    );
    const inGenerated = (sys.turnGeneratedPois || []).includes(uuid);
    if (inPois || inGenerated) tracker.sheet?.render();
  }
}

/**
 * When an Active Effect is created on an asset actor, re-render referencing
 * campaign trackers so the unavailable badge updates immediately.
 */
Hooks.on("createActiveEffect", (_effect, _options, _userId) => {
  const parent = _effect.parent;
  if (parent) _rerenderTrackersForAsset(parent);
});

/**
 * When an Active Effect is deleted from an asset actor, re-render referencing
 * campaign trackers so the unavailable badge clears immediately.
 */
Hooks.on("deleteActiveEffect", (_effect, _options, _userId) => {
  const parent = _effect.parent;
  if (parent) _rerenderTrackersForAsset(parent);
});

/**
 * When an Event item is created on a POI actor (e.g. dragged onto the POI
 * sheet), re-render any open campaign tracker sheets that show that POI so
 * the event description and effects badge update immediately.
 */
Hooks.on("createItem", (item, _options, _userId) => {
  const parent = item.parent;
  if (!parent || item.type !== `${MODULE_ID}.event`) return;
  _rerenderTrackersForPoi(parent);
});

/**
 * When an Event item is updated on a POI actor (e.g. its description changes),
 * re-render referencing campaign tracker sheets.
 */
Hooks.on("updateItem", (item, _changes, _options, _userId) => {
  const parent = item.parent;
  if (!parent || item.type !== `${MODULE_ID}.event`) return;
  _rerenderTrackersForPoi(parent);
});

/**
 * When an Event item is removed from a POI actor, re-render referencing
 * campaign tracker sheets so the event description and effects badge clear.
 */
Hooks.on("deleteItem", (item, _options, _userId) => {
  const parent = item.parent;
  if (!parent || item.type !== `${MODULE_ID}.event`) return;
  _rerenderTrackersForPoi(parent);
});

/**
 * Set Campaign Tracker prototype token defaults on creation.
 */
Hooks.on("preCreateActor", (actor, data, _options, _userId) => {
  if (actor.type === `${MODULE_ID}.campaignTracker`) {
    actor.updateSource({ "prototypeToken.actorLink": true });
    return;
  }

  if (
    actor.type === `${MODULE_ID}.poi` ||
    actor.type === `${MODULE_ID}.asset`
  ) {
    actor.updateSource({ "prototypeToken.actorLink": true });
  }

  // Give new POIs a type-appropriate default image (unless a custom one was set).
  if (actor.type === `${MODULE_ID}.poi`) {
    const providedImg = data?.img ?? actor.img;
    const hasCustomImg =
      providedImg && providedImg !== "icons/svg/mystery-man.svg";
    const poiType = data?.system?.poiType ?? actor.system?.poiType ?? "unknown";
    const img = POI_DEFAULT_IMAGES[poiType] || POI_DEFAULT_IMAGES.unknown;
    const tint = _getPoiTokenTint(poiType);
    const sourceUpdates = {
      "prototypeToken.texture.tint": tint,
    };

    if (!hasCustomImg) {
      sourceUpdates.img = img;
      sourceUpdates["prototypeToken.texture.src"] = img;
    }

    actor.updateSource(sourceUpdates);
  }
});

// ─── Conflict Roll Reroll Handling ───────────────────────────────────────────
// When an STA chat card was created by the conflict roll system we intercept
// the ".reroll-button" click.  This lets us (a) show the same dice-picker
// dialog the STA system would show, (b) roll new dice, (c) post the standard
// STA "reroll" chat card for everyone to see, and (d) update the campaign
// tracker advisory data so Pass / Fail is based on the latest dice.

Hooks.on("renderChatMessageHTML", (message, html) => {
  const tcFlag = message.flags?.["sta-tactical-campaign"];
  if (!tcFlag?.poiUuid) return;
  const staFlag = message.flags?.sta;
  if (!["task", "npc"].includes(staFlag?.rollType)) return;

  const rerollBtn = html.querySelector(".reroll-button");
  if (!rerollBtn) return;

  // Attach directly to the button so we fire at the target phase,
  // before STA's delegated bubble-phase listener on the root html element.
  rerollBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    e.preventDefault();
    await _handleConflictReroll(message, tcFlag, staFlag);
  });
});

async function _handleConflictReroll(message, tcFlag, staFlag) {
  const {
    poiUuid,
    trackerActorId,
    primaryTargetNumber,
    primaryFocusRange,
    primaryUsedDetermination,
    assistTargetNumber,
    assistFocusRange,
    assistUsedDetermination,
    hasAssist,
  } = tcFlag;
  const { diceOutcome, shipdiceOutcome, rollType } = staFlag;

  // Build the dice-picker dialog (same format as STA's handleReroll)
  let template = `<div class="dialogue">${game.i18n.localize("sta.roll.rerollwhichresults")}<div class="dice-rolls">`;
  (diceOutcome ?? []).forEach((num, i) => {
    template +=
      `<div><div class="die-image"><li class="roll die d20">${num}</li></div>` +
      `<div class="checkbox-container"><input type="checkbox" name="crewnum" value="${i}"></div></div>`;
  });
  if (hasAssist && (shipdiceOutcome ?? []).length > 0) {
    template += `</div><div class="dice-rolls">`;
    shipdiceOutcome.forEach((num, i) => {
      template +=
        `<div><div class="die-image"><li class="roll die d20">${num}</li></div>` +
        `<div class="checkbox-container"><input type="checkbox" name="shipnum" value="${i}"></div></div>`;
    });
  }
  template += `</div></div>`;

  const formData = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("sta.roll.rerollresults") },
    position: { height: "auto", width: 375 },
    content: template,
    classes: ["dialogue"],
    buttons: [
      {
        action: "roll",
        default: true,
        label: game.i18n.localize("sta.roll.rerollresults"),
        callback: (_e, button, dialog) => {
          const form = dialog.element.querySelector("form");
          return form ? new FormData(form) : null;
        },
      },
    ],
    close: () => null,
  });
  if (!formData) return;

  const crewRerolledIdx = formData.getAll("crewnum").map(Number);
  const crewKept = (diceOutcome ?? []).filter(
    (_, i) => !crewRerolledIdx.includes(i),
  );
  const shipRerolledIdx = formData.getAll("shipnum").map(Number);
  const shipKept = (shipdiceOutcome ?? []).filter(
    (_, i) => !shipRerolledIdx.includes(i),
  );

  // Roll the new dice
  let newCrewDice = [],
    newCrewRoll = null;
  if (crewRerolledIdx.length > 0) {
    newCrewRoll = await new Roll(`${crewRerolledIdx.length}d20`).evaluate();
    newCrewDice = newCrewRoll.dice[0].results.map((r) => r.result);
  }
  let newShipDice = [],
    newShipRoll = null;
  if (hasAssist && shipRerolledIdx.length > 0) {
    newShipRoll = await new Roll(`${shipRerolledIdx.length}d20`).evaluate();
    newShipDice = newShipRoll.dice[0].results.map((r) => r.result);
  }

  const allCrewDice = [...crewKept, ...newCrewDice];
  const allShipDice = hasAssist ? [...shipKept, ...newShipDice] : [];

  // Score dice with our own formula (mirrors _performRoll)
  const _scoreDice = (dice, targetNumber, focusRange) => {
    let successes = 0,
      nat20 = false;
    for (const val of dice) {
      if (val === 20) nat20 = true;
      if (val <= targetNumber) {
        successes += 1;
        if (focusRange > 0 && val <= focusRange) successes += 1;
      }
    }
    return { successes, nat20 };
  };

  const crewScore = _scoreDice(
    allCrewDice,
    primaryTargetNumber,
    primaryFocusRange,
  );
  const shipScore = hasAssist
    ? _scoreDice(allShipDice, assistTargetNumber, assistFocusRange)
    : { successes: 0, nat20: false };
  const detBonus =
    (primaryUsedDetermination ? 2 : 0) + (assistUsedDetermination ? 2 : 0);
  const totalSuccesses = detBonus + crewScore.successes + shipScore.successes;
  const hadNat20 = crewScore.nat20 || shipScore.nat20;

  // Build the STA reroll chat card using STARoll's own helpers
  const staRoll = new STARoll();
  const crewParams = {
    checkTarget: primaryTargetNumber,
    complicationMinimumValue: 20,
    disDepTarget: primaryFocusRange,
    usingFocus: primaryFocusRange > 0,
  };
  const shipParams = {
    checkTarget: assistTargetNumber,
    complicationMinimumValue: 20,
    disDepTarget: assistFocusRange,
    usingFocus: true,
  };

  const crewRetained = await staRoll._taskResult({
    ...crewParams,
    customResults: crewKept,
  });
  const crewRerolledRes = await staRoll._taskResult({
    ...crewParams,
    customResults: newCrewDice,
  });
  const shipRetained = hasAssist
    ? await staRoll._taskResult({ ...shipParams, customResults: shipKept })
    : { diceString: "", complication: 0 };
  const shipRerolledRes = hasAssist
    ? await staRoll._taskResult({ ...shipParams, customResults: newShipDice })
    : { diceString: "", complication: 0 };

  const totalComplications =
    (crewRetained.complication ?? 0) +
    (crewRerolledRes.complication ?? 0) +
    (shipRetained.complication ?? 0) +
    (shipRerolledRes.complication ?? 0);
  const resultText = await staRoll._taskResultText({
    success: totalSuccesses,
    complication: totalComplications,
  });

  await staRoll.sendToChat({
    speakerName: staFlag.speakerName,
    rollType: "reroll",
    originalRollType: rollType,
    flavor: `${staFlag.flavor} ${game.i18n.localize("sta.roll.rerollresults")}`,
    retainedRoll: crewRetained.diceString,
    rerolledRoll: crewRerolledRes.diceString,
    shipretainedRoll: shipRetained.diceString,
    shiprerolledRoll: shipRerolledRes.diceString,
    ...resultText,
    starshipName: staFlag.starshipName,
    flavorship: staFlag.flavorship
      ? `${staFlag.flavorship} ${game.i18n.localize("sta.roll.rerollresults")}`
      : "",
    isTaskReroll: rollType === "task",
    isChallengeReroll: false,
    isNPCReroll: rollType === "npc",
    dice3dRoll: newCrewRoll,
    dice3dshipRoll: newShipRoll,
  });

  // Update the tracker advisory data so Pass / Fail reflects the new dice
  await _updateConflictAdvisory(
    trackerActorId,
    poiUuid,
    totalSuccesses,
    hadNat20,
  );
}

async function _updateConflictAdvisory(
  trackerActorId,
  poiUuid,
  totalSuccesses,
  hadNat20,
) {
  const tracker = game.actors.get(trackerActorId);
  if (!tracker) return;
  for (const listKey of [
    "poiListThreat",
    "poiListExploration",
    "poiListRoutine",
    "poiListUnknown",
  ]) {
    const entries = foundry.utils.deepClone(tracker.system[listKey] || []);
    const idx = entries.findIndex((e) => e.actorUuid === poiUuid);
    if (idx !== -1) {
      entries[idx].conflictSuccesses = totalSuccesses;
      entries[idx].conflictHadNat20 = hadNat20;
      await tracker.update({ [`system.${listKey}`]: entries });
      break;
    }
  }
}
