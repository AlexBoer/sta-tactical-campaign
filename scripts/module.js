/**
 * STA Tactical Campaign Module
 * Adds Assets and Points of Interest for Federation-Klingon War Tactical Campaign rules
 */

import { AssetData, PoiData } from "./data-models.js";
import { AssetSheet } from "./sheets/asset-sheet.mjs";
import { PoiSheet } from "./sheets/poi-sheet.mjs";
import { registerSettings } from "./settings.js";
import { PoiGenerator } from "./poi-generator.mjs";
import { AssetGenerator } from "./asset-generator.mjs";
import { ActorConverter } from "./actor-converter.mjs";

const MODULE_ID = "sta-tactical-campaign";

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
  });

  // Register Actor sheets
  registerSheets();

  // Register drag-to-canvas hooks for the POI generator
  PoiGenerator.registerHooks();

  console.log(`${MODULE_ID} | Initialization complete`);
});

/**
 * Register custom Actor sheet classes
 */
function registerSheets() {
  const SheetConfig = foundry.applications.apps.DocumentSheetConfig;

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
}

/**
 * When ready, expose the public API and log module status
 */
Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  module.api = {
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
  };

  console.log(
    `${MODULE_ID} | Module ready – API available at game.modules.get("${MODULE_ID}").api`,
  );
});
