/**
 * Campaign Tracker Sheet for STA Tactical Campaign
 * ApplicationV2-based sheet. Turn state lives entirely in the data model
 * (system.turnPhase, system.scenarioPoi, per-POI entry fields) rather than
 * in actor flags.  The progress bar and phase-gated actions are the core UX.
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

import { PoiGenerator } from "../poi-generator.mjs";
import { AssetGenerator } from "../asset-generator.mjs";
import { EventEffectResolver } from "../apps/event-effect-resolver.mjs";
import { ProgressionLog } from "../apps/progression-log.mjs";
import { ProgressionPowerDialog } from "../apps/progression-power-dialog.mjs";

/**
 * Hardcoded d20 progression table.  Index 0 = roll of 1, index 19 = roll of 20.
 * `saved: true` → create a Progression Log item for later activation.
 * `saved: false` → apply automation immediately and/or post a chat reminder.
 */
const PROGRESSION_TABLE = [
  { type: "shipRefit", saved: false },
  { type: "newAsset", saved: false },
  { type: "favorOwed", saved: true },
  { type: "allyGained", saved: true },
  { type: "lullFighting", saved: true },
  { type: "shipUpgrades", saved: false },
  { type: "trainingCourse", saved: false },
  { type: "federationResources", saved: false },
  { type: "carefulPlanning", saved: true },
  { type: "reconfiguration", saved: false },
  { type: "characterJoins", saved: false },
  { type: "emergencyAid", saved: true },
  { type: "newShip", saved: false },
  { type: "damageControl", saved: true },
  { type: "adaptingCircumstances", saved: false },
  { type: "flexibleDeployments", saved: true },
  { type: "miraculousEscape", saved: true },
  { type: "focusedResources", saved: false },
  { type: "priorityAssignments", saved: false },
  { type: "reviewingForces", saved: false },
];

const MODULE_ID = "sta-tactical-campaign";

/** Ordered list of top-level wizard phases. */
const PHASES = ["1", "2", "3"];

/** Number of sub-steps in each phase. */
const STEP_COUNTS = { 1: 3, 2: 3, 3: 4 };

/** Top-level phase metadata for the phases progress bar. */
const PHASE_META = {
  1: { label: "STA_TC.Wizard.Phase1" },
  2: { label: "STA_TC.Wizard.Phase2" },
  3: { label: "STA_TC.Wizard.Phase3" },
};

/** Sub-step metadata (label + hint) for the steps progress bar. */
const STEP_META = {
  1: [
    {
      label: "STA_TC.Wizard.Phase1Step1",
      hint: "STA_TC.Wizard.Phase1Step1Hint",
    },
    {
      label: "STA_TC.Wizard.Phase1Step2",
      hint: "STA_TC.Wizard.Phase1Step2Hint",
    },
    {
      label: "STA_TC.Wizard.Phase1Step3",
      hint: "STA_TC.Wizard.Phase1Step3Hint",
    },
  ],
  2: [
    {
      label: "STA_TC.Wizard.Phase2Step1",
      hint: "STA_TC.Wizard.Phase2Step1Hint",
    },
    {
      label: "STA_TC.Wizard.Phase2Step2",
      hint: "STA_TC.Wizard.Phase2Step2Hint",
    },
    {
      label: "STA_TC.Wizard.Phase2Step3",
      hint: "STA_TC.Wizard.Phase2Step3Hint",
    },
  ],
  3: [
    {
      label: "STA_TC.Wizard.Phase3Step1",
      hint: "STA_TC.Wizard.Phase3StepHint1",
    },
    {
      label: "STA_TC.Wizard.Phase3Step2",
      hint: "STA_TC.Wizard.Phase3StepHint2",
    },
    {
      label: "STA_TC.Wizard.Phase3Step3",
      hint: "STA_TC.Wizard.Phase3StepHint3",
    },
    {
      label: "STA_TC.Wizard.Phase3Step4",
      hint: "STA_TC.Wizard.Phase3StepHint4",
    },
  ],
};

export class CampaignTrackerSheet extends HandlebarsApplicationMixin(
  ActorSheetV2,
) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sta-tactical-campaign", "campaign-tracker-sheet"],
    actions: {
      startTurn: CampaignTrackerSheet._onStartTurn,
      cancelTurn: CampaignTrackerSheet._onCancelTurn,
      endTurn: CampaignTrackerSheet._onEndTurn,
      nextPhase: CampaignTrackerSheet._onNextPhase,
      prevPhase: CampaignTrackerSheet._onPrevPhase,
      removeAsset: CampaignTrackerSheet._onRemoveAsset,
      openActor: CampaignTrackerSheet._onOpenActor,
      createRandomAsset: CampaignTrackerSheet._onCreateRandomAsset,
      createCustomAsset: CampaignTrackerSheet._onCreateCustomAsset,
      createAssetForType: CampaignTrackerSheet._onCreateAssetForType,
      removePoi: CampaignTrackerSheet._onRemovePoi,
      removePoiAsset: CampaignTrackerSheet._onRemovePoiAsset,
      assignAsset: CampaignTrackerSheet._onAssignAsset,
      generatePoi: CampaignTrackerSheet._onGeneratePoi,
      generateAllPois: CampaignTrackerSheet._onGenerateAllPois,
      createCustomPoi: CampaignTrackerSheet._onCreateCustomPoi,
      removeGeneratedPoi: CampaignTrackerSheet._onRemoveGeneratedPoi,
      recallAsset: CampaignTrackerSheet._onRecallAsset,
      selectScenario: CampaignTrackerSheet._onSelectScenario,
      rollEvent: CampaignTrackerSheet._onRollEvent,
      resetEvent: CampaignTrackerSheet._onResetEvent,
      rollRandomEvent: CampaignTrackerSheet._onRollRandomEvent,
      rollConflict: CampaignTrackerSheet._onRollConflict,
      resetConflictRoll: CampaignTrackerSheet._onResetConflictRoll,
      setConflictResult: CampaignTrackerSheet._onSetConflictResult,
      chooseConsequence: CampaignTrackerSheet._onChooseConsequence,
      chooseFailureOption: CampaignTrackerSheet._onChooseFailureOption,
      rollEscalation: CampaignTrackerSheet._onRollEscalation,
      rollCommandeer: CampaignTrackerSheet._onRollCommandeer,
      rollProgression: CampaignTrackerSheet._onRollProgression,
      chooseProgression: CampaignTrackerSheet._onChooseProgression,
      confirmOutcomeResolved: CampaignTrackerSheet._onConfirmOutcomeResolved,
      confirmOutcomeIntensify: CampaignTrackerSheet._onConfirmOutcomeIntensify,
      confirmOutcomeCatastrophe:
        CampaignTrackerSheet._onConfirmOutcomeCatastrophe,
      confirmOutcomeDiffIncrease:
        CampaignTrackerSheet._onConfirmOutcomeDiffIncrease,
      confirmOutcomeExplorationRemove:
        CampaignTrackerSheet._onConfirmOutcomeExplorationRemove,
      confirmOutcomeExtraPoi: CampaignTrackerSheet._onConfirmOutcomeExtraPoi,
      ignoreOutcome: CampaignTrackerSheet._onIgnoreOutcome,

      clearUnavailable: CampaignTrackerSheet._onClearUnavailable,
      openProgressionLog: CampaignTrackerSheet._onOpenProgressionLog,
      setPoiVisibility: CampaignTrackerSheet._onSetPoiVisibility,
      setAllPoiVisibility: CampaignTrackerSheet._onSetAllPoiVisibility,
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
    position: {
      height: 900,
      width: 730,
    },
    window: {
      resizable: true,
      minimizable: true,
    },
    dragDrop: [{ dragSelector: null, dropSelector: null }],
  };

  /** @override */
  static PARTS = {
    sheet: {
      template:
        "modules/sta-tactical-campaign/templates/campaign-tracker-sheet.hbs",
    },
  };

  /** @override */
  get title() {
    return `${this.actor.name} - ${game.i18n.localize("STA_TC.Types.CampaignTracker")}`;
  }

  // ==========================================================================
  // Context Preparation
  // ==========================================================================

  /** @override */
  async _prepareContext(options) {
    const actor = this.actor;
    // Purge any stale UUIDs left by actors deleted outside the tracker UI.
    await this._purgeStaleUuids();
    const system = actor.system;

    const turnPhase = system.turnPhase || "";
    const turnActive = !!turnPhase;
    const scenarioPoi = system.scenarioPoi || "";

    const assetPoiMap = await this._buildAssetPoiMap(system);

    const characterAssets = await this._resolveActorList(
      system.characterAssets,
      assetPoiMap,
    );
    const shipAssets = await this._resolveActorList(
      system.shipAssets,
      assetPoiMap,
    );
    const resourceAssets = await this._resolveActorList(
      system.resourceAssets,
      assetPoiMap,
    );

    const turnStep = system.turnStep || 1;
    const canGeneratePoi = turnActive && turnPhase === "1" && turnStep === 1;
    const canSelectScenario = turnActive && turnPhase === "1" && turnStep === 2;
    const canAssignAssets = turnActive && turnPhase === "1" && turnStep === 2;
    const canRollEvent = turnActive && turnPhase === "1" && turnStep === 3;
    const canRollConflicts = turnActive && turnPhase === "2";
    const isPhase3 = turnActive && turnPhase === "3";

    const poiColumns = await this._resolveAllPoiColumns(system, {
      canSelectScenario,
      canRollEvent,
      canRollConflicts,
      isPhase3,
      scenarioPoi,
    });

    let phaseSteps = [];
    let subSteps = [];
    let phaseHint = "";
    let isFirstPhase = true;
    let isLastPhase = false;

    if (turnActive) {
      phaseSteps = PHASES.map((p, i) => ({
        key: p,
        label: game.i18n.localize(PHASE_META[p].label),
        active: p === turnPhase,
        completed: PHASES.indexOf(p) < PHASES.indexOf(turnPhase),
        index: i + 1,
      }));
      subSteps = (STEP_META[turnPhase] || []).map((s, i) => ({
        label: game.i18n.localize(s.label),
        active: i + 1 === turnStep,
        completed: i + 1 < turnStep,
        index: i + 1,
      }));
      const stepMeta = STEP_META[turnPhase]?.[turnStep - 1];
      phaseHint = stepMeta ? game.i18n.localize(stepMeta.hint) : "";
      isFirstPhase = turnPhase === "1" && turnStep === 1;
      isLastPhase = turnPhase === "3" && turnStep === 4;
    }

    const isMomentumStep = turnActive && turnPhase === "2" && turnStep === 2;
    const phase2stats =
      canRollConflicts || isMomentumStep
        ? this._computePhase2Stats(system)
        : null;
    const phase2MomentumRows = isMomentumStep
      ? await this._computePhase2MomentumRows(system)
      : null;
    const phase3data = isPhase3 ? this._computePhase3Data(system) : null;

    const hasEventTable = !!game.settings.get(MODULE_ID, "tableEvents");
    const isGM = game.user?.isGM ?? false;

    let generatedPois = [];
    if (turnPhase === "1" && turnStep === 1 && isGM) {
      generatedPois = await this._resolveGeneratedPois(
        system.turnGeneratedPois || [],
      );
    }

    // Phase 3 sub-step (1=POI outcomes, 2=Progression, 3=Reinforcements, 4=Summary)
    const phase3Step = isPhase3 ? turnStep : 1;
    if (isPhase3) {
      for (const col of poiColumns) {
        for (const entry of col.entries) {
          entry.phase3Step = phase3Step;
        }
      }
    }

    // Annotate assets with commandeered state for template display
    const commandeeredSet = new Set(system.commandeeredAssets || []);
    for (const list of [characterAssets, shipAssets, resourceAssets]) {
      for (const asset of list) {
        asset.isCommandeered = commandeeredSet.has(asset.uuid);
        // Read status directly from AE flags — more reliable than derived system fields
        const doc = await fromUuid(asset.uuid);
        asset.isUnavailable = !!doc?.effects?.some(
          (e) => !e.disabled && e.flags?.[MODULE_ID]?.unavailable,
        );
        asset.isLost = !!doc?.effects?.some(
          (e) => !e.disabled && e.flags?.[MODULE_ID]?.lost,
        );
      }
    }

    return {
      actor,
      system,
      characterAssets,
      shipAssets,
      resourceAssets,
      poiColumns,
      turnActive,
      turnPhase,
      canGeneratePoi,
      canSelectScenario,
      canAssignAssets,
      canRollEvent,
      canRollConflicts,
      isPhase3,
      phaseSteps,
      subSteps,
      phaseHint,
      isFirstPhase,
      isLastPhase,
      generatedPois,
      generatedCount: generatedPois.length,
      paceSrc: system.pace || 0,
      generateAllLabel: game.i18n.format("STA_TC.Wizard.GenerateAllPois", {
        pace:
          (system.pace || 0) +
          (system.turnExtraTacticalPoisNextTurn || 0) +
          (system.turnExtraUnknownPoisNextTurn || 0),
      }),
      countLabel: game.i18n.format("STA_TC.Wizard.GeneratedCount", {
        current: generatedPois.length,
        pace:
          (system.pace || 0) +
          (system.turnExtraTacticalPoisNextTurn || 0) +
          (system.turnExtraUnknownPoisNextTurn || 0),
      }),
      isGM,
      hasEventTable,
      phase2stats,
      isMomentumStep,
      phase2MomentumRows,
      phase3data,
      phase3Step,
      commandeeredAssets: system.commandeeredAssets || [],
      turnNotes: system.turnNotes || "",
    };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Find or create a world Actor folder whose name matches this tracker.
   * @returns {Promise<Folder>}
   */
  async _getOrCreateTrackerFolder() {
    const name = this.actor.name;
    const existing = game.folders.find(
      (f) => f.type === "Actor" && f.name === name,
    );
    if (existing) return existing;
    return Folder.create({ name, type: "Actor", color: "#003399" });
  }

  /**
   * If the actor originates from a compendium, import a world copy and place
   * it in this tracker's folder.  Returns the actor unchanged when it is
   * already a world document.
   * @param {Actor} actor
   * @returns {Promise<Actor|null>}
   */
  async _importActorIfNeeded(actor) {
    if (!actor?.pack) return actor;
    const folder = await this._getOrCreateTrackerFolder();
    const data = actor.toObject();
    if (folder) data.folder = folder.id;
    return Actor.create(data);
  }

  async _getOrCreateSubfolder(parentFolder, subfolderName) {
    const existing = game.folders.find(
      (f) =>
        f.type === "Actor" &&
        f.name === subfolderName &&
        f.folder?.id === parentFolder.id,
    );
    if (existing) return existing;
    return Folder.create({
      name: subfolderName,
      type: "Actor",
      folder: parentFolder.id,
    });
  }

  async _getOrCreateAssetFolder(assetType) {
    const tracker = await this._getOrCreateTrackerFolder();
    const typeNameMap = {
      character: game.i18n.localize("STA_TC.Folders.Characters"),
      ship: game.i18n.localize("STA_TC.Folders.Ships"),
      resource: game.i18n.localize("STA_TC.Folders.Resources"),
    };
    const assetsFolder = await this._getOrCreateSubfolder(
      tracker,
      game.i18n.localize("STA_TC.Folders.Assets"),
    );
    return this._getOrCreateSubfolder(
      assetsFolder,
      typeNameMap[assetType] || typeNameMap.resource,
    );
  }

  async _getOrCreatePoiFolder(poiType) {
    const tracker = await this._getOrCreateTrackerFolder();
    const typeNameMap = {
      tacticalThreat: game.i18n.localize("STA_TC.Folders.TacticalThreats"),
      exploration: game.i18n.localize("STA_TC.Folders.Exploration"),
      routine: game.i18n.localize("STA_TC.Folders.Routine"),
      unknown: game.i18n.localize("STA_TC.Folders.Unknown"),
    };
    const poisFolder = await this._getOrCreateSubfolder(
      tracker,
      game.i18n.localize("STA_TC.Folders.PointsOfInterest"),
    );
    return this._getOrCreateSubfolder(
      poisFolder,
      typeNameMap[poiType] || typeNameMap.unknown,
    );
  }

  async _purgeStaleUuids() {
    // fromUuid can THROW (not just return null) when an actor was just deleted.
    const safeResolve = async (uuid) => {
      if (!uuid) return null;
      try {
        return await fromUuid(uuid);
      } catch {
        return null;
      }
    };

    const system = this.actor.system;
    const poiLists = [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ];
    const updates = {};

    for (const key of ["characterAssets", "shipAssets", "resourceAssets"]) {
      const list = system[key] || [];
      const valid = [];
      for (const uuid of list) {
        if (await safeResolve(uuid)) valid.push(uuid);
      }
      if (valid.length !== list.length) updates[`system.${key}`] = valid;
    }

    for (const listKey of poiLists) {
      const entries = foundry.utils.deepClone(system[listKey] || []);
      let changed = false;
      const cleaned = [];
      for (const entry of entries) {
        if (!(await safeResolve(entry.actorUuid))) {
          changed = true;
          continue;
        }
        if (entry.asset1Uuid && !(await safeResolve(entry.asset1Uuid))) {
          entry.asset1Uuid = "";
          changed = true;
        }
        if (entry.asset2Uuid && !(await safeResolve(entry.asset2Uuid))) {
          entry.asset2Uuid = "";
          changed = true;
        }
        cleaned.push(entry);
      }
      if (changed) updates[`system.${listKey}`] = cleaned;
    }

    const generated = system.turnGeneratedPois || [];
    const validGenerated = [];
    for (const uuid of generated) {
      if (await safeResolve(uuid)) validGenerated.push(uuid);
    }
    if (validGenerated.length !== generated.length)
      updates["system.turnGeneratedPois"] = validGenerated;

    if (system.scenarioPoi && !(await safeResolve(system.scenarioPoi))) {
      updates["system.scenarioPoi"] = "";
    }

    if (Object.keys(updates).length) await this.actor.update(updates);
  }

  async _buildAssetPoiMap(system) {
    const map = {};
    for (const list of [
      system.poiListThreat,
      system.poiListExploration,
      system.poiListRoutine,
      system.poiListUnknown,
    ]) {
      for (const entry of list || []) {
        if (entry.asset1Uuid || entry.asset2Uuid) {
          const poi = await fromUuid(entry.actorUuid);
          const poiName = poi?.name || "???";
          if (entry.asset1Uuid) map[entry.asset1Uuid] = poiName;
          if (entry.asset2Uuid) map[entry.asset2Uuid] = poiName;
        }
      }
    }
    return map;
  }

  static _isDefaultImg(img) {
    if (!img) return true;
    return /mystery-man/i.test(img) || img === CONST.DEFAULT_TOKEN;
  }

  static _nameInitials(name) {
    const words = (name || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "?";
    const first = words[0][0].toUpperCase();
    const second = words[1] ? words[1][0].toUpperCase() : "";
    return first + second;
  }

  async _resolveActorList(uuids, assetPoiMap = {}) {
    return (
      await Promise.all(
        (uuids || []).map(async (uuid) => {
          const actor = await fromUuid(uuid);
          if (!actor) return null;
          const powers = actor.system?.powers;
          const powerSummary = powers
            ? [
                { abbr: "Med", val: powers.medical?.value || 0 },
                { abbr: "Mil", val: powers.military?.value || 0 },
                { abbr: "Per", val: powers.personal?.value || 0 },
                { abbr: "Sci", val: powers.science?.value || 0 },
                { abbr: "Soc", val: powers.social?.value || 0 },
              ]
                .map((p) => `${p.abbr} ${p.val}`)
                .join(", ")
            : "";
          const useInitials = CampaignTrackerSheet._isDefaultImg(actor.img);
          return {
            uuid,
            name: actor.name,
            img: actor.img,
            initials: useInitials
              ? CampaignTrackerSheet._nameInitials(actor.name)
              : "",
            assetType: actor.system?.assetType || "resource",
            powerSummary,
            assignedTo: assetPoiMap[uuid] || null,
          };
        }),
      )
    ).filter(Boolean);
  }

  async _resolveAllPoiColumns(
    system,
    {
      canSelectScenario,
      canRollEvent,
      canRollConflicts,
      isPhase3,
      scenarioPoi,
    },
  ) {
    const cols = [
      {
        key: "poiListThreat",
        label: game.i18n.localize("STA_TC.CampaignTracker.PoiThreat"),
      },
      {
        key: "poiListExploration",
        label: game.i18n.localize("STA_TC.CampaignTracker.PoiExploration"),
      },
      {
        key: "poiListRoutine",
        label: game.i18n.localize("STA_TC.CampaignTracker.PoiRoutine"),
      },
      {
        key: "poiListUnknown",
        label: game.i18n.localize("STA_TC.CampaignTracker.PoiUnknown"),
      },
    ];
    const resultLabels = {
      success: "STA_TC.Wizard.ResultSuccess",
      flawedSuccess: "STA_TC.Wizard.ResultFlawedSuccess",
      failure: "STA_TC.Wizard.ResultFailure",
      seriousSetback: "STA_TC.Wizard.ResultSeriousSetback",
    };
    for (const col of cols) {
      const entries = await this._resolvePoiList(system[col.key], col.key);
      for (const entry of entries) {
        const isScenario = entry.poi.uuid === scenarioPoi;
        entry.isScenario = isScenario;
        entry.canSelectScenario = canSelectScenario;
        entry.canRollEvent = canRollEvent;
        entry.canRollConflicts =
          canRollConflicts && !isScenario && !!(entry.asset1 || entry.asset2);
        entry.showConflictResult =
          entry.canRollConflicts ||
          (isPhase3 && !!entry.entryData.conflictResult);
        entry.hasEvent = !!entry.entryData.eventResult;
        entry.canResetEvent =
          entry.hasEvent && canRollEvent && (game.user?.isGM ?? false);
        entry.isConflictResolved = !!entry.entryData.conflictResult;
        // Advisory roll data: successes rolled but GM hasn't confirmed pass/fail yet
        if (
          !entry.isConflictResolved &&
          entry.entryData.conflictSuccesses > 0
        ) {
          entry.hasAdvisoryRoll = true;
          entry.advisorySuccesses = entry.entryData.conflictSuccesses;
          entry.advisoryHadNat20 = entry.entryData.conflictHadNat20 || false;
        }
        if (entry.isConflictResolved) {
          const cr = entry.entryData.conflictResult;
          entry.conflictResultLabel = game.i18n.localize(
            resultLabels[cr] || "",
          );
          entry.conflictMomentum = entry.entryData.conflictMomentum || 0;
          entry.conflictHadNat20 = entry.entryData.conflictHadNat20 || false;
          entry.needsConsequence =
            (cr === "flawedSuccess" || cr === "seriousSetback") &&
            !entry.entryData.consequenceChosen;
          entry.isSeriousSetback = cr === "seriousSetback";
          entry.isConflictFailure =
            cr === "failure" && !entry.entryData.failureChoice;
          entry.consequenceChosen = entry.entryData.consequenceChosen || "";
          entry.failureChoice = entry.entryData.failureChoice || "";
          entry.lossResult = entry.entryData.lossResult || "";
          entry.threatConsequenceLabel = game.i18n.format(
            "STA_TC.Wizard.ConsequenceIncreaseThreat",
            { amount: (entry.poi.difficulty || 1) * 2 },
          );
        }
        // Phase 3: per-entry outcome descriptor for the POI card Phase 3 slot
        if (isPhase3) {
          entry.outcomeConfirmed = entry.entryData.outcomeConfirmed || false;
          entry.outcomeIgnored = entry.entryData.outcomeIgnored || false;
          const isResolved =
            isScenario ||
            entry.entryData.conflictResult === "success" ||
            entry.entryData.conflictResult === "flawedSuccess";
          if (isResolved) {
            entry.phase3outcome = { type: "resolved" };
          } else {
            const { poiType, urgency = 1 } = entry.poi;
            if (poiType === "tacticalThreat") {
              const consequence =
                urgency >= 3
                  ? "catastrophe"
                  : urgency === 2
                    ? "escalate"
                    : "intensify";
              entry.phase3outcome = {
                type: "unresolvedThreat",
                consequence,
                showEscalationRoll: urgency >= 2,
                escalationRolled: entry.entryData.escalationRolled || false,
              };
            } else if (poiType === "routine") {
              let commandeeredAssetName = "";
              const commandeeredUuid =
                entry.entryData.commandeeredAssetUuid || "";
              if (commandeeredUuid) {
                const asset = await fromUuid(commandeeredUuid);
                commandeeredAssetName = asset?.name || "";
              }
              entry.phase3outcome = {
                type: "unresolvedRoutine",
                commandeeredAssetUuid: commandeeredUuid,
                commandeeredAssetName,
              };
            } else if (poiType === "exploration") {
              entry.phase3outcome = {
                type: "unresolvedExploration",
                consequence:
                  entry.poi.missedCount >= 1 ? "remove" : "difficultyIncrease",
              };
            } else {
              entry.phase3outcome = { type: "unresolvedUnknown" };
            }
          }
        }
      }
      col.entries = entries;
    }
    return cols;
  }

  async _resolvePoiList(entries, listKey) {
    return (
      await Promise.all(
        (entries || []).map(async (entry, index) => {
          const poi = await fromUuid(entry.actorUuid);
          if (!poi) return null;
          // Completely skip hidden POIs for non-GM users
          if (!game.user.isGM && poi.system?.hiddenByGM) return null;
          const asset1 = entry.asset1Uuid
            ? await fromUuid(entry.asset1Uuid)
            : null;
          const asset2 = entry.asset2Uuid
            ? await fromUuid(entry.asset2Uuid)
            : null;

          // Run complex-effect resolver with assigned assets for this PoI.
          const {
            poiOverrides,
            assetMods,
            descriptions,
            assetEffectDescriptions,
          } = EventEffectResolver.resolve(
            poi,
            [asset1, asset2].filter(Boolean),
          );
          // Helper: prefer overridden value, fall back to raw system field.
          const _ov = (key, fallback) =>
            poiOverrides[`system.${key}`] ?? fallback;

          const resolvedPower = _ov("power", poi.system?.power || "military");
          const resolvedPower2 = _ov("power2", poi.system?.power2 || "");

          return {
            listKey,
            index,
            entryData: entry,
            assetMods,
            poi: {
              uuid: entry.actorUuid,
              name: poi.name,
              displayName: (() => {
                if (poi.system?.revealed) {
                  // Revealed: show real name (realName for unknowns, actor name for others)
                  const isUnknown =
                    (poi.system?.poiType || "unknown") === "unknown";
                  return isUnknown && poi.system?.realName
                    ? poi.system.realName
                    : poi.name;
                }
                // Not revealed: show masked default name
                return poi.name;
              })(),
              showMasked: (() => {
                if (game.user.isGM) return false;
                return !poi.system?.revealed;
              })(),
              visibilityState: (() => {
                if (poi.system?.hiddenByGM) return "hidden";
                if (!poi.system?.revealed) return "masked";
                return "revealed";
              })(),
              img: poi.img,
              difficulty: _ov("difficulty", poi.system?.difficulty),
              urgency: _ov("urgency", poi.system?.urgency),
              isTacticalThreat: poi.system?.poiType === "tacticalThreat",
              poiType: poi.system?.poiType || "unknown",
              missedCount: poi.system?.missedCount || 0,
              power: resolvedPower,
              powerLabel: game.i18n.localize(
                `STA_TC.Powers.${this._capitalize(resolvedPower)}`,
              ),
              power2: resolvedPower2 || null,
              difficulty2: _ov("difficulty2", poi.system?.difficulty2) || null,
              powerLabel2: resolvedPower2
                ? game.i18n.localize(
                    `STA_TC.Powers.${this._capitalize(resolvedPower2)}`,
                  )
                : null,
              eventName: (() => {
                const eventItems =
                  poi.items?.filter((i) => i.type === `${MODULE_ID}.event`) ??
                  [];
                const latest = eventItems[eventItems.length - 1];
                return latest?.name || poi.system?.eventName || "";
              })(),
              eventDescription: (() => {
                const eventItems =
                  poi.items?.filter((i) => i.type === `${MODULE_ID}.event`) ??
                  [];
                const latest = eventItems[eventItems.length - 1];
                return (
                  latest?.system?.description ||
                  poi.system?.eventDescription ||
                  ""
                );
              })(),
              note: poi.system?.note || "",
              hasEventEffects:
                Object.keys(poiOverrides).length > 0 ||
                descriptions.length > 0 ||
                assetEffectDescriptions.length > 0 ||
                [...poi.items]
                  .filter((i) => i.type === `${MODULE_ID}.event`)
                  .some((item) =>
                    item.effects.some(
                      (e) => !e.disabled && e.changes.length > 0,
                    ),
                  ),
              eventEffectTooltip:
                [...descriptions, ...assetEffectDescriptions].join("\n") ||
                null,
            },
            asset1: asset1
              ? {
                  uuid: entry.asset1Uuid,
                  name: asset1.name,
                  img: asset1.img,
                  note: asset1.system?.note || "",
                }
              : null,
            asset2: asset2
              ? {
                  uuid: entry.asset2Uuid,
                  name: asset2.name,
                  img: asset2.img,
                  note: asset2.system?.note || "",
                }
              : null,
          };
        }),
      )
    ).filter(Boolean);
  }

  async _resolveGeneratedPois(uuids) {
    return (
      await Promise.all(
        uuids.map(async (uuid) => {
          const actor = await fromUuid(uuid);
          if (!actor) return null;
          // Compute three-state visibility
          const visibilityState = actor.system?.hiddenByGM
            ? "hidden"
            : !actor.system?.revealed
              ? "masked"
              : "revealed";
          // Retrieve event result from tracker entry data
          const poiLists = [
            "poiListThreat",
            "poiListExploration",
            "poiListRoutine",
            "poiListUnknown",
          ];
          let eventResult = "";
          for (const lk of poiLists) {
            const e = (this.actor.system[lk] || []).find(
              (e) => e.actorUuid === uuid,
            );
            if (e?.eventResult) {
              eventResult = e.eventResult;
              break;
            }
          }
          return {
            uuid,
            name: actor.name,
            img: actor.img,
            poiType: actor.system?.poiType || "unknown",
            poiTypeLabel: game.i18n.localize(
              `STA_TC.Poi.Types.${this._capitalize(actor.system?.poiType || "unknown")}`,
            ),
            visibilityState,
            eventResult,
            difficulty: actor.system?.difficulty || 1,
            power: game.i18n.localize(
              `STA_TC.Powers.${this._capitalize(actor.system?.power || "military")}`,
            ),
            power2: actor.system?.power2
              ? game.i18n.localize(
                  `STA_TC.Powers.${this._capitalize(actor.system.power2)}`,
                )
              : null,
            difficulty2: actor.system?.difficulty2 || null,
          };
        }),
      )
    ).filter(Boolean);
  }

  async _computePhase2MomentumRows(system) {
    const resultLabels = {
      success: "STA_TC.Wizard.ResultSuccess",
      flawedSuccess: "STA_TC.Wizard.ResultFlawedSuccess",
      failure: "STA_TC.Wizard.ResultFailure",
      seriousSetback: "STA_TC.Wizard.ResultSeriousSetback",
    };
    const rows = [];
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      for (const entry of system[listKey] || []) {
        if (!entry.asset1Uuid && !entry.asset2Uuid) continue;
        if (entry.actorUuid === system.scenarioPoi) continue;
        const poi = await fromUuid(entry.actorUuid);
        const name = poi?.name ?? entry.actorUuid;
        const result = entry.conflictResult || "";
        rows.push({
          name,
          result,
          resultLabel: result
            ? game.i18n.localize(resultLabels[result] || result)
            : "",
          successes: entry.conflictSuccesses || 0,
          momentum: entry.conflictMomentum || 0,
          resolved: !!result,
          isSuccess: result === "success" || result === "flawedSuccess",
          isFailure: result === "failure" || result === "seriousSetback",
        });
      }
    }
    return rows;
  }

  _computePhase2Stats(system) {
    const poiLists = [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ];
    let total = 0,
      resolved = 0,
      totalMomentum = 0;
    for (const key of poiLists) {
      for (const entry of system[key] || []) {
        if (!entry.asset1Uuid && !entry.asset2Uuid) continue;
        if (entry.actorUuid === system.scenarioPoi) continue;
        total++;
        if (entry.conflictResult) {
          resolved++;
          totalMomentum += entry.conflictMomentum || 0;
        }
      }
    }
    return {
      total,
      resolved,
      pending: total - resolved,
      allResolved: total > 0 && resolved === total,
      hasConflicts: total > 0,
      totalMomentum,
      threatIncrease: system.turnThreatIncrease || 0,
    };
  }

  _computePhase3Data(system) {
    const allEntries = [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ].flatMap((k) => system[k] || []);
    const totalMomentum = allEntries.reduce(
      (s, e) => s + (e.conflictMomentum || 0),
      0,
    );
    const resolvedExplorationCount = (system.poiListExploration || []).filter(
      (e) =>
        e.conflictResult === "success" || e.conflictResult === "flawedSuccess",
    ).length;
    const fromExploration = resolvedExplorationCount * 3;
    const fromMomentum = system.campaignMomentum || 0;
    const roleplayBonus = system.turnRoleplayBonus || 0;
    const progressionGain = fromExploration + fromMomentum + roleplayBonus;
    const newProgressionTotal = (system.progression || 0) + progressionGain;
    return {
      totalMomentum,
      threatIncrease: system.turnThreatIncrease || 0,
      extraPoisNextTurn: system.turnExtraPoisNextTurn || 0,
      progressionBreakdown: {
        fromExploration,
        fromMomentum,
        roleplayBonus,
        total: progressionGain,
        currentProgression: system.progression || 0,
        newTotal: newProgressionTotal,
        rollsAvailable: Math.floor(newProgressionTotal / 5),
      },
      reinforcements: {
        needed: system.prioritySupply || 0,
        received: system.turnReinforcementsReceived || 0,
        remaining: Math.max(
          0,
          (system.prioritySupply || 0) -
            (system.turnReinforcementsReceived || 0),
        ),
      },
      hasEscalationTable: !!game.settings.get(MODULE_ID, "tableEscalation"),
      hasProgressionTable: true,
    };
  }

  // ==========================================================================
  // Drag & Drop
  // ==========================================================================

  /** @override */
  async _preRender(context, options) {
    await super._preRender(context, options);
    this._savedScrollPositions = {};
    for (const el of this.element?.querySelectorAll("[data-preserve-scroll]") ??
      []) {
      this._savedScrollPositions[el.dataset.preserveScroll] = el.scrollTop;
    }
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);

    // Keyboard support: allow Enter/Space to activate anchor-based buttons
    this.element.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const target = ev.target;
      if (target.getAttribute("role") !== "button") return;
      ev.preventDefault();
      target.click();
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (this._savedScrollPositions) {
      for (const el of this.element.querySelectorAll(
        "[data-preserve-scroll]",
      )) {
        const saved = this._savedScrollPositions[el.dataset.preserveScroll];
        if (saved !== undefined) el.scrollTop = saved;
      }
    }

    // Re-apply saved sidebar width and attach drag-to-resize handle
    const layoutEl = this.element.querySelector(".tracker-main-layout");
    if (layoutEl) {
      if (this._sidebarWidth) {
        layoutEl.style.setProperty("--sidebar-w", this._sidebarWidth + "px");
      }
      const handle = this.element.querySelector(".sidebar-resize-handle");
      if (handle) {
        const SIDEBAR_MIN = 58;
        const SIDEBAR_MAX = 230;
        handle.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          handle.setPointerCapture(e.pointerId);
          handle.classList.add("is-dragging");
          let dragged = false;
          const onMove = (moveEvent) => {
            dragged = true;
            const rect = layoutEl.getBoundingClientRect();
            const newW = Math.min(
              SIDEBAR_MAX,
              Math.max(SIDEBAR_MIN, moveEvent.clientX - rect.left),
            );
            this._sidebarWidth = newW;
            layoutEl.style.setProperty("--sidebar-w", newW + "px");
          };
          const onUp = () => {
            handle.classList.remove("is-dragging");
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
            // Toggle on click (no drag movement detected)
            if (!dragged) {
              const current = this._sidebarWidth ?? SIDEBAR_MIN;
              const newW = current <= SIDEBAR_MIN ? SIDEBAR_MAX : SIDEBAR_MIN;
              this._sidebarWidth = newW;
              layoutEl.style.setProperty("--sidebar-w", newW + "px");
            }
          };
          handle.addEventListener("pointermove", onMove);
          handle.addEventListener("pointerup", onUp);
        });
      }
    }

    // Attach drag-to-canvas listeners for assets and POIs
    if (this.actor.isOwner) {
      for (const el of this.element.querySelectorAll(
        "[data-drag][data-uuid]",
      )) {
        el.setAttribute("draggable", "true");
        el.addEventListener("dragstart", (event) => {
          event.dataTransfer.setData(
            "text/plain",
            JSON.stringify({ type: "Actor", uuid: el.dataset.uuid }),
          );
          // Use just the portrait as the drag ghost so the hidden card-info
          // panel doesn't appear in the snapshot
          const portrait =
            el.querySelector(".asset-portrait-wrap") ??
            el.querySelector(".asset-thumb") ??
            el;
          event.dataTransfer.setDragImage(portrait, 24, 24);
        });
      }

      // Make filled POI assignment slots draggable so assets can be moved
      // between slots and POIs without having to unassign first.
      for (const wrapper of this.element.querySelectorAll(
        ".poi-slot-wrapper.filled[data-drag-context='poi-asset']",
      )) {
        wrapper.setAttribute("draggable", "true");
        wrapper.addEventListener("dragstart", (event) => {
          // Stop the event from bubbling to the parent .poi-entry so the
          // whole POI card doesn't get dragged instead.
          event.stopPropagation();
          event.dataTransfer.setData(
            "text/plain",
            JSON.stringify({
              type: "Actor",
              uuid: wrapper.dataset.uuid,
              sourceContext: "poi-asset",
              sourceKey: wrapper.dataset.sourceKey,
              sourceIndex: parseInt(wrapper.dataset.sourceIndex),
              sourceSlot: parseInt(wrapper.dataset.sourceSlot),
              sourceTrackerId: this.actor.id,
            }),
          );
          const thumb = wrapper.querySelector(".slot-thumb");
          if (thumb) event.dataTransfer.setDragImage(thumb, 16, 16);
        });
      }

      // Drag-over highlight for empty POI slots
      for (const slot of this.element.querySelectorAll(
        "[data-drop-target='poi-slot']",
      )) {
        slot.addEventListener("dragover", (e) => {
          e.preventDefault();
          slot.classList.add("drag-over");
        });
        slot.addEventListener("dragleave", () =>
          slot.classList.remove("drag-over"),
        );
        slot.addEventListener("drop", () => slot.classList.remove("drag-over"));
      }
    }

    // POI column collapse: restore saved state then attach toggle listener
    const collapseKey = `sta-tc.poi-col-collapsed.${this.actor.id}`;
    let collapsed;
    try {
      collapsed = JSON.parse(localStorage.getItem(collapseKey) ?? "{}");
    } catch {
      collapsed = {};
    }
    for (const col of this.element.querySelectorAll(".poi-column")) {
      const key = col.querySelector(".poi-column-toggle")?.dataset.colKey ?? "";
      if (collapsed[key]) col.classList.add("collapsed");
    }
    this.element.addEventListener("click", (e) => {
      const toggle = e.target.closest(".poi-column-toggle");
      if (!toggle) return;
      const col = toggle.closest(".poi-column");
      if (!col) return;
      const key = toggle.dataset.colKey ?? "";
      col.classList.toggle("collapsed");
      let state;
      try {
        state = JSON.parse(localStorage.getItem(collapseKey) ?? "{}");
      } catch {
        state = {};
      }
      state[key] = col.classList.contains("collapsed");
      localStorage.setItem(collapseKey, JSON.stringify(state));
    });

    // Sidebar overflow indicator
    const sidebar = this.element.querySelector(".tracker-sidebar");
    const sidebarWrap = this.element.querySelector(".tracker-sidebar-wrap");
    if (sidebar && sidebarWrap) {
      const updateOverflow = () => {
        const hasMore =
          sidebar.scrollTop + sidebar.clientHeight < sidebar.scrollHeight - 4;
        sidebarWrap.classList.toggle("has-overflow-below", hasMore);
        sidebarWrap.classList.toggle(
          "has-overflow-above",
          sidebar.scrollTop > 4,
        );
      };
      sidebar.addEventListener("scroll", updateOverflow, { passive: true });
      // Run once after layout has settled
      requestAnimationFrame(updateOverflow);
    }
  }

  /** @override */
  async _onDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (data.type !== "Actor") return;
    let uuid = data.uuid;
    const target = event.target;

    // Resolve the actor type first so we can route correctly regardless of
    // where on the sheet the user dropped it.
    let actor = await fromUuid(uuid);
    if (!actor) return;

    // If the actor lives in a compendium, import it into the world first and
    // place it in this tracker's folder before adding it to the tracker.
    if (actor.pack) {
      actor = await this._importActorIfNeeded(actor);
      if (!actor) return;
      uuid = actor.uuid;
    }

    if (actor.type === `${MODULE_ID}.asset`) {
      // If dropped directly onto an empty POI slot, assign it there.
      const poiSlot = target.closest("[data-drop-target='poi-slot']");
      if (poiSlot) return this._handleDropPoiAsset(uuid, poiSlot, data);
      // Otherwise add to the sidebar asset strip (anywhere on the sheet).
      return this._handleDropAssetToSidebar(uuid, actor);
    }

    if (actor.type === `${MODULE_ID}.poi`) {
      const poiList = target.closest("[data-drop-target='poi']");
      return this._handleDropPoi(uuid, target, poiList, data);
    }
  }

  async _handleDropAssetToSidebar(uuid, actor) {
    const typeToKey = {
      character: "characterAssets",
      ship: "shipAssets",
      resource: "resourceAssets",
    };
    const listKey = typeToKey[actor.system?.assetType];
    if (!listKey) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.CampaignTracker.NotAnAsset"),
      );
      return;
    }
    const existing = this.actor.system[listKey] || [];
    if (existing.includes(uuid)) {
      ui.notifications.info(
        game.i18n.localize("STA_TC.CampaignTracker.AlreadyAdded"),
      );
      return;
    }
    await this.actor.update({ [`system.${listKey}`]: [...existing, uuid] });
  }

  _getPoiDropIndex(target) {
    const entry = target.closest(".poi-entry");
    if (entry?.dataset.sourceIndex !== undefined)
      return parseInt(entry.dataset.sourceIndex);
    return null;
  }

  static _poiTypeToListKey(actor, fallback) {
    return (
      {
        tacticalThreat: "poiListThreat",
        exploration: "poiListExploration",
        routine: "poiListRoutine",
        unknown: "poiListUnknown",
      }[actor.system?.poiType] || fallback
    );
  }

  async _handleDropPoi(uuid, dropTarget, poiListEl, data) {
    const actor = await fromUuid(uuid);
    if (!actor || actor.type !== `${MODULE_ID}.poi`) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.CampaignTracker.NotAPoi"),
      );
      return;
    }
    const targetListKey = CampaignTrackerSheet._poiTypeToListKey(
      actor,
      poiListEl?.dataset?.poiList || "poiListUnknown",
    );
    const isInternal = data.sourceTrackerId === this.actor.id;
    if (isInternal && data.sourceContext === "poi") {
      const sourceListKey = data.sourceKey;
      const fromIndex = data.sourceIndex;
      const dropIndex = this._getPoiDropIndex(dropTarget);
      if (sourceListKey === targetListKey) {
        const entries = foundry.utils.deepClone(
          this.actor.system[targetListKey] || [],
        );
        const resolvedDrop = dropIndex ?? entries.length - 1;
        if (fromIndex === resolvedDrop) return;
        const [moved] = entries.splice(fromIndex, 1);
        entries.splice(
          resolvedDrop > fromIndex ? resolvedDrop - 1 : resolvedDrop,
          0,
          moved,
        );
        await this.actor.update({ [`system.${targetListKey}`]: entries });
      } else {
        const sourceEntries = foundry.utils.deepClone(
          this.actor.system[sourceListKey] || [],
        );
        const targetEntries = foundry.utils.deepClone(
          this.actor.system[targetListKey] || [],
        );
        if (targetEntries.some((e) => e.actorUuid === uuid)) {
          ui.notifications.info(
            game.i18n.localize("STA_TC.CampaignTracker.AlreadyAdded"),
          );
          return;
        }
        const [moved] = sourceEntries.splice(fromIndex, 1);
        targetEntries.splice(dropIndex ?? targetEntries.length, 0, moved);
        await this.actor.update({
          [`system.${sourceListKey}`]: sourceEntries,
          [`system.${targetListKey}`]: targetEntries,
        });
      }
      return;
    }
    const entries = foundry.utils.deepClone(
      this.actor.system[targetListKey] || [],
    );
    if (entries.some((e) => e.actorUuid === uuid)) {
      ui.notifications.info(
        game.i18n.localize("STA_TC.CampaignTracker.AlreadyAdded"),
      );
      return;
    }
    entries.push({ actorUuid: uuid, asset1Uuid: "", asset2Uuid: "" });
    await this.actor.update({ [`system.${targetListKey}`]: entries });
  }

  async _handleDropPoiAsset(uuid, slotEl, data) {
    const actor = await fromUuid(uuid);
    if (!actor || actor.type !== `${MODULE_ID}.asset`) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.CampaignTracker.NotAnAsset"),
      );
      return;
    }
    const listKey = slotEl.dataset.poiList;
    const poiIndex = parseInt(slotEl.dataset.poiIndex);
    const slot = parseInt(slotEl.dataset.slot);
    const field = slot === 0 ? "asset1Uuid" : "asset2Uuid";
    const fromPoiSlot = data.sourceContext === "poi-asset";
    if (
      fromPoiSlot &&
      data.sourceKey === listKey &&
      data.sourceIndex === poiIndex &&
      data.sourceSlot === slot
    )
      return;
    if (!fromPoiSlot && this._isAssetAssignedToAnyPoi(uuid)) {
      // For resource assets, Flexible Deployments may allow a second assignment
      const assetType = actor.system?.assetType;
      if (assetType === "resource") {
        const limit = this.actor.system.turnFlexibleDeployments ? 2 : 1;
        if (this._countResourceAssignments(uuid) >= limit) {
          ui.notifications.warn(
            game.i18n.format("STA_TC.Progression.AssetResourceLimitReached", {
              name: actor.name,
            }),
          );
          return;
        }
        // Under the limit — allow the drop to proceed (skip normal block)
      } else {
        ui.notifications.warn(
          game.i18n.localize("STA_TC.CampaignTracker.AssetAlreadyAssigned"),
        );
        return;
      }
    }
    if (actor.effects?.some((e) => e.flags?.[MODULE_ID]?.unavailable)) {
      ui.notifications.warn(
        game.i18n.format("STA_TC.CampaignTracker.AssetUnavailableAssign", {
          name: actor.name,
        }),
      );
      return;
    }
    if (actor.effects?.some((e) => e.flags?.[MODULE_ID]?.lost)) {
      ui.notifications.warn(
        game.i18n.format("STA_TC.CampaignTracker.AssetLostAssign", {
          name: actor.name,
        }),
      );
      return;
    }
    if (slot === 0 && actor.system?.assetType === "resource") {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Wizard.ResourceCannotBePrimary"),
      );
      return;
    }
    const updates = {};
    if (fromPoiSlot) {
      const srcEntries = foundry.utils.deepClone(
        this.actor.system[data.sourceKey] || [],
      );
      const srcField = data.sourceSlot === 0 ? "asset1Uuid" : "asset2Uuid";
      if (srcEntries[data.sourceIndex]) {
        srcEntries[data.sourceIndex][srcField] = "";
        updates[`system.${data.sourceKey}`] = srcEntries;
      }
    }
    const targetEntries = foundry.utils.deepClone(
      fromPoiSlot && data.sourceKey === listKey
        ? updates[`system.${listKey}`]
        : this.actor.system[listKey] || [],
    );
    if (!targetEntries[poiIndex]) return;
    targetEntries[poiIndex][field] = uuid;
    updates[`system.${listKey}`] = targetEntries;
    await this.actor.update(updates);
  }

  _isAssetAssignedToAnyPoi(uuid) {
    for (const list of [
      this.actor.system.poiListThreat,
      this.actor.system.poiListExploration,
      this.actor.system.poiListRoutine,
      this.actor.system.poiListUnknown,
    ]) {
      for (const entry of list || []) {
        if (entry.asset1Uuid === uuid || entry.asset2Uuid === uuid) return true;
      }
    }
    return false;
  }

  /** Count how many times a resource UUID appears in any assisting (slot 2) POI slot. */
  _countResourceAssignments(uuid) {
    let count = 0;
    for (const list of [
      this.actor.system.poiListThreat,
      this.actor.system.poiListExploration,
      this.actor.system.poiListRoutine,
      this.actor.system.poiListUnknown,
    ]) {
      for (const entry of list || []) {
        if (entry.asset1Uuid === uuid || entry.asset2Uuid === uuid) count++;
      }
    }
    return count;
  }

  // ==========================================================================
  // Action Handlers — Turn Lifecycle
  // ==========================================================================

  static async _onStartTurn(event, target) {
    const existing = this.actor.system.turnPhase;
    if (existing) {
      const userId = this.actor.system.turnUserId;
      if (userId && userId !== game.user.id) {
        const otherUser = game.users.get(userId);
        const override = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize("STA_TC.Wizard.Title") },
          content: `<p>${game.i18n.format("STA_TC.Wizard.LockedBy", { user: otherUser?.name || "Unknown" })}</p>`,
          yes: { label: game.i18n.localize("STA_TC.Wizard.Override") },
          no: { label: game.i18n.localize("STA_TC.Cancel") },
        });
        if (!override) return;
        await this.actor.update({ "system.turnUserId": game.user.id });
      }
      return;
    }
    // Expire unavailability Active Effects whose expireAfterTurn has been reached
    const currentTurn = this.actor.system.campaignTurnNumber || 0;
    for (const listKey of ["characterAssets", "shipAssets", "resourceAssets"]) {
      for (const uuid of this.actor.system[listKey] || []) {
        const asset = await fromUuid(uuid);
        if (!asset) continue;
        for (const effect of [...asset.effects]) {
          const expiry = effect.flags?.[MODULE_ID]?.expireAfterTurn;
          if (expiry !== undefined && currentTurn >= expiry)
            await effect.delete();
        }
      }
    }

    // Apply any supply bonus from the previous turn's progression results
    const supplyBonus = this.actor.system.nextTurnSupplyBonus || 0;
    const currentSupply = this.actor.system.prioritySupply || 0;

    await this.actor.update({
      "system.turnPhase": "1",
      "system.turnUserId": game.user.id,
      "system.scenarioPoi": "",
      "system.turnGeneratedPois": [],
      "system.turnThreatIncrease": 0,
      "system.turnExtraPoisNextTurn": 0,
      "system.turnRoleplayBonus": 0,
      "system.turnReinforcementsReceived": 0,
      "system.turnStep": 1,
      "system.turnFlexibleDeployments": false,
      // Apply and clear the deferred supply bonus
      ...(supplyBonus > 0 && {
        "system.prioritySupply": currentSupply + supplyBonus,
        "system.nextTurnSupplyBonus": 0,
      }),
      // turnExtraTacticalPoisNextTurn and turnExtraUnknownPoisNextTurn are
      // intentionally NOT reset here — they carry over from _onEndTurn so
      // Phase 1 Step 1 knows the correct POI generation target.
      // Free any commandeered assets from the previous turn
      "system.commandeeredAssets": [],
    });
  }

  static async _onCancelTurn(event, target) {
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("STA_TC.Wizard.Title") },
      content: `<p>${game.i18n.localize("STA_TC.Wizard.CancelConfirm")}</p>`,
    });
    if (!proceed) return;
    await this._clearTurnState();
  }

  static async _onNextPhase(event, target) {
    const system = this.actor.system;
    const turnPhase = system.turnPhase;
    const turnStep = system.turnStep || 1;
    const stepCount = STEP_COUNTS[turnPhase] || 1;

    // Validation: warn if hidden POIs exist when leaving Phase 1 Step 1
    if (turnPhase === "1" && turnStep === 1) {
      const generatedUuids = system.turnGeneratedPois || [];
      let hasHidden = false;
      for (const uuid of generatedUuids) {
        const poi = await fromUuid(uuid);
        if (poi?.system?.hiddenByGM) {
          hasHidden = true;
          break;
        }
      }
      if (hasHidden) {
        const proceed = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize("STA_TC.Wizard.Title") },
          content: `<p>${game.i18n.localize("STA_TC.Poi.HiddenPoisWarning")}</p>`,
        });
        if (!proceed) return;
      }
    }

    // Validation: warn if no scenario selected when leaving Phase 1 Step 2
    if (turnPhase === "1" && turnStep === 2 && !system.scenarioPoi) {
      const proceed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("STA_TC.Wizard.Title") },
        content: `<p>${game.i18n.localize("STA_TC.Wizard.NoScenarioWarning")}</p>`,
      });
      if (!proceed) return;
    }

    if (turnStep < stepCount) {
      // Advance sub-step within current phase
      const updates = { "system.turnStep": turnStep + 1 };
      // Consume carry-over extra POI counts when leaving the generation step
      if (turnPhase === "1" && turnStep === 1) {
        updates["system.turnExtraTacticalPoisNextTurn"] = 0;
        updates["system.turnExtraUnknownPoisNextTurn"] = 0;
      }
      await this.actor.update(updates);
    } else {
      // Advance to next phase
      const phaseIdx = PHASES.indexOf(turnPhase);
      if (phaseIdx >= PHASES.length - 1) return;
      const nextPhase = PHASES[phaseIdx + 1];
      const phaseUpdates = {
        "system.turnPhase": nextPhase,
        "system.turnStep": 1,
      };
      // On Phase 2 → Phase 3: promote pending notes to visible notes
      if (turnPhase === "2" && nextPhase === "3") {
        phaseUpdates["system.turnNotes"] = system.turnPendingNotes || "";
        phaseUpdates["system.turnPendingNotes"] = "";
      }
      await this.actor.update(phaseUpdates);
    }
  }

  static async _onPrevPhase(event, target) {
    const system = this.actor.system;
    const turnPhase = system.turnPhase;
    const turnStep = system.turnStep || 1;

    if (turnStep > 1) {
      await this.actor.update({ "system.turnStep": turnStep - 1 });
    } else {
      const phaseIdx = PHASES.indexOf(turnPhase);
      if (phaseIdx <= 0) return;
      const prevPhase = PHASES[phaseIdx - 1];
      const prevStepCount = STEP_COUNTS[prevPhase] || 1;
      await this.actor.update({
        "system.turnPhase": prevPhase,
        "system.turnStep": prevStepCount,
      });
    }
  }

  static async _onEndTurn(event, target) {
    // Original snapshot — used for momentum total, roleplay bonus, and
    // resolvedExploration count (before we remove them from the list).
    const system = this.actor.system;
    const chatLines = [];

    const scenarioPoi = system.scenarioPoi || "";
    const isResolved = (e) =>
      e.conflictResult === "success" ||
      e.conflictResult === "flawedSuccess" ||
      (!!scenarioPoi && e.actorUuid === scenarioPoi);

    // ---- VALIDATION: warn if any Phase 3 outcomes have not been confirmed ---
    const allEntries = [
      ...(system.poiListThreat || []),
      ...(system.poiListExploration || []),
      ...(system.poiListRoutine || []),
      ...(system.poiListUnknown || []),
    ];
    const unconfirmedCount = allEntries.filter(
      (e) => !isResolved(e) && !e.outcomeConfirmed && !e.outcomeIgnored,
    ).length;
    if (unconfirmedCount > 0) {
      const proceed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("STA_TC.Wizard.Title") },
        content: `<p>${game.i18n.format("STA_TC.Wizard.OutcomesUnconfirmedWarning", { count: unconfirmedCount })}</p>`,
      });
      if (!proceed) return;
    }

    // Count resolved explorations BEFORE removal so we can award +3 each.
    const resolvedExplorationCount = (system.poiListExploration || []).filter(
      isResolved,
    ).length;

    // ---- A0: Apply event-driven asset unavailability AEs -------------------
    // Scan ALL POI entries (resolved + unresolved) before they are removed.
    // If the POI had an event rolled, check for asset_unavailable effects and
    // apply the corresponding Active Effects to assigned asset actors.
    const currentTurnNum = system.campaignTurnNumber || 0;
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      for (const entry of system[listKey] || []) {
        if (!entry.eventResult) continue; // no event was rolled this turn
        const poi = await fromUuid(entry.actorUuid);
        if (!poi) continue;
        const a1 = entry.asset1Uuid ? await fromUuid(entry.asset1Uuid) : null;
        const a2 = entry.asset2Uuid ? await fromUuid(entry.asset2Uuid) : null;
        const assets = [a1, a2].filter(Boolean);
        if (!assets.length) continue;
        const { unavailableAssets } = EventEffectResolver.resolve(poi, assets);
        for (const { actor, turns, label } of unavailableAssets) {
          const expireAfterTurn = currentTurnNum + turns;
          await this._applyUnavailableEffect(
            actor.uuid,
            label,
            expireAfterTurn,
          );
          chatLines.push(
            `<p>⏸ <strong>${actor.name}</strong>: ${game.i18n.format("STA_TC.Wizard.OutcomeAssetUnavailableEvent", { turns })} (${poi.name})</p>`,
          );
        }
      }
    }

    // ---- A: Remove successfully resolved POIs from all lists ----------------
    // Pre-collect actor documents for the optional deletion prompt.
    const resolvedActorUuids = [];
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      for (const entry of system[listKey] || []) {
        if (isResolved(entry) && entry.actorUuid)
          resolvedActorUuids.push(entry.actorUuid);
      }
    }
    const resolvedPoiActors = (
      await Promise.all(resolvedActorUuids.map((u) => fromUuid(u)))
    ).filter(Boolean);

    const removalUpdates = {};
    let resolvedCount = 0;
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      const entries = foundry.utils.deepClone(system[listKey] || []);
      const filtered = entries.filter((e) => {
        if (isResolved(e)) {
          resolvedCount++;
          return false;
        }
        return true;
      });
      removalUpdates[`system.${listKey}`] = filtered;
    }
    await this.actor.update(removalUpdates);
    if (resolvedCount)
      chatLines.push(
        `<p>&#x2705; ${game.i18n.format("STA_TC.Wizard.OutcomeResolved", { count: resolvedCount })}</p>`,
      );

    // ---- A2: Optionally delete the resolved POI actors ----------------------
    if (resolvedPoiActors.length) {
      const nameList = resolvedPoiActors
        .map((a) => `<li>${a.name}</li>`)
        .join("");
      const doDelete = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("STA_TC.Wizard.Title") },
        content: `<p>${game.i18n.localize("STA_TC.Wizard.DeleteResolvedPoiConfirm")}</p><ul style="margin:6px 0 0 16px">${nameList}</ul>`,
        yes: {
          label: game.i18n.localize("STA_TC.Wizard.DeleteResolvedPoiYes"),
          icon: "fas fa-trash",
        },
        no: { label: game.i18n.localize("STA_TC.Wizard.DeleteResolvedPoiNo") },
      });
      if (doDelete) {
        const actorIdSet = new Set(resolvedPoiActors.map((a) => a.id));
        const tokensToDelete = (
          canvas.scene?.tokens?.filter((t) => actorIdSet.has(t.actorId)) ?? []
        ).map((t) => t.id);
        if (tokensToDelete.length)
          await TokenDocument.deleteDocuments(tokensToDelete, {
            parent: canvas.scene,
          });
        await Actor.deleteDocuments(resolvedPoiActors.map((a) => a.id));
      }
    }

    // ---- B: Unresolved Tactical Threats ------------------------------------
    // Work from fresh system now that resolved POIs are removed.
    const sys2 = this.actor.system;
    let paceDelta = 0;
    let extraTacticalPois = 0;
    const finalThreatEntries = [];
    for (const entry of sys2.poiListThreat || []) {
      // Already handled by an outcome button — keep the entry as-is
      if (entry.outcomeConfirmed || entry.outcomeIgnored) {
        finalThreatEntries.push(entry);
        continue;
      }
      const poi = await fromUuid(entry.actorUuid);
      const urgency = poi?.system?.urgency || 1;
      if (urgency >= 3) {
        // Catastrophe: remove from play, increase pace, extra tactical POI next turn.
        paceDelta++;
        extraTacticalPois++;
        chatLines.push(
          `<p>&#x1F4A5; <strong>${poi?.name || "?"}</strong>: ${game.i18n.localize("STA_TC.Wizard.OutcomeCatastrophe")}</p>`,
        );
      } else {
        // Intensify: urgency++ and difficulty++ on the POI actor.
        if (poi) {
          const poiUpdates = {
            "system.urgency": Math.min(5, urgency + 1),
            "system.difficulty": Math.min(5, (poi.system?.difficulty || 1) + 1),
          };
          if (poi.system?.difficulty2 != null)
            poiUpdates["system.difficulty2"] = Math.min(
              5,
              poi.system.difficulty2 + 1,
            );
          await poi.update(poiUpdates);
        }
        finalThreatEntries.push(entry);
        chatLines.push(
          urgency === 1
            ? `<p>&#x1F53A; <strong>${poi?.name || "?"}</strong>: ${game.i18n.localize("STA_TC.Wizard.OutcomeIntensify1")}</p>`
            : `<p>&#x1F53A; <strong>${poi?.name || "?"}</strong>: ${game.i18n.localize("STA_TC.Wizard.OutcomeIntensify2")}</p>`,
        );
      }
    }
    const threatTrackerUpdates = { "system.poiListThreat": finalThreatEntries };
    if (paceDelta)
      threatTrackerUpdates["system.pace"] = (sys2.pace || 0) + paceDelta;
    await this.actor.update(threatTrackerUpdates);

    // ---- C: Unresolved Routine POIs ----------------------------------------
    const sys3 = this.actor.system;
    const newCommandeered = [...(sys3.commandeeredAssets || [])];
    let resourceAssets = [...(sys3.resourceAssets || [])];
    let assetListChanged = false;
    for (const entry of sys3.poiListRoutine || []) {
      // Ignored outcomes — this entry stays in the tracker, no commandeer applies
      if (entry.outcomeIgnored) continue;
      const uuid = entry.commandeeredAssetUuid;
      if (!uuid) continue;
      const asset = await fromUuid(uuid);
      if (asset?.system?.assetType === "resource") {
        // Resources are discarded immediately.
        resourceAssets = resourceAssets.filter((u) => u !== uuid);
        assetListChanged = true;
        chatLines.push(
          `<p>&#x1F4E6; <strong>${asset.name}</strong>: ${game.i18n.localize("STA_TC.Wizard.OutcomeResourceDiscarded")}</p>`,
        );
      } else if (asset) {
        // Character / Ship assets are commandeered until next turn.
        if (!newCommandeered.includes(uuid)) newCommandeered.push(uuid);
        assetListChanged = true;
        chatLines.push(
          `<p>&#x1F512; <strong>${asset.name}</strong>: ${game.i18n.localize("STA_TC.Wizard.OutcomeAssetCommandeered")}</p>`,
        );
        // Mark the actor with an unavailability AE so the status is visible
        // on the actor sheet and auto-expires at the next turn start.
        const expireAfterTurn = (sys3.campaignTurnNumber || 0) + 1;
        await this._applyUnavailableEffect(
          uuid,
          game.i18n.localize("STA_TC.Wizard.OutcomeAssetCommandeered"),
          expireAfterTurn,
        );
      }
    }
    if (assetListChanged)
      await this.actor.update({
        "system.commandeeredAssets": newCommandeered,
        "system.resourceAssets": resourceAssets,
      });

    // ---- D: Unresolved Exploration POIs ------------------------------------
    const sys4 = this.actor.system;
    const finalExplorationEntries = [];
    for (const entry of sys4.poiListExploration || []) {
      // Already handled by an outcome button — keep the entry as-is
      if (entry.outcomeConfirmed || entry.outcomeIgnored) {
        finalExplorationEntries.push(entry);
        continue;
      }
      const poi = await fromUuid(entry.actorUuid);
      const missedCount = poi?.system?.missedCount || 0;
      if (missedCount >= 1) {
        // Second miss: remove from play.
        chatLines.push(
          `<p>&#x1F570;&#xFE0F; <strong>${poi?.name || "?"}</strong>: ${game.i18n.localize("STA_TC.Wizard.OutcomeExplorationRemoved")}</p>`,
        );
      } else {
        // First miss: difficulty++ and missedCount = 1 on the POI actor.
        if (poi) {
          const poiUpdates = {
            "system.missedCount": 1,
            "system.difficulty": Math.min(5, (poi.system?.difficulty || 1) + 1),
          };
          if (poi.system?.difficulty2 != null)
            poiUpdates["system.difficulty2"] = Math.min(
              5,
              poi.system.difficulty2 + 1,
            );
          await poi.update(poiUpdates);
        }
        finalExplorationEntries.push(entry);
        chatLines.push(
          `<p>&#x1F4CD; <strong>${poi?.name || "?"}</strong>: ${game.i18n.localize("STA_TC.Wizard.OutcomeExplorationDifficultyIncrease")}</p>`,
        );
      }
    }
    await this.actor.update({
      "system.poiListExploration": finalExplorationEntries,
    });

    // ---- E: Unresolved Unknown POIs ----------------------------------------
    const sys5 = this.actor.system;
    let extraUnknownPois = 0;
    const finalUnknownEntries = [];
    for (const entry of sys5.poiListUnknown || []) {
      if (entry.outcomeIgnored) {
        // Ignored — keep in list
        finalUnknownEntries.push(entry);
        continue;
      }
      if (entry.outcomeConfirmed) {
        // Already applied via button — remove from list without counting again
        continue;
      }
      const poi = await fromUuid(entry.actorUuid);
      extraUnknownPois++;
      chatLines.push(
        `<p>&#x2753; <strong>${poi?.name || "?"}</strong>: ${game.i18n.localize("STA_TC.Wizard.OutcomeUnknownRemoved")}</p>`,
      );
    }
    if (
      extraUnknownPois ||
      finalUnknownEntries.length !== (sys5.poiListUnknown || []).length
    )
      await this.actor.update({ "system.poiListUnknown": finalUnknownEntries });

    // ---- F: Progression (exploration gains + GM roleplay bonus) ------------
    // Momentum bonus is display-only; it is NOT added here (persists between turns).
    const progressionGain =
      resolvedExplorationCount * 3 + (system.turnRoleplayBonus || 0);

    // ---- G: Apply progression gain from Phase 2 consequences ----------------
    const sys6 = this.actor.system;
    const finalUpdates = {};
    // NOTE: turnThreatIncrease is recorded as a note (see _appendPendingNote)
    // and is NOT applied directly to campaignThreat — GMs resolve threat manually.
    if (progressionGain > 0)
      finalUpdates["system.progression"] =
        (sys6.progression || 0) + progressionGain;
    // Increment the campaign turn counter (used for AE expiry checks)
    finalUpdates["system.campaignTurnNumber"] =
      (sys6.campaignTurnNumber || 0) + 1;
    await this.actor.update(finalUpdates);

    // ---- Chat summary ------------------------------------------------------
    const totalMomentum = [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]
      .flatMap((k) => system[k] || [])
      .reduce((s, e) => s + (e.conflictMomentum || 0), 0);
    const extraPoisTotal =
      (system.turnExtraPoisNextTurn || 0) +
      extraTacticalPois +
      extraUnknownPois;
    await ChatMessage.create({
      content: `<div style="background:#333;border-radius:8px;padding:10px;color:#eee;">
        <h3 style="margin:0 0 8px;color:#ffd700;">&#x1F3C1; ${game.i18n.localize("STA_TC.Wizard.TurnComplete")}</h3>
        ${chatLines.join("")}
        ${totalMomentum > 0 ? `<p>${game.i18n.localize("STA_TC.Wizard.MomentumGained")}: <strong>+${totalMomentum}</strong></p>` : ""}
        ${sys6.turnThreatIncrease > 0 ? `<p>${game.i18n.localize("STA_TC.Wizard.ThreatIncrease")}: <strong>+${sys6.turnThreatIncrease}</strong></p>` : ""}
        ${progressionGain > 0 ? `<p>${game.i18n.localize("STA_TC.Wizard.ProgressionGained")}: <strong>+${progressionGain}</strong></p>` : ""}
        ${extraPoisTotal > 0 ? `<p>${game.i18n.localize("STA_TC.Wizard.ExtraPoisNextTurn")}: <strong>+${extraPoisTotal}</strong>${extraTacticalPois > 0 ? ` (${extraTacticalPois} tactical)` : ""}${extraUnknownPois > 0 ? ` (${extraUnknownPois} +difficulty)` : ""}</p>` : ""}
        ${paceDelta > 0 ? `<p>${game.i18n.localize("STA_TC.Wizard.PaceIncreased")}: <strong>+${paceDelta}</strong></p>` : ""}
      </div>`,
      speaker: { alias: game.i18n.localize("STA_TC.Wizard.SpeakerAlias") },
      whisper: [game.user.id],
    });
    await this._clearTurnState();
  }

  async _clearTurnState() {
    const system = this.actor.system;
    const updates = {
      "system.turnPhase": "",
      "system.turnUserId": "",
      "system.scenarioPoi": "",
      "system.turnGeneratedPois": [],
      "system.turnThreatIncrease": 0,
      "system.turnExtraPoisNextTurn": 0,
      "system.turnRoleplayBonus": 0,
      "system.turnReinforcementsReceived": 0,
      "system.turnExtraTacticalPoisNextTurn": 0,
      "system.turnExtraUnknownPoisNextTurn": 0,
      "system.turnStep": 1,
      "system.turnFlexibleDeployments": false,
      "system.nextTurnSupplyBonus": 0,
      // commandeeredAssets intentionally NOT cleared here — they persist until
      // the next turn starts so the badge remains visible between turns.
      "system.turnPendingNotes": "",
    };
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      const entries = foundry.utils.deepClone(system[listKey] || []);
      for (const entry of entries) {
        entry.eventResult = "";
        entry.conflictResult = "";
        entry.conflictSuccesses = 0;
        entry.conflictMomentum = 0;
        entry.conflictHadNat20 = false;
        entry.consequenceChosen = "";
        entry.failureChoice = "";
        entry.lossResult = "";
        entry.escalationRolled = false;
        entry.commandeeredAssetUuid = "";
        entry.outcomeConfirmed = false;
        entry.outcomeIgnored = false;
        entry.asset1Uuid = "";
        entry.asset2Uuid = "";
      }
      updates[`system.${listKey}`] = entries;
    }
    await this.actor.update(updates);
  }

  // ==========================================================================
  // Action Handlers — Asset Management
  // ==========================================================================

  /**
   * Show a dialog asking whether to also delete the world actor.
   * Returns true (delete actor too), false (remove from tracker only),
   * or null (cancelled).
   */
  static async _confirmRemove(actorName) {
    return foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize("STA_TC.CampaignTracker.RemoveTitle"),
      },
      content: `<p>${game.i18n.format("STA_TC.CampaignTracker.RemovePrompt", { name: actorName })}</p>`,
      buttons: [
        {
          action: "delete",
          label: game.i18n.localize("STA_TC.CampaignTracker.RemoveAndDelete"),
          icon: "fas fa-trash",
          default: false,
          callback: () => true,
        },
        {
          action: "remove",
          label: game.i18n.localize("STA_TC.CampaignTracker.RemoveOnly"),
          icon: "fas fa-times",
          default: true,
          callback: () => false,
        },
      ],
      rejectClose: false,
    });
  }

  static async _onRemoveAsset(event, target) {
    const keyMap = {
      character: "characterAssets",
      ship: "shipAssets",
      resource: "resourceAssets",
    };
    const key = keyMap[target.dataset.assetType];
    const list = [...(this.actor.system[key] || [])];
    const uuid = list[parseInt(target.dataset.index)];
    const actor = uuid ? await fromUuid(uuid) : null;
    const deleteActor = await CampaignTrackerSheet._confirmRemove(
      actor?.name ?? "",
    );
    if (deleteActor === null) return;
    list.splice(parseInt(target.dataset.index), 1);
    await this.actor.update({ [`system.${key}`]: list });
    if (deleteActor && actor) await actor.delete();
  }

  static async _onOpenActor(event, target) {
    const actor = await fromUuid(target.dataset.uuid);
    if (actor) actor.sheet.render(true);
  }

  static async _onCreateRandomAsset(event, target) {
    // Roll 1d20 to determine asset type per the campaign rules:
    // 1–5: Resource, 6–10: Ship, 11–15: Character if ≤2 Character assets else Ship, 16–20: Character
    const roll = await new Roll("1d20").evaluate();
    let typeChoice;
    if (roll.total <= 5) {
      typeChoice = "resource";
    } else if (roll.total <= 10) {
      typeChoice = "ship";
    } else if (roll.total <= 15) {
      const characterCount = (this.actor.system.characterAssets || []).length;
      typeChoice = characterCount <= 2 ? "character" : "ship";
    } else {
      typeChoice = "character";
    }

    const result = await AssetGenerator.generateForType(typeChoice);
    if (!result?.actor) return;
    // Import the actor into the world (tracker's folder) if it came from a compendium.
    const actor = await this._importActorIfNeeded(result.actor);
    if (!actor) return;
    const assetTypeFolder = await this._getOrCreateAssetFolder(typeChoice);
    if (assetTypeFolder) await actor.update({ folder: assetTypeFolder.id });
    const keyMap = {
      character: "characterAssets",
      ship: "shipAssets",
      resource: "resourceAssets",
    };
    const key = keyMap[actor.system?.assetType || "resource"];
    const list = [...(this.actor.system[key] || [])];
    if (!list.includes(actor.uuid)) {
      list.push(actor.uuid);
      const updates = { [`system.${key}`]: list };
      if (this.actor.system.turnPhase === "3")
        updates["system.turnReinforcementsReceived"] =
          (this.actor.system.turnReinforcementsReceived || 0) + 1;
      await this.actor.update(updates);
    }
  }

  static async _onCreateCustomAsset(event, target) {
    const actor = await Actor.create({
      name: game.i18n.localize("STA_TC.AssetName"),
      type: `${MODULE_ID}.asset`,
    });
    if (!actor) return;
    actor.sheet.render(true);
    const list = [...(this.actor.system.resourceAssets || [])];
    if (!list.includes(actor.uuid)) {
      list.push(actor.uuid);
      const updates = { "system.resourceAssets": list };
      if (this.actor.system.turnPhase === "3")
        updates["system.turnReinforcementsReceived"] =
          (this.actor.system.turnReinforcementsReceived || 0) + 1;
      await this.actor.update(updates);
    }
  }

  static async _onCreateAssetForType(event, target) {
    const assetType = target.dataset.assetType;
    const typeName = game.i18n.localize(
      `STA_TC.Asset.Generator.Types.${assetType.charAt(0).toUpperCase() + assetType.slice(1)}`,
    );
    const choice = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.format("STA_TC.CampaignTracker.AddAsset", {
          type: typeName,
        }),
      },
      content: `<p>${game.i18n.format("STA_TC.CampaignTracker.AddAsset", { type: typeName })}</p>`,
      buttons: [
        {
          action: "random",
          label: game.i18n.localize("STA_TC.CampaignTracker.CreateRandomAsset"),
          icon: "fas fa-random",
          default: true,
          callback: () => "random",
        },
        {
          action: "custom",
          label: game.i18n.localize("STA_TC.CampaignTracker.CreateCustomAsset"),
          icon: "fas fa-plus",
          default: false,
          callback: () => "custom",
        },
      ],
      rejectClose: false,
    });
    if (!choice) return;

    const keyMap = {
      character: "characterAssets",
      ship: "shipAssets",
      resource: "resourceAssets",
    };
    const key = keyMap[assetType] ?? "resourceAssets";

    if (choice === "random") {
      const result = await AssetGenerator.generateForType(assetType);
      if (!result?.actor) return;
      const actor = await this._importActorIfNeeded(result.actor);
      if (!actor) return;
      const assetTypeFolder = await this._getOrCreateAssetFolder(assetType);
      if (assetTypeFolder) await actor.update({ folder: assetTypeFolder.id });
      const list = [...(this.actor.system[key] || [])];
      if (!list.includes(actor.uuid)) {
        list.push(actor.uuid);
        const updates = { [`system.${key}`]: list };
        if (this.actor.system.turnPhase === "3")
          updates["system.turnReinforcementsReceived"] =
            (this.actor.system.turnReinforcementsReceived || 0) + 1;
        await this.actor.update(updates);
      }
    } else {
      const actor = await Actor.create({
        name: game.i18n.localize("STA_TC.AssetName"),
        type: `${MODULE_ID}.asset`,
        system: { assetType },
      });
      if (!actor) return;
      actor.sheet.render(true);
      const list = [...(this.actor.system[key] || [])];
      if (!list.includes(actor.uuid)) {
        list.push(actor.uuid);
        const updates = { [`system.${key}`]: list };
        if (this.actor.system.turnPhase === "3")
          updates["system.turnReinforcementsReceived"] =
            (this.actor.system.turnReinforcementsReceived || 0) + 1;
        await this.actor.update(updates);
      }
    }
  }

  // ==========================================================================
  // Action Handlers — POI Management
  // ==========================================================================

  static async _onRemovePoi(event, target) {
    const listKey = target.dataset.poiList;
    const entries = [...(this.actor.system[listKey] || [])];
    const uuid = entries[parseInt(target.dataset.index)]?.actorUuid;
    const actor = uuid ? await fromUuid(uuid) : null;
    const deleteActor = await CampaignTrackerSheet._confirmRemove(
      actor?.name ?? "",
    );
    if (deleteActor === null) return;
    entries.splice(parseInt(target.dataset.index), 1);
    await this.actor.update({ [`system.${listKey}`]: entries });
    if (deleteActor && actor) await actor.delete();
  }

  static async _onRemovePoiAsset(event, target) {
    event.stopPropagation();
    const listKey = target.dataset.poiList;
    const poiIndex = parseInt(target.dataset.poiIndex);
    const field =
      parseInt(target.dataset.slot) === 0 ? "asset1Uuid" : "asset2Uuid";
    const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
    if (!entries[poiIndex]) return;
    entries[poiIndex][field] = "";
    await this.actor.update({ [`system.${listKey}`]: entries });
  }

  static async _onRecallAsset(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const lists = [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ];
    const updates = {};
    for (const listKey of lists) {
      const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
      let changed = false;
      for (const entry of entries) {
        if (entry.asset1Uuid === uuid) {
          entry.asset1Uuid = "";
          changed = true;
        }
        if (entry.asset2Uuid === uuid) {
          entry.asset2Uuid = "";
          changed = true;
        }
      }
      if (changed) updates[`system.${listKey}`] = entries;
    }
    if (Object.keys(updates).length) await this.actor.update(updates);
  }

  static async _onAssignAsset(event, target) {
    const listKey = target.dataset.poiList;
    const poiIndex = parseInt(target.dataset.poiIndex);
    const slot = parseInt(target.dataset.slot);
    const field = slot === 0 ? "asset1Uuid" : "asset2Uuid";

    const system = this.actor.system;
    const allUuids = [
      ...(system.characterAssets || []),
      ...(system.shipAssets || []),
      ...(system.resourceAssets || []),
    ];

    const available = [];
    for (const uuid of allUuids) {
      if (!this._isAssetAssignedToAnyPoi(uuid)) {
        const actor = await fromUuid(uuid);
        if (
          actor &&
          !actor.effects?.some((e) => e.flags?.[MODULE_ID]?.unavailable) &&
          !actor.effects?.some((e) => e.flags?.[MODULE_ID]?.lost) &&
          !(slot === 0 && actor.system?.assetType === "resource")
        ) {
          const powers = actor.system?.powers;
          const stats = powers
            ? [
                { abbr: "Mil", val: powers.military?.value || 0 },
                { abbr: "Med", val: powers.medical?.value || 0 },
                { abbr: "Per", val: powers.personal?.value || 0 },
                { abbr: "Sci", val: powers.science?.value || 0 },
                { abbr: "Soc", val: powers.social?.value || 0 },
              ]
                .filter((p) => p.val > 0)
                .map((p) => `${p.abbr} ${p.val}`)
                .join(", ")
            : "";
          available.push({ uuid, name: actor.name, img: actor.img, stats });
        }
      } else {
        // For resource assets with Flexible Deployments, allow a second assignment
        const actor = await fromUuid(uuid);
        if (
          actor &&
          actor.system?.assetType === "resource" &&
          slot !== 0 &&
          !actor.effects?.some((e) => e.flags?.[MODULE_ID]?.unavailable) &&
          !actor.effects?.some((e) => e.flags?.[MODULE_ID]?.lost)
        ) {
          const limit = this.actor.system.turnFlexibleDeployments ? 2 : 1;
          if (this._countResourceAssignments(uuid) < limit) {
            const powers = actor.system?.powers;
            const stats = powers
              ? [
                  { abbr: "Mil", val: powers.military?.value || 0 },
                  { abbr: "Med", val: powers.medical?.value || 0 },
                  { abbr: "Per", val: powers.personal?.value || 0 },
                  { abbr: "Sci", val: powers.science?.value || 0 },
                  { abbr: "Soc", val: powers.social?.value || 0 },
                ]
                  .filter((p) => p.val > 0)
                  .map((p) => `${p.abbr} ${p.val}`)
                  .join(", ")
              : "";
            available.push({ uuid, name: actor.name, img: actor.img, stats });
          }
        }
      }
    }

    if (!available.length) {
      ui.notifications.info(
        game.i18n.localize("STA_TC.CampaignTracker.NoUnassignedAssets"),
      );
      return;
    }

    const rows = available
      .map(
        (a, i) =>
          `<label class="asset-picker-row">
        <input type="radio" name="assetUuid" value="${a.uuid}" ${i === 0 ? "checked" : ""} />
        <img src="${a.img}" width="26" height="26" style="border-radius:3px;object-fit:cover;flex-shrink:0;" />
        <div class="asset-picker-info">
          <span class="asset-picker-name">${a.name}</span>
          ${a.stats ? `<span class="asset-picker-stats">${a.stats}</span>` : ""}
        </div>
      </label>`,
      )
      .join("");

    const uuid = await foundry.applications.api.DialogV2.prompt({
      window: {
        title: game.i18n.localize("STA_TC.CampaignTracker.AssignAsset"),
      },
      content: `<div class="asset-picker-list">${rows}</div>`,
      ok: {
        label: game.i18n.localize("STA_TC.CampaignTracker.Assign"),
        callback: (_ev, button) => button.form.elements.assetUuid.value || null,
      },
      rejectClose: false,
    });

    if (!uuid) return;
    const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
    if (!entries[poiIndex]) return;
    entries[poiIndex][field] = uuid;
    await this.actor.update({ [`system.${listKey}`]: entries });
  }

  static async _onGeneratePoi(event, target) {
    const result = await PoiGenerator.generate();
    if (!result?.actor) return;
    const actor = result.actor;
    const folder = await this._getOrCreatePoiFolder(
      actor.system?.poiType || "unknown",
    );
    // Start hidden so the GM can prep before revealing to players
    await actor.update({
      folder: folder?.id ?? null,
      "system.hiddenByGM": true,
    });
    const uuid = actor.uuid;
    const listKey = CampaignTrackerSheet._poiTypeToListKey(
      actor,
      "poiListUnknown",
    );
    const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
    if (!entries.some((e) => e.actorUuid === uuid))
      entries.push({ actorUuid: uuid, asset1Uuid: "", asset2Uuid: "" });
    const generated = [...(this.actor.system.turnGeneratedPois || []), uuid];
    await this.actor.update({
      [`system.${listKey}`]: entries,
      "system.turnGeneratedPois": generated,
    });
  }

  static async _onCreateCustomPoi(event, target) {
    const folder = await this._getOrCreatePoiFolder("unknown");
    const actor = await Actor.create({
      name: game.i18n.localize("STA_TC.PoiName"),
      type: `${MODULE_ID}.poi`,
      folder: folder?.id ?? null,
      "system.hiddenByGM": true,
    });
    if (!actor) return;
    actor.sheet.render(true);
    const uuid = actor.uuid;
    const listKey = CampaignTrackerSheet._poiTypeToListKey(
      actor,
      "poiListUnknown",
    );
    const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
    if (!entries.some((e) => e.actorUuid === uuid))
      entries.push({ actorUuid: uuid, asset1Uuid: "", asset2Uuid: "" });
    const generated = [...(this.actor.system.turnGeneratedPois || []), uuid];
    await this.actor.update({
      [`system.${listKey}`]: entries,
      "system.turnGeneratedPois": generated,
    });
  }

  static async _onGenerateAllPois(event, target) {
    const system = this.actor.system;
    const pace =
      (system.pace || 0) +
      (system.turnExtraTacticalPoisNextTurn || 0) +
      (system.turnExtraUnknownPoisNextTurn || 0);
    if (pace <= 0) {
      ui.notifications.warn(game.i18n.localize("STA_TC.Wizard.PaceIsZero"));
      return;
    }
    for (let i = 0; i < pace; i++) {
      const result = await PoiGenerator.generate();
      if (!result?.actor) continue;
      const actor = await this._importActorIfNeeded(result.actor);
      if (!actor) continue;
      const poiFolder = await this._getOrCreatePoiFolder(
        actor.system?.poiType || "unknown",
      );
      // Start hidden so the GM can prep before revealing to players
      await actor.update({
        folder: poiFolder?.id ?? null,
        "system.hiddenByGM": true,
      });
      const uuid = actor.uuid;
      const listKey = CampaignTrackerSheet._poiTypeToListKey(
        actor,
        "poiListUnknown",
      );
      // Re-read system each iteration to get the latest state
      const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
      if (!entries.some((e) => e.actorUuid === uuid))
        entries.push({ actorUuid: uuid, asset1Uuid: "", asset2Uuid: "" });
      const generated = [...(this.actor.system.turnGeneratedPois || []), uuid];
      await this.actor.update({
        [`system.${listKey}`]: entries,
        "system.turnGeneratedPois": generated,
      });
    }
  }

  static async _onRemoveGeneratedPoi(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const actor = await fromUuid(uuid);
    const deleteActor = await CampaignTrackerSheet._confirmRemove(
      actor?.name ?? "",
    );
    if (deleteActor === null) return;
    const generated = (this.actor.system.turnGeneratedPois || []).filter(
      (u) => u !== uuid,
    );
    const updates = { "system.turnGeneratedPois": generated };
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      const filtered = (this.actor.system[listKey] || []).filter(
        (e) => e.actorUuid !== uuid,
      );
      if (filtered.length !== (this.actor.system[listKey] || []).length)
        updates[`system.${listKey}`] = filtered;
    }
    await this.actor.update(updates);
    if (deleteActor && actor) await actor.delete();
  }

  static async _onSelectScenario(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    await this.actor.update({
      "system.scenarioPoi": this.actor.system.scenarioPoi === uuid ? "" : uuid,
    });
  }

  // ==========================================================================
  // Action Handlers — Events (Phase 1c)
  // ==========================================================================

  static async _onRollEvent(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const poi = await fromUuid(uuid);
    await this._rollEventForPoi(uuid);
    const listKey = [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]
      .flatMap((k) => this.actor.system[k] || [])
      .find((e) => e.actorUuid === uuid);
    const resultName = listKey?.eventResult || "";
    if (resultName)
      ui.notifications.info(`${poi?.name || "POI"}: ${resultName}`);
  }

  static async _onResetEvent(event, target) {
    // GM-only safeguard, even if someone injects the button client-side.
    if (!game.user?.isGM) return;
    const poiUuid = target.dataset.uuid;
    if (!poiUuid) return;

    const poi = await fromUuid(poiUuid);
    if (poi) {
      const eventIds = poi.items
        .filter((i) => i.type === `${MODULE_ID}.event`)
        .map((i) => i.id);
      if (eventIds.length) await poi.deleteEmbeddedDocuments("Item", eventIds);
    }

    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
      const idx = entries.findIndex((e) => e.actorUuid === poiUuid);
      if (idx !== -1) {
        entries[idx].eventResult = "";
        await this.actor.update({ [`system.${listKey}`]: entries });
        break;
      }
    }
  }

  static async _onRollRandomEvent(event, target) {
    if (!game.settings.get(MODULE_ID, "tableEvents")) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Wizard.EventTableNotConfigured"),
      );
      return;
    }
    const scenarioPoi = this.actor.system.scenarioPoi || "";
    const allUuids = [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]
      .flatMap((k) => this.actor.system[k] || [])
      .map((e) => e.actorUuid)
      .filter((uuid) => uuid && uuid !== scenarioPoi);
    if (!allUuids.length) {
      ui.notifications.warn(game.i18n.localize("STA_TC.Wizard.NoPoisForEvent"));
      return;
    }
    const randomUuid = allUuids[Math.floor(Math.random() * allUuids.length)];
    await this._rollEventForPoi(randomUuid);
  }

  async _rollEventForPoi(poiUuid) {
    const tableUuid = game.settings.get(MODULE_ID, "tableEvents");
    if (!tableUuid) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Wizard.EventTableNotConfigured"),
      );
      return;
    }
    const table = await fromUuid(tableUuid);
    if (!table) {
      ui.notifications.error(
        game.i18n.format("STA_TC.Poi.Generator.TableNotFound", {
          name: "Events",
        }),
      );
      return;
    }

    const roll = await table.roll();
    const result = roll.results?.[0];

    // Prefer a directly-referenced Event item document in the table result.
    let itemData = null;
    const docUuid = result?.documentUuid?.trim();
    if (docUuid) {
      const doc = await fromUuid(docUuid);
      if (doc?.documentName === "Item" && doc.type === `${MODULE_ID}.event`) {
        itemData = doc.toObject();
        for (const effect of itemData.effects ?? []) effect.transfer = true;
      }
    }

    // Fallback: build a minimal event from the roll result text.
    const resultText = result?.text || result?.name || "No result";
    const resultName =
      result?.name && result.name !== resultText
        ? result.name
        : resultText
            .split(/[.:!?]/)[0]
            .trim()
            .slice(0, 60);
    if (!itemData) {
      itemData = {
        name: resultName || game.i18n.localize("STA_TC.EventName"),
        type: `${MODULE_ID}.event`,
        system: { description: resultText },
      };
    }

    // Embed the event item on the PoI actor, enforcing the 1-event limit.
    const poi = await fromUuid(poiUuid);
    if (poi) {
      const existingIds = poi.items
        .filter((i) => i.type === `${MODULE_ID}.event`)
        .map((i) => i.id);
      if (existingIds.length)
        await poi.deleteEmbeddedDocuments("Item", existingIds);
      await poi.createEmbeddedDocuments("Item", [itemData]);
    }

    // Update the tracker entry's eventResult (drives the Roll/Reroll button label).
    const displayName = itemData.name;
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
      const idx = entries.findIndex((e) => e.actorUuid === poiUuid);
      if (idx !== -1) {
        entries[idx].eventResult = displayName;
        await this.actor.update({ [`system.${listKey}`]: entries });
        break;
      }
    }
  }

  // ==========================================================================
  // Action Handlers — Conflicts (Phase 2)
  // ==========================================================================

  static async _onRollConflict(event, target) {
    const poiUuid = target.dataset.uuid;
    if (!poiUuid) return;
    const poi = await fromUuid(poiUuid);
    if (!poi) return;
    const poiPower = poi.system?.power || "military";
    const poiPowerLabel = game.i18n.localize(
      `STA_TC.Powers.${this._capitalize(poiPower)}`,
    );
    const difficulty = poi.system?.difficulty || 1;
    const power2 = poi.system?.power2 || null;
    const difficulty2 = poi.system?.difficulty2 ?? 1;
    const powerLabel2 = power2
      ? game.i18n.localize(`STA_TC.Powers.${this._capitalize(power2)}`)
      : null;
    let primaryUuid = null,
      assistUuid = null;
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      for (const entry of this.actor.system[listKey] || []) {
        if (entry.actorUuid === poiUuid) {
          primaryUuid = entry.asset1Uuid;
          assistUuid = entry.asset2Uuid;
          break;
        }
      }
      if (primaryUuid !== null) break;
    }
    const primaryActor = primaryUuid ? await fromUuid(primaryUuid) : null;
    const assistActor = assistUuid ? await fromUuid(assistUuid) : null;
    if (!primaryActor) return;
    const primaryPowers = primaryActor.system?.powers?.[poiPower] || {
      value: 0,
      focus: 0,
    };
    const primaryPowers2 = power2
      ? primaryActor.system?.powers?.[power2] || { value: 0, focus: 0 }
      : null;
    const assistPowers = assistActor?.system?.powers?.[poiPower] || {
      value: 0,
      focus: 0,
    };
    const assistPowers2 =
      power2 && assistActor
        ? assistActor.system?.powers?.[power2] || { value: 0, focus: 0 }
        : null;
    const powerSelectSection = power2
      ? `<p style="margin:0 0 4px;"><strong>${poi.name}</strong></p>
      <p style="margin:0 0 4px;font-weight:bold;">${game.i18n.localize("STA_TC.Dialog.ChoosePower")}:</p>
      <label style="display:block;margin-bottom:4px;"><input type="radio" name="selectedPower" value="${poiPower}" checked> <strong>${poiPowerLabel} D${difficulty}</strong> &mdash; ${primaryActor.name}: ${poiPowerLabel} ${primaryPowers.value} / Focus ${primaryPowers.focus}</label>
      <label style="display:block;margin-bottom:4px;"><input type="radio" name="selectedPower" value="${power2}"> <strong>${powerLabel2} D${difficulty2}</strong> &mdash; ${primaryActor.name}: ${powerLabel2} ${primaryPowers2.value} / Focus ${primaryPowers2.focus}</label>`
      : `<p style="margin:0 0 2px;"><strong>${poi.name}</strong> &mdash; ${poiPowerLabel} &middot; ${game.i18n.localize("STA_TC.Wizard.Difficulty")}: ${difficulty}</p>
      <p style="margin:0 0 6px;"><em>${primaryActor.name}</em> &mdash; ${poiPowerLabel} ${primaryPowers.value} / Focus ${primaryPowers.focus}</p>`;
    const assistSection = assistActor
      ? `<hr style="margin:6px 0;">
      <p style="margin:0 0 2px;"><strong>${game.i18n.localize("STA_TC.Wizard.AssistingAsset")}</strong>: ${assistActor.name}${power2 ? "" : ` &mdash; ${poiPowerLabel} ${assistPowers.value} / Focus ${assistPowers.focus}`}</p>
      <div class="row"><div class="tracktitle">${game.i18n.localize("STA_TC.Dialog.UsingFocus")}</div><input type="checkbox" name="assistFocus" id="assistFocus" checked></div>`
      : "";

    // Render STA's own dice pool template for the standard roll options
    const staRoll = new STARoll();
    const calculatedComplicationRange = await staRoll._sceneComplications();
    const staDialogHTMLRaw =
      await foundry.applications.handlebars.renderTemplate(
        "systems/sta/templates/apps/dicepool-attribute2e.hbs",
        {
          calculatedComplicationRange,
          defaultValue: "2",
          starships: [],
          systems: [],
          departments: [],
        },
      );

    // Remove the "Is Ship Assisting" row/section (not relevant for campaign rolls)
    // and default the Focus checkbox to checked.
    const _doc = new DOMParser().parseFromString(staDialogHTMLRaw, "text/html");
    _doc.querySelector("#starshipAssisting")?.closest(".row")?.remove();
    _doc.querySelector(".starshipAssisting")?.remove();
    const _focusBox = _doc.querySelector("#usingFocus");
    if (_focusBox) _focusBox.setAttribute("checked", "checked");
    const staDialogHTML = _doc.body.innerHTML;

    const content = `<div style="padding:4px 8px 0;">${powerSelectSection}</div>${staDialogHTML}${assistSection ? `<div style="padding:0 8px;">${assistSection}</div>` : ""}`;

    const formData = await foundry.applications.api.DialogV2.wait({
      window: {
        title: `${game.i18n.localize("STA_TC.Wizard.RollConflict")}: ${poi.name}`,
      },
      position: { height: "auto", width: 375 },
      content,
      classes: ["dialogue"],
      buttons: [
        {
          action: "roll",
          default: true,
          label: game.i18n.localize("STA_TC.Wizard.RollConflict"),
          icon: "fas fa-dice-d20",
          callback: (_ev, _button, dialog) => {
            const form = dialog.element.querySelector("form");
            return form ? new FormData(form) : null;
          },
        },
      ],
      close: () => null,
    });
    if (!formData) return;
    const formValues = {
      diceCount: parseInt(formData.get("dicePoolSlider") || "2"),
      usingFocus: formData.get("usingFocus") === "on",
      usingDedicatedFocus: formData.get("usingDedicatedFocus") === "on",
      usingDetermination: formData.get("usingDetermination") === "on",
      complicationRange: parseInt(formData.get("complicationRange") || "1"),
      assistFocus: formData.get("assistFocus") === "on",
      selectedPower: formData.get("selectedPower") ?? null,
    };
    if (!formValues) return;
    const {
      diceCount,
      usingFocus,
      usingDedicatedFocus,
      usingDetermination,
      complicationRange,
      assistFocus,
      selectedPower,
    } = formValues;
    const chosenPower =
      selectedPower && selectedPower !== poiPower ? power2 : poiPower;
    const chosenDifficulty = chosenPower === power2 ? difficulty2 : difficulty;
    const chosenPrimaryPowers =
      chosenPower === power2 ? primaryPowers2 : primaryPowers;
    const chosenAssistPowers =
      chosenPower === power2 ? assistPowers2 : assistPowers;
    const primaryResult = await this._performRoll(
      diceCount,
      chosenPrimaryPowers.value,
      chosenPrimaryPowers.focus,
      usingFocus,
      usingDedicatedFocus,
      usingDetermination,
      complicationRange,
      primaryActor.name,
      poi.name,
      chosenPower,
    );
    const assistResult = assistActor
      ? await this._performRoll(
          1,
          chosenAssistPowers.value,
          chosenAssistPowers.focus,
          assistFocus,
          false,
          false,
          complicationRange,
          assistActor.name,
          poi.name,
          chosenPower,
        )
      : null;
    const totalSuccesses =
      primaryResult.successes + (assistResult?.successes || 0);
    const hadNat20 = primaryResult.hadNat20 || assistResult?.hadNat20 || false;
    await this._postConflictRollSummaryChat({
      poi,
      primaryActor,
      assistActor,
      chosenPower,
      primaryResult,
      assistResult,
      totalSuccesses,
    });
    // Store advisory data only — the GM must still click Pass or Fail to resolve.
    // conflictResult is intentionally left blank so the conflict stays unresolved.
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
      const idx = entries.findIndex((e) => e.actorUuid === poiUuid);
      if (idx !== -1) {
        entries[idx].conflictSuccesses = totalSuccesses;
        entries[idx].conflictHadNat20 = hadNat20;
        await this.actor.update({ [`system.${listKey}`]: entries });
        break;
      }
    }
  }

  static async _onSetConflictResult(event, target) {
    const poiUuid = target.dataset.uuid;
    const intent = target.dataset.result; // "success" or "failure"
    if (!poiUuid || !intent) return;
    // Load the POI to get difficulty for momentum calculation
    const poi = await fromUuid(poiUuid);
    const difficulty = poi?.system?.difficulty || 1;
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
      const idx = entries.findIndex((e) => e.actorUuid === poiUuid);
      if (idx !== -1) {
        const advisorySuccesses = entries[idx].conflictSuccesses || 0;
        const advisoryNat20 = entries[idx].conflictHadNat20 || false;
        // Derive result flavour from the GM's pass/fail intent + any advisory roll data
        let finalResult;
        let finalMomentum = 0;
        if (intent === "success") {
          finalResult = advisoryNat20 ? "flawedSuccess" : "success";
          finalMomentum = Math.max(0, advisorySuccesses - difficulty);
        } else if (advisoryNat20) {
          // Built-in roll recorded a nat20 complication — auto serious setback.
          finalResult = "seriousSetback";
        } else {
          // No nat20 in advisory data; ask the GM whether a complication was rolled.
          const isSeriousSetback = await foundry.applications.api.DialogV2.wait(
            {
              window: {
                title: game.i18n.localize("STA_TC.Wizard.RollConflict"),
              },
              content: `<p>${game.i18n.localize("STA_TC.Dialog.FailureTypePrompt")}</p>`,
              buttons: [
                {
                  action: "serious",
                  label: game.i18n.localize(
                    "STA_TC.Wizard.ResultSeriousSetback",
                  ),
                  icon: "fas fa-skull",
                  default: false,
                  callback: () => true,
                },
                {
                  action: "failure",
                  label: game.i18n.localize("STA_TC.Wizard.ResultFailure"),
                  icon: "fas fa-times",
                  default: true,
                  callback: () => false,
                },
              ],
              rejectClose: false,
            },
          );
          if (isSeriousSetback === null) return;
          finalResult = isSeriousSetback ? "seriousSetback" : "failure";
        }
        entries[idx].conflictResult = finalResult;
        entries[idx].conflictMomentum = finalMomentum;
        await this.actor.update({ [`system.${listKey}`]: entries });
        break;
      }
    }
  }

  static async _onResetConflictRoll(event, target) {
    const poiUuid = target.dataset.uuid;
    if (!poiUuid) return;
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
      const idx = entries.findIndex((e) => e.actorUuid === poiUuid);
      if (idx !== -1) {
        entries[idx].conflictResult = "";
        entries[idx].conflictSuccesses = 0;
        entries[idx].conflictMomentum = 0;
        entries[idx].conflictHadNat20 = false;
        entries[idx].consequenceChosen = "";
        entries[idx].failureChoice = "";
        entries[idx].lossResult = "";
        await this.actor.update({ [`system.${listKey}`]: entries });
        break;
      }
    }
  }

  static async _onChooseConsequence(event, target) {
    const poiUuid = target.dataset.uuid;
    const consequence = target.dataset.consequence;
    if (!poiUuid || !consequence) return;
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
      const idx = entries.findIndex((e) => e.actorUuid === poiUuid);
      if (idx === -1) continue;
      const updates = {};
      if (consequence === "extraPoi") {
        updates["system.turnExtraPoisNextTurn"] =
          (this.actor.system.turnExtraPoisNextTurn || 0) + 1;
        entries[idx].consequenceChosen = "extraPoi";
        const poiExtra = await fromUuid(poiUuid);
        await this._appendPendingNote(
          game.i18n.format("STA_TC.Wizard.NoteExtraPoi", {
            name: poiExtra?.name || "?",
          }),
        );
        ui.notifications.info(
          game.i18n.localize("STA_TC.Wizard.ConsequenceExtraPoi"),
        );
      } else if (consequence === "rollLoss") {
        await this._rollForLoss(poiUuid);
        entries[idx].consequenceChosen = "rollLoss";
      } else if (consequence === "increaseThreat") {
        const poi = await fromUuid(poiUuid);
        const amt = (poi?.system?.difficulty || 1) * 2;
        updates["system.turnThreatIncrease"] =
          (this.actor.system.turnThreatIncrease || 0) + amt;
        entries[idx].consequenceChosen = "increaseThreat";
        await this._appendPendingNote(
          game.i18n.format("STA_TC.Wizard.NoteIncreaseThreat", {
            amount: amt,
            name: poi?.name || "?",
          }),
        );
        ui.notifications.info(
          game.i18n.format("STA_TC.Wizard.ConsequenceIncreaseThreat", {
            amount: amt,
          }),
        );
      }
      updates[`system.${listKey}`] = entries;
      await this.actor.update(updates);
      break;
    }
  }

  static async _onChooseFailureOption(event, target) {
    const poiUuid = target.dataset.uuid;
    const option = target.dataset.option;
    if (!poiUuid || !option) return;
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
      const idx = entries.findIndex((e) => e.actorUuid === poiUuid);
      if (idx === -1) continue;
      if (option === "withdraw") entries[idx].failureChoice = "withdraw";
      if (option === "succeedAtCost") {
        entries[idx].conflictResult = "flawedSuccess";
        entries[idx].failureChoice = "succeedAtCost";
      }
      await this.actor.update({ [`system.${listKey}`]: entries });
      break;
    }
  }

  // ==========================================================================
  // Action Handlers — Phase 3 Outcomes
  // ==========================================================================

  static async _onPhase3Next(event, target) {
    const current = this.actor.system.turnStep || 1;
    if (current >= 4) return;
    await this.actor.update({ "system.turnStep": current + 1 });
  }

  static async _onPhase3Prev(event, target) {
    const current = this.actor.system.turnStep || 1;
    if (current <= 1) return;
    await this.actor.update({ "system.turnStep": current - 1 });
  }

  static async _onRollEscalation(event, target) {
    const listKey = target.dataset.listKey;
    const entryIndex = parseInt(target.dataset.entryIndex);
    if (!listKey || isNaN(entryIndex)) return;
    const tableUuid = game.settings.get(MODULE_ID, "tableEscalation");
    if (!tableUuid) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Wizard.EscalationTableNotConfigured"),
      );
      return;
    }
    const table = await fromUuid(tableUuid);
    if (!table) {
      ui.notifications.error(
        game.i18n.format("STA_TC.Poi.Generator.TableNotFound", {
          name: "Escalation",
        }),
      );
      return;
    }
    const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
    if (!entries[entryIndex]) return;
    const roll = await table.roll();
    const resultText =
      roll.results?.[0]?.text || roll.results?.[0]?.name || "No result";
    entries[entryIndex].escalationRolled = true;
    await this.actor.update({ [`system.${listKey}`]: entries });
    const poi = await fromUuid(entries[entryIndex].actorUuid);
    await ChatMessage.create({
      content: `<div style="background:#333;border-radius:8px;padding:10px;color:#eee;border-left:4px solid #e67e22;">
        <h3 style="margin:0 0 6px;color:#e67e22;">\u26a0\ufe0f ${game.i18n.localize("STA_TC.Wizard.EscalationResult")}</h3>
        <p><strong>${poi?.name || "POI"}:</strong> ${resultText}</p>
      </div>`,
      speaker: { alias: game.i18n.localize("STA_TC.Wizard.SpeakerAlias") },
      whisper: [game.user.id],
    });
  }

  static async _onRollCommandeer(event, target) {
    const listKey = target.dataset.listKey;
    const entryIndex = parseInt(target.dataset.entryIndex);
    if (!listKey || isNaN(entryIndex)) return;
    const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
    if (!entries[entryIndex]) return;
    // Don't overwrite a previously commandeered asset
    if (entries[entryIndex].commandeeredAssetUuid) return;
    const system = this.actor.system;
    const alreadyCommandeered = system.commandeeredAssets || [];
    const pool = [
      ...(system.characterAssets || []),
      ...(system.shipAssets || []),
      ...(system.resourceAssets || []),
    ].filter((uuid) => !alreadyCommandeered.includes(uuid));
    if (!pool.length) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Wizard.NoAssetsToCommandeer"),
      );
      return;
    }
    const chosenUuid = pool[Math.floor(Math.random() * pool.length)];
    const asset = await fromUuid(chosenUuid);
    entries[entryIndex].commandeeredAssetUuid = chosenUuid;
    entries[entryIndex].outcomeConfirmed = true;
    await this.actor.update({ [`system.${listKey}`]: entries });
    ui.notifications.info(
      game.i18n.format("STA_TC.Wizard.AssetCommandeered", {
        name: asset?.name || chosenUuid,
      }),
    );
  }

  // ==========================================================================
  // Helpers — Notes
  // ==========================================================================

  async _appendPendingNote(text) {
    const current = this.actor.system.turnPendingNotes || "";
    const updated = current ? `${current}\n${text}` : text;
    await this.actor.update({ "system.turnPendingNotes": updated });
  }

  // ==========================================================================
  // Action Handlers — Phase 3 Outcome Buttons
  // ==========================================================================

  static async _onConfirmOutcomeResolved(event, target) {
    const listKey = target.dataset.listKey;
    const entryIndex = parseInt(target.dataset.entryIndex);
    if (!listKey || isNaN(entryIndex)) return;
    const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
    if (!entries[entryIndex]) return;
    const actorUuid = entries[entryIndex].actorUuid;
    const poiActor = actorUuid ? await fromUuid(actorUuid) : null;
    const deleteActor = await CampaignTrackerSheet._confirmRemove(
      poiActor?.name ?? "",
    );
    if (deleteActor === null) return;
    entries.splice(entryIndex, 1);
    await this.actor.update({ [`system.${listKey}`]: entries });
    if (deleteActor && poiActor) await poiActor.delete();
    ui.notifications.info(game.i18n.localize("STA_TC.Wizard.Resolved"));
  }

  static async _onConfirmOutcomeIntensify(event, target) {
    const listKey = target.dataset.listKey;
    const entryIndex = parseInt(target.dataset.entryIndex);
    if (!listKey || isNaN(entryIndex)) return;
    const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
    if (!entries[entryIndex]) return;
    const poi = await fromUuid(entries[entryIndex].actorUuid);
    if (poi) {
      const urgency = poi.system?.urgency || 1;
      const poiUpdates = {
        "system.urgency": Math.min(5, urgency + 1),
        "system.difficulty": Math.min(5, (poi.system?.difficulty || 1) + 1),
      };
      if (poi.system?.difficulty2 != null)
        poiUpdates["system.difficulty2"] = Math.min(
          5,
          poi.system.difficulty2 + 1,
        );
      await poi.update(poiUpdates);
    }
    entries[entryIndex].outcomeConfirmed = true;
    await this.actor.update({ [`system.${listKey}`]: entries });
    ui.notifications.info(
      game.i18n.localize("STA_TC.Wizard.OutcomeIntensify1Short"),
    );
  }

  static async _onConfirmOutcomeCatastrophe(event, target) {
    const listKey = target.dataset.listKey;
    const entryIndex = parseInt(target.dataset.entryIndex);
    if (!listKey || isNaN(entryIndex)) return;
    const system = this.actor.system;
    const entries = foundry.utils.deepClone(system[listKey] || []);
    if (!entries[entryIndex]) return;
    entries.splice(entryIndex, 1);
    await this.actor.update({
      [`system.${listKey}`]: entries,
      "system.pace": (system.pace || 0) + 1,
    });
    ui.notifications.info(
      game.i18n.localize("STA_TC.Wizard.OutcomeCatastropheShort"),
    );
  }

  static async _onConfirmOutcomeDiffIncrease(event, target) {
    const listKey = target.dataset.listKey;
    const entryIndex = parseInt(target.dataset.entryIndex);
    if (!listKey || isNaN(entryIndex)) return;
    const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
    if (!entries[entryIndex]) return;
    const poi = await fromUuid(entries[entryIndex].actorUuid);
    if (poi) {
      const poiUpdates = {
        "system.missedCount": 1,
        "system.difficulty": Math.min(5, (poi.system?.difficulty || 1) + 1),
      };
      if (poi.system?.difficulty2 != null)
        poiUpdates["system.difficulty2"] = Math.min(
          5,
          poi.system.difficulty2 + 1,
        );
      await poi.update(poiUpdates);
    }
    entries[entryIndex].outcomeConfirmed = true;
    await this.actor.update({ [`system.${listKey}`]: entries });
    ui.notifications.info(
      game.i18n.localize("STA_TC.Wizard.OutcomeExplorationDiffShort"),
    );
  }

  static async _onConfirmOutcomeExplorationRemove(event, target) {
    const listKey = target.dataset.listKey;
    const entryIndex = parseInt(target.dataset.entryIndex);
    if (!listKey || isNaN(entryIndex)) return;
    const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
    if (!entries[entryIndex]) return;
    entries.splice(entryIndex, 1);
    await this.actor.update({ [`system.${listKey}`]: entries });
    ui.notifications.info(
      game.i18n.localize("STA_TC.Wizard.OutcomeExplorationRemovedShort"),
    );
  }

  static async _onConfirmOutcomeExtraPoi(event, target) {
    const listKey = target.dataset.listKey;
    const entryIndex = parseInt(target.dataset.entryIndex);
    if (!listKey || isNaN(entryIndex)) return;
    const system = this.actor.system;
    const entries = foundry.utils.deepClone(system[listKey] || []);
    if (!entries[entryIndex]) return;
    const poi = await fromUuid(entries[entryIndex].actorUuid);
    await this._appendPendingNote(
      game.i18n.format("STA_TC.Wizard.NoteExtraPoi", {
        name: poi?.name || "?",
      }),
    );
    entries[entryIndex].outcomeConfirmed = true;
    await this.actor.update({
      [`system.${listKey}`]: entries,
      "system.turnExtraPoisNextTurn": (system.turnExtraPoisNextTurn || 0) + 1,
    });
    ui.notifications.info(
      game.i18n.localize("STA_TC.Wizard.OutcomeUnknownShort"),
    );
  }

  static async _onIgnoreOutcome(event, target) {
    const listKey = target.dataset.listKey;
    const entryIndex = parseInt(target.dataset.entryIndex);
    if (!listKey || isNaN(entryIndex)) return;
    const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
    if (!entries[entryIndex]) return;
    const entry = entries[entryIndex];
    entry.conflictResult = "";
    entry.conflictSuccesses = 0;
    entry.conflictMomentum = 0;
    entry.conflictHadNat20 = false;
    entry.consequenceChosen = "";
    entry.failureChoice = "";
    entry.lossResult = "";
    entry.escalationRolled = false;
    entry.commandeeredAssetUuid = "";
    entry.outcomeConfirmed = false;
    entry.outcomeIgnored = true;
    await this.actor.update({ [`system.${listKey}`]: entries });
    ui.notifications.info(game.i18n.localize("STA_TC.Wizard.OutcomeIgnored"));
  }

  static async _onRollProgression(event, target) {
    const system = this.actor.system;
    const currentProgression = system.progression || 0;
    if (currentProgression < 5) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Wizard.NotEnoughProgression"),
      );
      return;
    }
    const roll = await new Roll("1d20").evaluate();
    await roll.toMessage({
      flavor: game.i18n.localize("STA_TC.Wizard.RollProgression"),
      speaker: { alias: game.i18n.localize("STA_TC.Wizard.SpeakerAlias") },
      whisper: [game.user.id],
    });
    const entry = PROGRESSION_TABLE[roll.total - 1];
    await this.actor.update({
      "system.progression": currentProgression - 5,
    });
    await CampaignTrackerSheet._applyProgressionResult(entry, this);
  }

  static async _onChooseProgression(event, target) {
    const system = this.actor.system;
    const currentProgression = system.progression || 0;
    if (currentProgression < 5) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Wizard.NotEnoughProgression"),
      );
      return;
    }

    const rows = PROGRESSION_TABLE.map(
      (e, i) =>
        `<label class="asset-picker-row">
          <input type="radio" name="progressionIdx" value="${i}" ${i === 0 ? "checked" : ""} />
          <span class="asset-picker-name">${game.i18n.localize(`STA_TC.Progression.Type.${e.type}`)}</span>
        </label>`,
    ).join("");

    const idx = await foundry.applications.api.DialogV2.prompt({
      window: {
        title: game.i18n.localize("STA_TC.Wizard.ChooseProgression"),
      },
      content: `<div class="asset-picker-list">${rows}</div>`,
      ok: {
        label: game.i18n.localize("STA_TC.Converter.Confirm"),
        callback: (_ev, button) => button.form.elements.progressionIdx.value,
      },
      rejectClose: false,
    });

    if (idx === null || idx === undefined) return;
    const entry = PROGRESSION_TABLE[parseInt(idx)];
    await this.actor.update({
      "system.progression": currentProgression - 5,
    });
    await CampaignTrackerSheet._applyProgressionResult(entry, this);
  }

  /**
   * Dispatch a progression result:
   *  - If `entry.saved`, create a saved ProgressionLog item and post a chat card.
   *  - Otherwise apply automation (power AE, supply boost) or post a chat reminder.
   *
   * @param {{type: string, saved: boolean}} entry
   * @param {CampaignTrackerSheet} sheet
   */
  static async _applyProgressionResult(entry, sheet) {
    const tracker = sheet.actor;
    const typeName = game.i18n.localize(
      `STA_TC.Progression.Type.${entry.type}`,
    );
    const typeDesc = game.i18n.localize(
      `STA_TC.Progression.Desc.${entry.type}`,
    );

    // ---- Saved awards: log item + chat card ----
    if (entry.saved) {
      await Item.create(
        {
          name: typeName,
          type: "sta-tactical-campaign.progression",
          system: { type: entry.type, saved: true, notes: typeDesc },
        },
        { parent: tracker },
      );
      await ChatMessage.create({
        content: `<div class="progression-result-card">
          <h3><i class="fas fa-star"></i> ${game.i18n.localize("STA_TC.Progression.ChatResult")}: ${typeName}</h3>
          <p>${typeDesc}</p>
          <p class="progression-saved-note"><em>${game.i18n.localize("STA_TC.Progression.ChatSaved")}</em></p>
        </div>`,
        speaker: {
          alias: game.i18n.localize("STA_TC.Wizard.SpeakerAlias"),
        },
        whisper: [game.user.id],
      });
      return;
    }

    // ---- Immediate awards ----
    let chatExtra = "";
    switch (entry.type) {
      case "shipRefit": {
        await ProgressionPowerDialog.prompt({
          tracker,
          assetTypes: ["ship"],
          mode: "power",
          delta: 1,
          title: typeName,
          description: typeDesc,
        });
        break;
      }
      case "trainingCourse": {
        await ProgressionPowerDialog.prompt({
          tracker,
          assetTypes: ["character"],
          mode: "power",
          delta: 1,
          title: typeName,
          description: typeDesc,
        });
        break;
      }
      case "adaptingCircumstances": {
        await ProgressionPowerDialog.prompt({
          tracker,
          assetTypes: ["ship", "character"],
          mode: "power",
          delta: 1,
          title: typeName,
          description: typeDesc,
        });
        break;
      }
      case "focusedResources": {
        // Apply +1 to ALL power values of the chosen resource asset
        const eligibleResources = [];
        for (const uuid of tracker.system.resourceAssets || []) {
          const actor = await fromUuid(uuid);
          if (!actor) continue;
          if (actor.effects?.some((e) => e.flags?.[MODULE_ID]?.lost)) continue;
          eligibleResources.push({ uuid, name: actor.name });
        }
        if (!eligibleResources.length) {
          chatExtra = game.i18n.localize("STA_TC.Progression.NoEligibleAssets");
          break;
        }
        const frOptions = eligibleResources
          .map(
            (a, i) =>
              `<option value="${a.uuid}" ${i === 0 ? "selected" : ""}>${a.name}</option>`,
          )
          .join("");
        const frChosen = await foundry.applications.api.DialogV2.prompt({
          window: { title: typeName },
          content: `<form style="padding:8px 0;"><div style="display:flex;flex-direction:column;gap:4px;"><label style="font-weight:bold;">${game.i18n.localize("STA_TC.Progression.PickAsset")}</label><select name="assetUuid" style="width:100%;">${frOptions}</select></div></form>`,
          ok: {
            label: game.i18n.localize("STA_TC.Converter.Confirm"),
            callback: (_ev, button) => button.form.elements.assetUuid.value,
          },
          rejectClose: false,
        });
        if (frChosen) {
          const frAsset = await fromUuid(frChosen);
          if (frAsset) {
            await frAsset.createEmbeddedDocuments("ActiveEffect", [
              {
                name: "Progression: All Powers +1",
                changes: [
                  { key: "system.powers.medical.value", mode: 2, value: "1" },
                  { key: "system.powers.military.value", mode: 2, value: "1" },
                  { key: "system.powers.personal.value", mode: 2, value: "1" },
                  { key: "system.powers.science.value", mode: 2, value: "1" },
                  { key: "system.powers.social.value", mode: 2, value: "1" },
                ],
                disabled: false,
                flags: { [MODULE_ID]: { progressionEffect: true } },
              },
            ]);
            chatExtra = game.i18n.format(
              "STA_TC.Progression.AllPowersApplied",
              {
                name: frAsset.name,
              },
            );
          }
        }
        break;
      }
      case "priorityAssignments": {
        const currentBonus = tracker.system.nextTurnSupplyBonus || 0;
        await tracker.update({
          "system.nextTurnSupplyBonus": currentBonus + 1,
        });
        chatExtra = game.i18n.format("STA_TC.Progression.SupplyNextTurn", {
          amount: 1,
        });
        break;
      }
      default:
        // Manual / chat reminder results
        break;
    }

    await ChatMessage.create({
      content: `<div class="progression-result-card">
        <h3><i class="fas fa-dice-d20"></i> ${game.i18n.localize("STA_TC.Progression.ChatResult")}: ${typeName}</h3>
        <p>${typeDesc}</p>
        ${chatExtra ? `<p><em>${chatExtra}</em></p>` : ""}
        <p style="font-size:0.85em;color:#aaa;">${game.i18n.localize("STA_TC.Wizard.ProgressionPointsDeducted")}</p>
      </div>`,
      speaker: { alias: game.i18n.localize("STA_TC.Wizard.SpeakerAlias") },
      whisper: [game.user.id],
    });
  }

  // ==========================================================================
  // Dice & Roll Methods
  // ==========================================================================

  async _performRoll(
    diceCount,
    powerValue,
    focusValue,
    usingFocus,
    usingDedicatedFocus,
    usingDetermination,
    complicationRange,
    speakerName,
    poiName,
    power,
  ) {
    let focusRange = usingFocus ? focusValue : 0;
    if (usingDedicatedFocus) focusRange *= 2;
    let actualDice = diceCount,
      successes = 0,
      hadNat20 = false;
    if (usingDetermination && actualDice > 0) {
      successes += 2;
      actualDice -= 1;
    }
    const rolls = [];
    let roll = null;
    if (actualDice > 0) {
      roll = await new Roll(`${actualDice}d20`).evaluate();
      for (const die of roll.dice[0].results) {
        const val = die.result;
        rolls.push(val);
        if (val >= 21 - complicationRange) hadNat20 = true;
        if (val <= powerValue) {
          successes += 1;
          if (val <= focusRange) successes += 1;
        }
      }
    }
    const powerLabel = game.i18n.localize(
      `STA_TC.Powers.${this._capitalize(power)}`,
    );
    return {
      successes,
      hadNat20,
      rolls,
      roll,
      targetNumber: powerValue,
      focusRange,
      complicationRange,
      usedDetermination: usingDetermination,
      powerLabel,
      speakerName,
      poiName,
    };
  }

  async _postConflictRollSummaryChat({
    poi,
    primaryActor,
    assistActor,
    chosenPower,
    primaryResult,
    assistResult,
    totalSuccesses,
  }) {
    const powerLabel = game.i18n.localize(
      `STA_TC.Powers.${this._capitalize(chosenPower)}`,
    );

    // Build STA-style dice HTML: max (gold) = focus/crit, min (red) = complication
    const buildDiceString = (r) => {
      if (!r) return "";
      let html = "";
      if (r.usedDetermination) {
        html += `<li class="roll die d20 max">1</li>`;
      }
      for (const val of r.rolls ?? []) {
        if ((r.focusRange > 0 && val <= r.focusRange) || val === 1) {
          html += `<li class="roll die d20 max">${val}</li>`;
        } else if (val <= r.targetNumber) {
          html += `<li class="roll die d20">${val}</li>`;
        } else if (val >= 21 - (r.complicationRange ?? 1)) {
          html += `<li class="roll die d20 min">${val}</li>`;
        } else {
          html += `<li class="roll die d20">${val}</li>`;
        }
      }
      return html;
    };

    const buildRollDetails = (r) => {
      const parts = [];
      if (r?.usedDetermination)
        parts.push(game.i18n.localize("STA_TC.Dialog.UsingDetermination"));
      if (r?.focusRange > 0)
        parts.push(game.i18n.localize("STA_TC.Dialog.UsingFocus"));
      return parts.join(", ");
    };

    const countComplications = (r) =>
      (r?.rolls ?? []).filter((v) => v >= 21 - (r?.complicationRange ?? 1))
        .length;
    const totalComplications =
      countComplications(primaryResult) + countComplications(assistResult);

    // Use STA's own i18n keys for the success/complication summary lines
    const successText =
      totalSuccesses === 1
        ? `1 ${game.i18n.localize("sta.roll.success")}`
        : `${totalSuccesses} ${game.i18n.localize("sta.roll.successPlural")}`;
    const complicationText =
      totalComplications === 1
        ? `1 ${game.i18n.localize("sta.roll.complication")}`
        : totalComplications > 1
          ? `${totalComplications} ${game.i18n.localize("sta.roll.complicationPlural")}`
          : "";

    const dicePool =
      (primaryResult.rolls?.length ?? 0) +
      (primaryResult.usedDetermination ? 1 : 0);

    // Use the NPC template (crew + ship layout) when there is an assisting asset,
    // otherwise fall back to the standard single-actor task template.
    const useNpcTemplate = !!assistActor;
    const templatePath = useNpcTemplate
      ? "systems/sta/templates/chat/attribute-test-npc.hbs"
      : "systems/sta/templates/chat/attribute-test.hbs";

    const templateData = useNpcTemplate
      ? {
          speakerName: primaryActor?.name ?? "-",
          flavor: powerLabel,
          dicePool,
          checkTarget: primaryResult.targetNumber,
          complicationMinimumValue: 20,
          rollDetails: buildRollDetails(primaryResult),
          diceString: buildDiceString(primaryResult),
          starshipName: assistActor.name,
          flavorship: powerLabel,
          checkTargetship: assistResult?.targetNumber ?? 0,
          diceStringship: buildDiceString(assistResult),
          successText,
          complicationText,
        }
      : {
          speakerName: primaryActor?.name ?? "-",
          flavor: powerLabel,
          dicePool,
          checkTarget: primaryResult.targetNumber,
          complicationMinimumValue: 20,
          rollDetails: buildRollDetails(primaryResult),
          diceString: buildDiceString(primaryResult),
          successText,
          complicationText,
        };

    const rollHTML = await foundry.applications.handlebars.renderTemplate(
      templatePath,
      templateData,
    );

    const rolls = [];
    if (primaryResult?.roll) rolls.push(primaryResult.roll);
    if (assistResult?.roll) rolls.push(assistResult.roll);

    await ChatMessage.create({
      rolls,
      content: rollHTML,
      speaker: { alias: game.i18n.localize("STA_TC.Wizard.SpeakerAlias") },
      whisper: game.users.contents.filter((u) => u.isGM).map((u) => u.id),
      flags: {
        sta: {
          rollType: useNpcTemplate ? "npc" : "task",
          speakerName: primaryActor?.name ?? "-",
          starshipName: assistActor?.name ?? undefined,
          flavor: powerLabel,
          flavorship: useNpcTemplate ? powerLabel : undefined,
          dicePool,
          checkTarget: primaryResult.targetNumber,
          checkTargetship: assistResult?.targetNumber ?? 0,
          complicationMinimumValue: 20,
          disDepTarget: primaryResult.focusRange,
          shipdisDepTarget: assistResult?.focusRange ?? 0,
          usingFocus: primaryResult.focusRange > 0,
          usingDedicatedFocus: false,
          diceOutcome: [...(primaryResult.rolls ?? [])],
          shipdiceOutcome: assistResult
            ? [...(assistResult.rolls ?? [])]
            : undefined,
        },
        "sta-tactical-campaign": {
          poiUuid: poi.uuid,
          trackerActorId: this.actor.id,
          primaryTargetNumber: primaryResult.targetNumber,
          primaryFocusRange: primaryResult.focusRange,
          primaryUsedDetermination: primaryResult.usedDetermination ?? false,
          assistTargetNumber: assistResult?.targetNumber ?? 0,
          assistFocusRange: assistResult?.focusRange ?? 0,
          assistUsedDetermination: assistResult?.usedDetermination ?? false,
          hasAssist: !!assistActor,
        },
      },
    });
  }

  // ==========================================================================
  // Active-Effect helpers for asset unavailability
  // ==========================================================================

  /**
   * Apply (or replace) an "unavailable" Active Effect on an asset actor.
   * The AE stores the campaign turn at which it should auto-expire so that
   * _onStartTurn can clean it up without relying on world-time.
   *
   * @param {string} actorUuid       - UUID of the asset actor
   * @param {string} label           - Human-readable reason (shown as AE name)
   * @param {number} expireAfterTurn - Campaign turn number at which the AE should be removed
   */
  async _applyUnavailableEffect(actorUuid, label, expireAfterTurn) {
    const actor = await fromUuid(actorUuid);
    if (!actor) return;
    // Remove any existing unavailability AE first to avoid duplicates
    const existing = actor.effects.find(
      (e) => e.flags?.[MODULE_ID]?.unavailable,
    );
    if (existing) await existing.delete();
    await actor.createEmbeddedDocuments("ActiveEffect", [
      {
        name: label || game.i18n.localize("STA_TC.Wizard.UnavailableStatus"),
        img: "icons/svg/sleep.svg",
        disabled: false,
        statuses: ["sta-tc.unavailable"],
        changes: [
          {
            key: "system.unavailable",
            mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE,
            value: "1",
            priority: 20,
          },
        ],
        flags: { [MODULE_ID]: { unavailable: true, expireAfterTurn } },
      },
    ]);
  }

  /**
   * GM action: manually remove the unavailable AE from an asset actor.
   */
  static async _onClearUnavailable(event, target) {
    const uuid =
      target.closest("[data-uuid]")?.dataset.uuid ?? target.dataset.uuid;
    const actor = await fromUuid(uuid);
    if (!actor) return;
    const ae = actor.effects.find((e) => e.flags?.[MODULE_ID]?.unavailable);
    if (ae) await ae.delete();
    ui.notifications.info(
      game.i18n.format("STA_TC.Wizard.UnavailableCleared", {
        name: actor.name,
      }),
    );
    this.render();
  }

  /**
   * Open the Progression Log popup for this campaign tracker.
   */
  static _onOpenProgressionLog(event, target) {
    ProgressionLog.open(this.actor);
  }

  /**
   * Set a single POI's visibility state.
   * Reads data-visibility="hidden|masked|revealed" from the clicked element.
   */
  static async _onSetPoiVisibility(event, target) {
    const state = target.dataset.visibility;
    const uuid = target.closest("[data-uuid]").dataset.uuid;
    const poi = await fromUuid(uuid);
    if (!poi) return;
    const updates = {
      hidden: { "system.hiddenByGM": true },
      masked: { "system.hiddenByGM": false, "system.revealed": false },
      revealed: { "system.hiddenByGM": false, "system.revealed": true },
    }[state];
    if (updates) await poi.update(updates);
  }

  /**
   * Bulk: set all generated POIs to a given visibility state.
   * Reads data-visibility="hidden|masked|revealed" from the clicked element.
   */
  static async _onSetAllPoiVisibility(event, target) {
    const state = target.dataset.visibility;
    const updates = {
      hidden: { "system.hiddenByGM": true },
      masked: { "system.hiddenByGM": false, "system.revealed": false },
      revealed: { "system.hiddenByGM": false, "system.revealed": true },
    }[state];
    if (!updates) return;
    const uuids = this.actor.system.turnGeneratedPois || [];
    for (const uuid of uuids) {
      const poi = await fromUuid(uuid);
      if (poi) await poi.update(updates);
    }
  }

  async _rollForLoss(poiUuid) {
    let primaryUuid = null;
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      for (const entry of this.actor.system[listKey] || []) {
        if (entry.actorUuid === poiUuid) {
          primaryUuid = entry.asset1Uuid;
          break;
        }
      }
      if (primaryUuid) break;
    }
    const primaryActor = primaryUuid ? await fromUuid(primaryUuid) : null;
    const assetType = primaryActor?.system?.assetType || "character";

    // Roll 1d20 for loss outcome
    const roll = await new Roll("1d20").evaluate();
    const rollValue = roll.total;

    let resultTitle;
    let resultDesc;
    let markLost = false;
    let markUnavailable = false;

    if (assetType === "ship") {
      if (rollValue === 1) {
        resultTitle = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipLostAllHands",
        );
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipLostAllHandsDesc",
        );
        markLost = true;
      } else if (rollValue <= 4) {
        resultTitle = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipBeyondRecovery",
        );
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipBeyondRecoveryDesc",
        );
        markLost = true;
      } else if (rollValue <= 12) {
        resultTitle = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipDamaged",
        );
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipDamagedDesc",
        );
        markUnavailable = true;
      } else {
        resultTitle = game.i18n.localize("STA_TC.Wizard.LossOutcome.ShipMinor");
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.ShipMinorDesc",
        );
      }
    } else {
      if (rollValue <= 2) {
        resultTitle = game.i18n.localize("STA_TC.Wizard.LossOutcome.CharMIA");
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.CharMIADesc",
        );
        markLost = true;
      } else if (rollValue <= 10) {
        resultTitle = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.CharInjured",
        );
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.CharInjuredDesc",
        );
        markUnavailable = true;
      } else {
        resultTitle = game.i18n.localize("STA_TC.Wizard.LossOutcome.CharNone");
        resultDesc = game.i18n.localize(
          "STA_TC.Wizard.LossOutcome.CharNoneDesc",
        );
      }
    }

    if (markLost && primaryActor) {
      // Create a permanent Lost AE (deleting it "rescues" the asset)
      const existingLost = primaryActor.effects.find(
        (e) => e.flags?.[MODULE_ID]?.lost,
      );
      if (existingLost) await existingLost.delete();
      await primaryActor.createEmbeddedDocuments("ActiveEffect", [
        {
          name: resultTitle,
          img: "icons/svg/skull.svg",
          disabled: false,
          statuses: ["sta-tc.lost"],
          changes: [
            {
              key: "system.lost",
              mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE,
              value: "1",
              priority: 20,
            },
          ],
          flags: { [MODULE_ID]: { lost: true } },
        },
      ]);
    }

    const resultText = resultTitle;
    for (const listKey of [
      "poiListThreat",
      "poiListExploration",
      "poiListRoutine",
      "poiListUnknown",
    ]) {
      const entries = foundry.utils.deepClone(this.actor.system[listKey] || []);
      const idx = entries.findIndex((e) => e.actorUuid === poiUuid);
      if (idx !== -1) {
        entries[idx].lossResult = resultText;
        await this.actor.update({ [`system.${listKey}`]: entries });
        break;
      }
    }
    const allHandsNote =
      markLost && assetType === "ship" && rollValue === 1
        ? `<p style="font-size:0.85em;color:#ffaaa0;margin-top:6px;"><i class="fas fa-exclamation-triangle"></i> Any Character assets assigned to this ship's mission should also be marked Lost.</p>`
        : "";
    await ChatMessage.create({
      content: `<div style="background:#333;border-radius:8px;padding:10px;color:#eee;border-left:4px solid #e74c3c;">
        <h3 style="margin:0 0 6px;color:#e74c3c;">&#x1F480; ${game.i18n.localize("STA_TC.RollForLoss")} \u2014 ${rollValue}/20</h3>
        <p><strong>${primaryActor?.name || "Asset"}:</strong> <em>${resultTitle}</em></p>
        <p style="font-size:0.9em;opacity:0.8;margin-top:4px;">${resultDesc}</p>${allHandsNote}
      </div>`,
      speaker: { alias: game.i18n.localize("STA_TC.Wizard.SpeakerAlias") },
      whisper: [game.user.id],
    });
    // Apply an unavailability AE to the primary asset actor when the result
    // is "unavailable" (not lost, not minor).
    if (primaryUuid && markUnavailable) {
      const expireAfterTurn = (this.actor.system.campaignTurnNumber || 0) + 1;
      await this._applyUnavailableEffect(
        primaryUuid,
        resultText,
        expireAfterTurn,
      );
    }
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  _capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
