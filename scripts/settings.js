/**
 * Settings registration for STA Tactical Campaign
 * Registers world settings for POI generator table and template actor UUIDs
 */

const MODULE_ID = "sta-tactical-campaign";

/**
 * Register all module settings. Called during the "init" hook.
 */
export function registerSettings() {
  // -------------------------------------------------------------------------
  // Rollable Table Settings
  // -------------------------------------------------------------------------

  game.settings.register(MODULE_ID, "tablePoiType", {
    name: "STA_TC.Settings.TablePoiType",
    hint: "STA_TC.Settings.TablePoiTypeHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, "tableTacticalThreat", {
    name: "STA_TC.Settings.TableTacticalThreat",
    hint: "STA_TC.Settings.TableTacticalThreatHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, "tableExploration", {
    name: "STA_TC.Settings.TableExploration",
    hint: "STA_TC.Settings.TableExplorationHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, "tableRoutine", {
    name: "STA_TC.Settings.TableRoutine",
    hint: "STA_TC.Settings.TableRoutineHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, "tableUnknown", {
    name: "STA_TC.Settings.TableUnknown",
    hint: "STA_TC.Settings.TableUnknownHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  // -------------------------------------------------------------------------
  // Asset Generator – Rollable Table Settings
  // -------------------------------------------------------------------------

  game.settings.register(MODULE_ID, "tableAssetCharacter", {
    name: "STA_TC.Settings.TableAssetCharacter",
    hint: "STA_TC.Settings.TableAssetCharacterHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, "tableAssetShip", {
    name: "STA_TC.Settings.TableAssetShip",
    hint: "STA_TC.Settings.TableAssetShipHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, "tableAssetResource", {
    name: "STA_TC.Settings.TableAssetResource",
    hint: "STA_TC.Settings.TableAssetResourceHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  // -------------------------------------------------------------------------
  // Campaign Tracker Settings
  // -------------------------------------------------------------------------

  game.settings.register(MODULE_ID, "worldCampaignTracker", {
    name: "STA_TC.Settings.WorldCampaignTracker",
    hint: "STA_TC.Settings.WorldCampaignTrackerHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  // -------------------------------------------------------------------------
  // Campaign Turn Wizard – Rollable Table Settings
  // -------------------------------------------------------------------------

  game.settings.register(MODULE_ID, "tableEvents", {
    name: "STA_TC.Settings.TableEvents",
    hint: "STA_TC.Settings.TableEventsHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, "tableEscalation", {
    name: "STA_TC.Settings.TableEscalation",
    hint: "STA_TC.Settings.TableEscalationHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  // -------------------------------------------------------------------------
  // Converter Settings
  // -------------------------------------------------------------------------

  game.settings.register(MODULE_ID, "primaryPowerMode", {
    name: "STA_TC.Settings.PrimaryPowerMode",
    hint: "STA_TC.Settings.PrimaryPowerModeHint",
    scope: "world",
    config: true,
    type: String,
    default: "random",
    choices: {
      random: "STA_TC.Settings.PrimaryPowerModes.Random",
      highest: "STA_TC.Settings.PrimaryPowerModes.Highest",
      choice: "STA_TC.Settings.PrimaryPowerModes.Choice",
    },
  });
}
