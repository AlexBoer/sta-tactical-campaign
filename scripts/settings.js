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

  game.settings.register(MODULE_ID, "tableAssetType", {
    name: "STA_TC.Settings.TableAssetType",
    hint: "STA_TC.Settings.TableAssetTypeHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

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

  game.settings.register(MODULE_ID, "campaignMomentum", {
    name: "STA_TC.Settings.CampaignMomentum",
    hint: "STA_TC.Settings.CampaignMomentumHint",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
  });

  game.settings.register(MODULE_ID, "campaignThreat", {
    name: "STA_TC.Settings.CampaignThreat",
    hint: "STA_TC.Settings.CampaignThreatHint",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
  });

  game.settings.register(MODULE_ID, "progressionPoints", {
    name: "STA_TC.Settings.ProgressionPoints",
    hint: "STA_TC.Settings.ProgressionPointsHint",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
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
