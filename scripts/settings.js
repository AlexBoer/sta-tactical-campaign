/**
 * Settings registration for STA Tactical Campaign
 * Registers world settings for POI generator table and template actor UUIDs
 */

const MODULE_ID = "sta-tactical-campaign";

/**
 * Register all module settings. Called during the "init" hook.
 */
export async function registerSettings() {
  // Import the DefaultFoldersForm for the menu
  const { DefaultFoldersForm } =
    await import("./apps/default-folders-form.mjs");

  // -------------------------------------------------------------------------
  // Settings Menu
  // -------------------------------------------------------------------------

  game.settings.registerMenu(MODULE_ID, "defaultFoldersMenu", {
    name: "STA_TC.Settings.DefaultFolders",
    label: "STA_TC.Settings.DefaultFolders",
    hint: "STA_TC.Settings.DefaultFoldersHint",
    icon: "fas fa-folder",
    type: DefaultFoldersForm,
    restricted: true,
  });

  // -------------------------------------------------------------------------
  // Rollable Table Settings
  // -------------------------------------------------------------------------

  // Stores default compendium folder IDs per source:tab (e.g. "poi:tacticalThreat")
  // so newly-created items/actors always land in the configured folder.
  // Hidden from the config UI — managed via the Default Folders form.
  game.settings.register(MODULE_ID, "folderDefaults", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

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

  game.settings.register(MODULE_ID, "rollTableManagerMode", {
    name: "STA_TC.Settings.RollTableManagerMode",
    hint: "STA_TC.Settings.RollTableManagerModeHint",
    scope: "world",
    config: true,
    type: String,
    default: "instant",
    choices: {
      instant: "STA_TC.Settings.RollTableManagerModes.Instant",
      manual: "STA_TC.Settings.RollTableManagerModes.Manual",
    },
  });

  game.settings.register(MODULE_ID, "progressionItemCompendium", {
    name: "STA_TC.Settings.ProgressionItemCompendium",
    hint: "STA_TC.Settings.ProgressionItemCompendiumHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, "eventItemCompendium", {
    name: "STA_TC.Settings.EventItemCompendium",
    hint: "STA_TC.Settings.EventItemCompendiumHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, "poiActorCompendium", {
    name: "STA_TC.Settings.PoiActorCompendium",
    hint: "STA_TC.Settings.PoiActorCompendiumHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, "assetActorCompendium", {
    name: "STA_TC.Settings.AssetActorCompendium",
    hint: "STA_TC.Settings.AssetActorCompendiumHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings.register(MODULE_ID, "poiTintTacticalThreat", {
    name: "STA_TC.Settings.PoiTintTacticalThreat",
    hint: "STA_TC.Settings.PoiTintTacticalThreatHint",
    scope: "world",
    config: true,
    type: String,
    default: "#ff3333",
  });

  game.settings.register(MODULE_ID, "poiTintExploration", {
    name: "STA_TC.Settings.PoiTintExploration",
    hint: "STA_TC.Settings.PoiTintExplorationHint",
    scope: "world",
    config: true,
    type: String,
    default: "#16eefe",
  });

  game.settings.register(MODULE_ID, "poiTintRoutine", {
    name: "STA_TC.Settings.PoiTintRoutine",
    hint: "STA_TC.Settings.PoiTintRoutineHint",
    scope: "world",
    config: true,
    type: String,
    default: "#33f07b",
  });

  game.settings.register(MODULE_ID, "poiTintUnknown", {
    name: "STA_TC.Settings.PoiTintUnknown",
    hint: "STA_TC.Settings.PoiTintUnknownHint",
    scope: "world",
    config: true,
    type: String,
    default: "#9836e7",
  });

  // -------------------------------------------------------------------------
  // Campaign Turn Wizard – Rollable Table Settings
  // -------------------------------------------------------------------------

  game.settings.register(MODULE_ID, "tableProgression", {
    name: "STA_TC.Settings.TableProgression",
    hint: "STA_TC.Settings.TableProgressionHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

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

  game.settings.register(MODULE_ID, "automationNotifications", {
    name: "STA_TC.Settings.AutomationNotifications",
    hint: "STA_TC.Settings.AutomationNotificationsHint",
    scope: "world",
    config: true,
    type: String,
    default: "important",
    choices: {
      all: "STA_TC.Settings.AutomationNotificationModes.All",
      important: "STA_TC.Settings.AutomationNotificationModes.Important",
      chatOnly: "STA_TC.Settings.AutomationNotificationModes.ChatOnly",
      off: "STA_TC.Settings.AutomationNotificationModes.Off",
    },
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
