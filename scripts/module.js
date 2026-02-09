/**
 * STA Tactical Campaign Module
 * Adds Assets and Points of Interest for Federation-Klingon War Tactical Campaign rules
 */

import { AssetData, PoiData } from "./data-models.js";
import { AssetSheet } from "./sheets/asset-sheet.mjs";
import { PoiSheet } from "./sheets/poi-sheet.mjs";

const MODULE_ID = "sta-tactical-campaign";

/**
 * Initialize the module
 */
Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing STA Tactical Campaign module`);

  // Register data models for custom Actor types
  Object.assign(CONFIG.Actor.dataModels, {
    [`${MODULE_ID}.asset`]: AssetData,
    [`${MODULE_ID}.poi`]: PoiData,
  });

  // Register Actor sheets
  registerSheets();

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
 * When ready, log module status
 */
Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Module ready`);
});
