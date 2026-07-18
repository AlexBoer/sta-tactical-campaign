const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } =
  foundry.applications.api;

import { RollTableManagerService } from "./roll-table-manager-service.mjs";

const MODULE_ID = "sta-tactical-campaign";
const MAX_ACTIVE_RESULTS_RENDERED = 120;
const MAX_USED_RESULTS_RENDERED = 120;
const MAX_COMPENDIUM_ACTORS_RENDERED = 80;

const SOURCE_TABS = {
  poi: ["tacticalThreat", "exploration", "routine", "unknown"],
  asset: ["character", "ship", "resource"],
  progression: ["progression"],
  escalation: ["escalation"],
  event: ["event"],
};

const SOURCE_TAB_LABELS = {
  poi: {
    tacticalThreat: "STA_TC.Poi.Types.TacticalThreat",
    exploration: "STA_TC.Poi.Types.Exploration",
    routine: "STA_TC.Poi.Types.Routine",
    unknown: "STA_TC.Poi.Types.Unknown",
  },
  asset: {
    character: "STA_TC.Asset.Generator.Types.Character",
    ship: "STA_TC.Asset.Generator.Types.Ship",
    resource: "STA_TC.Asset.Generator.Types.Resource",
  },
  progression: {
    progression: "STA_TC.RollTableManager.TabProgression",
  },
  escalation: {
    escalation: "STA_TC.RollTableManager.TabEscalation",
  },
  event: {
    event: "STA_TC.RollTableManager.TabEvents",
  },
};

export class RollTableManager extends HandlebarsApplicationMixin(
  ApplicationV2,
) {
  #reportError(context, error) {
    console.error(`${MODULE_ID} | RTM ERROR | ${context}`, error);
  }

  constructor(tracker, options = {}) {
    super(options);
    this.tracker = tracker;
    this._externalHookIds = [];
    this._boundOnExternalActorUpdate = this.#onExternalActorUpdate.bind(this);
    this._boundOnExternalItemUpdate = this.#onExternalItemUpdate.bind(this);
    this._boundOnExternalTableUpdate = this.#onExternalTableUpdate.bind(this);
    this._boundOnExternalTableResultChange =
      this.#onExternalTableResultChange.bind(this);
    this.rtmState = {
      source: "poi",
      tab: "tacticalThreat",
      search: "",
      compPower: "",
      compDifficulty: "",
      compUrgency: "",
      compAssetPower: "",
      pending: [],
      statusMessage: "",
      statusLevel: "info",
      searchDebounceHandle: null,
      needsReload: true,
      cacheKey: "",
      cachedTable: null,
      cachedActiveResults: [],
      cachedActiveTotalCount: 0,
      cachedInferredPackId: "",
      compendiumIndexCache: {},
      stagedTabs: {},
      pendingDeletedActorUuids: {},
      trackerQueuesEnsured: false,
      renderQueued: false,
    };
  }

  #queueRender(reason = "unspecified") {
    if (this.rtmState.renderQueued) {
      return;
    }

    this.rtmState.renderQueued = true;

    requestAnimationFrame(() => {
      this.rtmState.renderQueued = false;
      this.render();
    });
  }

  static DEFAULT_OPTIONS = {
    id: "sta-roll-table-manager",
    classes: ["sta-tactical-campaign", "roll-table-manager"],
    actions: {
      switchTab: RollTableManager._onSwitchTab,
      addExisting: RollTableManager._onAddExisting,
      removeResult: RollTableManager._onRemoveResult,
      restoreUsed: RollTableManager._onRestoreUsed,
      removeUsedRecord: RollTableManager._onRemoveUsedRecord,
      createNew: RollTableManager._onCreateNew,
      applyPending: RollTableManager._onApplyPending,
      openActor: RollTableManager._onOpenActor,
      openTable: RollTableManager._onOpenTable,
      openCompendium: RollTableManager._onOpenCompendium,
      closeDialog: RollTableManager._onCloseDialog,
    },
    position: {
      width: 840,
      height: 760,
    },
    window: {
      resizable: true,
      minimizable: true,
    },
    dragDrop: [{ dragSelector: null, dropSelector: ".rtm-drop-target" }],
  };

  static PARTS = {
    sheet: {
      template:
        "modules/sta-tactical-campaign/templates/roll-table-manager.hbs",
      scrollable: [
        ".rtm-list-active",
        ".rtm-list-compendium",
        ".rtm-list-used",
      ],
    },
  };

  get title() {
    return game.i18n.localize("STA_TC.RollTableManager.Title");
  }

  get saveMode() {
    return game.settings.get(MODULE_ID, "rollTableManagerMode") || "instant";
  }

  /**
   * Lazily-created DragDrop handler. ApplicationV2 does not auto-wire the
   * `dragDrop` option, so we create and bind it ourselves.
   * @type {DragDrop}
   */
  get _dragDrop() {
    return (this.#dragDrop ??=
      new foundry.applications.ux.DragDrop.implementation({
        dropSelector: null,
        permissions: {
          drop: () => game.user?.isGM,
        },
        callbacks: {
          drop: this._onDrop.bind(this),
        },
      }));
  }

  #dragDrop = null;

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._dragDrop.bind(this.element);
    this.#ensureExternalHooks();
  }

  async _onClose(options) {
    this.#teardownExternalHooks();
    return super._onClose?.(options);
  }

  #ensureExternalHooks() {
    if (this._externalHookIds.length) return;
    this._externalHookIds.push({
      event: "updateActor",
      id: Hooks.on("updateActor", this._boundOnExternalActorUpdate),
    });
    this._externalHookIds.push({
      event: "updateRollTable",
      id: Hooks.on("updateRollTable", this._boundOnExternalTableUpdate),
    });
    this._externalHookIds.push({
      event: "updateItem",
      id: Hooks.on("updateItem", this._boundOnExternalItemUpdate),
    });
    this._externalHookIds.push({
      event: "createTableResult",
      id: Hooks.on("createTableResult", this._boundOnExternalTableResultChange),
    });
    this._externalHookIds.push({
      event: "deleteTableResult",
      id: Hooks.on("deleteTableResult", this._boundOnExternalTableResultChange),
    });
  }

  #teardownExternalHooks() {
    for (const { event, id } of this._externalHookIds) {
      Hooks.off(event, id);
    }
    this._externalHookIds = [];
  }

  #refreshExternal(reason) {
    // Manual mode preserves in-memory staged edits; avoid wiping that state.
    if (this.saveMode === "manual" && this.rtmState.pending.length) return;

    this.rtmState.needsReload = true;
    this.rtmState.cachedTable = null;
    this.rtmState.cachedActiveResults = [];
    this.rtmState.cachedActiveTotalCount = 0;
    this.rtmState.cachedInferredPackId = "";
    this.rtmState.compendiumIndexCache = {};
    this.#queueRender(reason);
  }

  #onExternalActorUpdate(updatedActor, changed) {
    const relevantTypes = [`${MODULE_ID}.asset`, `${MODULE_ID}.poi`];
    if (!relevantTypes.includes(updatedActor?.type)) return;

    this.#refreshExternal("external:updateActor");

    // Type-change sync moves results asynchronously between tables.
    const typeChanged =
      updatedActor.type === `${MODULE_ID}.poi`
        ? foundry.utils.hasProperty(changed, "system.poiType")
        : foundry.utils.hasProperty(changed, "system.assetType");
    if (typeChanged) {
      globalThis.setTimeout(() => {
        this.#refreshExternal("external:updateActor:typeChanged:deferred");
      }, 150);
    }
  }

  #onExternalTableUpdate(table, _changed) {
    if (!table) return;
    this.#refreshExternal("external:updateRollTable");
  }

  #onExternalItemUpdate(updatedItem, _changed) {
    const itemTypes = [`${MODULE_ID}.progression`, `${MODULE_ID}.event`];
    if (!itemTypes.includes(updatedItem?.type)) return;
    this.#refreshExternal("external:updateItem");
  }

  #onExternalTableResultChange(result, _options, _userId) {
    if (!result) return;
    this.#refreshExternal("external:tableResult");
  }

  async _onDrop(event) {
    const data =
      foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const isItemSource = RollTableManagerService.isItemBasedSource(
      this.rtmState.source,
    );
    const expectedType = isItemSource ? "Item" : "Actor";
    if (data?.type !== expectedType || !data.uuid) return;

    const document = await fromUuid(data.uuid);
    if (!document) return;

    await this.#performOrQueue({
      type: "addExisting",
      source: this.rtmState.source,
      tab: this.rtmState.tab,
      actorUuid: document.uuid,
    });
  }

  async _prepareContext(options) {
    if (!this.rtmState.trackerQueuesEnsured) {
      await RollTableManagerService.ensureTrackerQueues(this.tracker);
      this.rtmState.trackerQueuesEnsured = true;
    }

    const source = this.rtmState.source;
    const tab = this.rtmState.tab;
    const tabs = SOURCE_TABS[source].map((id) => ({
      id,
      label: game.i18n.localize(SOURCE_TAB_LABELS[source][id]),
      active: id === tab,
    }));

    const cacheKey = `${source}:${tab}`;
    const shouldReload =
      this.rtmState.needsReload || this.rtmState.cacheKey !== cacheKey;
    if (shouldReload) {
      this.rtmState.cacheKey = cacheKey;
      this.rtmState.cachedTable = null;
      this.rtmState.cachedActiveResults = [];
      this.rtmState.cachedActiveTotalCount = 0;
      this.rtmState.cachedInferredPackId = "";
      try {
        const table = await RollTableManagerService.loadEditableTable(
          source,
          tab,
        );
        this.rtmState.cachedTable = table;
        this.rtmState.cachedActiveTotalCount =
          RollTableManagerService.getResultCount(table);
        this.rtmState.cachedActiveResults =
          await RollTableManagerService.listResultsCapped(table, {
            limit: MAX_ACTIVE_RESULTS_RENDERED,
          });
        this.rtmState.cachedInferredPackId =
          RollTableManagerService.isItemBasedSource(source)
            ? await RollTableManagerService.inferItemCompendium(source, table)
            : await RollTableManagerService.inferCompendium(source, table);
      } catch (error) {
        this.#reportError(
          `prepareContext.loadEditableTable(${cacheKey})`,
          error,
        );
      }
      this.rtmState.needsReload = false;
    }

    const table = this.rtmState.cachedTable;
    const activeResults = this.rtmState.cachedActiveResults;
    const activeTotalBaseline = this.rtmState.cachedActiveTotalCount;
    const manualMode = this.saveMode === "manual";

    const usedKey = RollTableManagerService.getUsedKey(source);
    const usedRaw = Array.isArray(this.tracker.system[usedKey])
      ? this.tracker.system[usedKey]
      : [];

    let usedTotalCount = 0;
    let usedResultsCapped = [];
    let usedResultsForTab = [];
    let viewActiveResults = activeResults;

    if (manualMode) {
      const usedAll = [];
      for (let index = 0; index < usedRaw.length; index += 1) {
        const entry = usedRaw[index];
        if ((entry?.subKey || "") !== tab) continue;
        usedAll.push({ ...entry, index });
      }

      const staged = this.#getOrCreateStagedTab(cacheKey, {
        activeResults,
        usedResults: usedAll,
      });
      viewActiveResults = staged.activeResults;
      const stagedUsed = staged.usedResults;
      usedResultsForTab = stagedUsed;
      usedTotalCount = stagedUsed.length;
      usedResultsCapped = stagedUsed
        .slice(0, MAX_USED_RESULTS_RENDERED)
        .map((entry, index) => ({ ...entry, index }));
    } else {
      const capped = [];
      for (let index = 0; index < usedRaw.length; index += 1) {
        const entry = usedRaw[index];
        if ((entry?.subKey || "") !== tab) continue;
        usedResultsForTab.push(entry);
        usedTotalCount += 1;
        if (capped.length < MAX_USED_RESULTS_RENDERED) {
          capped.push({ ...entry, index });
        }
      }
      usedResultsCapped = capped;
    }

    const inferredPackId = this.rtmState.cachedInferredPackId;
    const excludedActorUuids = new Set();
    const excludedActorIds = new Set();
    const actorIdFromUuid = (uuid) => {
      const value = String(uuid || "").trim();
      if (!value) return "";
      const parts = value.split(".");
      return parts.length ? parts[parts.length - 1] : "";
    };
    for (const result of viewActiveResults) {
      const uuid = result?.documentUuid || "";
      if (uuid) {
        excludedActorUuids.add(uuid);
        const actorId = actorIdFromUuid(uuid);
        if (actorId) excludedActorIds.add(actorId);
      }
    }
    for (const entry of usedResultsForTab) {
      const uuid =
        entry?.sourceActorUuid || entry?.resultSnapshot?.documentUuid || "";
      if (uuid) {
        excludedActorUuids.add(uuid);
        const actorId = actorIdFromUuid(uuid);
        if (actorId) excludedActorIds.add(actorId);
      }
    }

    const isItemSource = RollTableManagerService.isItemBasedSource(source);
    const folderFilter = this.rtmState.compFolderFilter || "";
    const { totalCount: compendiumTotalCount, actors: compendiumActorsCapped } =
      isItemSource
        ? await this.#getCompendiumItems(inferredPackId, {
            excludeUuids: excludedActorUuids,
            excludeActorIds: excludedActorIds,
            source,
            folderFilter,
          })
        : await this.#getCompendiumActors(inferredPackId, {
            deletedUuids: manualMode
              ? this.rtmState.pendingDeletedActorUuids
              : null,
            excludeUuids: excludedActorUuids,
            excludeActorIds: excludedActorIds,
            source,
            subKey: tab,
            folderFilter,
          });

    const activeTotalCount = viewActiveResults.length;
    const activeTotal = manualMode ? activeTotalCount : activeTotalBaseline;

    const activeResultsCapped = viewActiveResults.slice(
      0,
      MAX_ACTIVE_RESULTS_RENDERED,
    );

    return {
      source,
      tab,
      tabs,
      saveMode: this.saveMode,
      manualMode,
      pendingCount: this.rtmState.pending.length,
      statusMessage: this.rtmState.statusMessage,
      statusLevel: this.rtmState.statusLevel,
      search: this.rtmState.search,
      tableUuid: table?.uuid || "",
      autoMoveOnDraw: table
        ? RollTableManagerService.getAutoMoveOnDraw(table)
        : false,
      activeResults: activeResultsCapped,
      activeTotalCount: activeTotal,
      hasMoreActiveResults: activeTotal > activeResultsCapped.length,
      activeRenderLimit: MAX_ACTIVE_RESULTS_RENDERED,
      usedResults: usedResultsCapped,
      usedTotalCount,
      hasMoreUsedResults: usedTotalCount > usedResultsCapped.length,
      usedRenderLimit: MAX_USED_RESULTS_RENDERED,
      compendiumActors: compendiumActorsCapped,
      compendiumTotalCount,
      hasMoreCompendiumActors:
        compendiumTotalCount > compendiumActorsCapped.length,
      compendiumRenderLimit: MAX_COMPENDIUM_ACTORS_RENDERED,
      compendiumName:
        inferredPackId || game.i18n.localize("STA_TC.RollTableManager.None"),
      hasCompendium: !!inferredPackId,
      hasLinkedCompendium: !!inferredPackId,
      folderFilterOptions: inferredPackId
        ? this.#buildFolderOptions(inferredPackId, { source, subKey: tab })
        : [],
      folderDefault: this.#getDefaultFolder(source, tab),
      isItemBasedSource: RollTableManagerService.isItemBasedSource(source),
      showCompendiumFilters: source === "poi" || source === "asset",
      showPoiCompendiumFilters: source === "poi",
      showAssetCompendiumFilters: source === "asset",
      showUrgencyFilter: source === "poi" && tab === "tacticalThreat",
      powerFilterOptions: [
        {
          value: "",
          label: game.i18n.localize("STA_TC.RollTableManager.FilterAny"),
          selected: !this.rtmState.compPower,
        },
        ...["medical", "military", "personal", "science", "social"].map(
          (p) => ({
            value: p,
            label: game.i18n.localize(
              `STA_TC.Powers.${p.charAt(0).toUpperCase()}${p.slice(1)}`,
            ),
            selected: this.rtmState.compPower === p,
          }),
        ),
      ],
      difficultyFilterOptions: [
        {
          value: "",
          label: game.i18n.localize("STA_TC.RollTableManager.FilterAny"),
          selected: !this.rtmState.compDifficulty,
        },
        ...["1", "2", "3", "4", "5"].map((n) => ({
          value: n,
          label: n,
          selected: this.rtmState.compDifficulty === n,
        })),
      ],
      urgencyFilterOptions: [
        {
          value: "",
          label: game.i18n.localize("STA_TC.RollTableManager.FilterAny"),
          selected: !this.rtmState.compUrgency,
        },
        ...["1", "2", "3", "4", "5"].map((n) => ({
          value: n,
          label: n,
          selected: this.rtmState.compUrgency === n,
        })),
      ],
      assetPowerFilterOptions: [
        {
          value: "",
          label: game.i18n.localize("STA_TC.RollTableManager.FilterAny"),
          selected: !this.rtmState.compAssetPower,
        },
        ...["medical", "military", "personal", "science", "social"].map(
          (p) => ({
            value: p,
            label: game.i18n.localize(
              `STA_TC.Powers.${p.charAt(0).toUpperCase()}${p.slice(1)}`,
            ),
            selected: this.rtmState.compAssetPower === p,
          }),
        ),
      ],
      isPoi: source === "poi",
      isAsset: source === "asset",
      sourceOptions: [
        {
          value: "poi",
          label: game.i18n.localize("STA_TC.RollTableManager.SourcePoi"),
          selected: source === "poi",
        },
        {
          value: "asset",
          label: game.i18n.localize("STA_TC.RollTableManager.SourceAsset"),
          selected: source === "asset",
        },
        {
          value: "progression",
          label: game.i18n.localize(
            "STA_TC.RollTableManager.SourceProgression",
          ),
          selected: source === "progression",
        },
        {
          value: "escalation",
          label: game.i18n.localize("STA_TC.RollTableManager.SourceEscalation"),
          selected: source === "escalation",
        },
        {
          value: "event",
          label: game.i18n.localize("STA_TC.RollTableManager.SourceEvent"),
          selected: source === "event",
        },
      ],
    };
  }

  async #getCompendiumActors(
    packId,
    {
      deletedUuids = null,
      excludeUuids = null,
      excludeActorIds = null,
      source = null,
      subKey = null,
      folderFilter = "",
    } = {},
  ) {
    if (!packId) return { totalCount: 0, actors: [] };
    const pack = game.packs.get(packId);
    if (!pack) return { totalCount: 0, actors: [] };

    await this.#primeCompendiumIndex(packId, pack);

    const cached = this.rtmState.compendiumIndexCache[packId] || [];
    const deleted = deletedUuids || null;
    const actorIdFromUuid = (uuid) => {
      const value = String(uuid || "").trim();
      if (!value) return "";
      const parts = value.split(".");
      return parts.length ? parts[parts.length - 1] : "";
    };
    const wantType = source ? `${MODULE_ID}.${source}` : null;
    let totalCount = 0;
    const actors = [];

    for (const entry of cached) {
      const entryUuid = entry.uuid || pack.getUuid?.(entry.id) || "";
      const entryActorId = entry.id || actorIdFromUuid(entryUuid);
      if (deleted && deleted[entryUuid]) continue;
      if (excludeUuids?.has?.(entryUuid)) continue;
      if (excludeActorIds?.has?.(entryActorId)) continue;
      // Only actors of the current source's type (POI vs Asset).
      if (wantType && entry.type && entry.type !== wantType) continue;
      // Only actors whose sub-type matches the current tab.
      if (subKey) {
        const entrySubKey = source === "poi" ? entry.poiType : entry.assetType;
        if (entrySubKey !== subKey) continue;
      }
      // Folder filter
      if (folderFilter && entry.folder !== folderFilter) continue;
      totalCount += 1;
      if (actors.length < MAX_COMPENDIUM_ACTORS_RENDERED) {
        actors.push({
          uuid: entryUuid,
          name: entry.name,
          img: entry.img,
          power: entry.power,
          primaryPower: entry.primaryPower,
          power2: entry.power2,
          difficulty: entry.difficulty,
          urgency: entry.urgency,
        });
      }
    }

    return { totalCount, actors };
  }

  async #primeCompendiumIndex(packId, pack = null) {
    if (!packId || this.rtmState.compendiumIndexCache[packId]) return;
    const targetPack = pack || game.packs.get(packId);
    if (!targetPack) return;
    const index = await targetPack.getIndex({
      fields: [
        "name",
        "img",
        "uuid",
        "type",
        "folder",
        "system.poiType",
        "system.assetType",
        "system.power",
        "system.primaryPower",
        "system.selectedPower",
        "system.power2",
        "system.difficulty",
        "system.urgency",
      ],
    });
    this.rtmState.compendiumIndexCache[packId] = [...index].map((entry) => ({
      id: entry._id || "",
      uuid: entry.uuid,
      name: entry.name || "",
      img: entry.img || "icons/svg/mystery-man.svg",
      nameLc: (entry.name || "").toLowerCase(),
      type: entry.type || "",
      poiType: foundry.utils.getProperty(entry, "system.poiType") || "",
      assetType: foundry.utils.getProperty(entry, "system.assetType") || "",
      power: foundry.utils.getProperty(entry, "system.power") || "",
      primaryPower:
        foundry.utils.getProperty(entry, "system.primaryPower") ||
        foundry.utils.getProperty(entry, "system.selectedPower") ||
        "",
      power2: foundry.utils.getProperty(entry, "system.power2") || "",
      difficulty: String(
        foundry.utils.getProperty(entry, "system.difficulty") ?? "",
      ),
      urgency: String(foundry.utils.getProperty(entry, "system.urgency") ?? ""),
      folder: entry.folder || "",
    }));
  }

  /**
   * Prime an Item compendium index for browsing in the Progression/Escalation
   * panel. Cached by pack ID so it is only fetched once per manager session.
   */
  async #primeItemIndex(packId, pack, source) {
    if (!packId || this.rtmState.compendiumIndexCache[packId]) return;
    const targetPack = pack || game.packs.get(packId);
    if (!targetPack) return;
    const sourceConfig = RollTableManagerService.getSourceConfig(source || "");
    const catField =
      sourceConfig?.itemCategoryField || "system.progressionCategory";
    const index = await targetPack.getIndex({
      fields: ["name", "img", "uuid", "type", "folder", catField],
    });
    this.rtmState.compendiumIndexCache[packId] = [...index].map((entry) => ({
      id: entry._id || "",
      uuid: entry.uuid,
      name: entry.name || "",
      img: entry.img || "icons/svg/d20-grey.svg",
      nameLc: (entry.name || "").toLowerCase(),
      type: entry.type || "",
      // category = the progressionCategory value ("progression" | "escalation")
      category: foundry.utils.getProperty(entry, catField) || "",
      // Unused actor fields kept for uniform row shape
      poiType: "",
      assetType: "",
      power: "",
      primaryPower: "",
      power2: "",
      difficulty: "",
      urgency: "",
      folder: entry.folder || "",
    }));
  }

  /**
   * Fetch compendium items for item-based panels (Progression/Escalation/
   * Event), filtered by item type (and progressionCategory where relevant),
   * excluding UUIDs already in active/used lists.
   */
  async #getCompendiumItems(
    packId,
    {
      excludeUuids = null,
      excludeActorIds = null,
      source = null,
      folderFilter = "",
    } = {},
  ) {
    if (!packId) return { totalCount: 0, actors: [] };
    const pack = game.packs.get(packId);
    if (!pack) return { totalCount: 0, actors: [] };

    await this.#primeItemIndex(packId, pack, source);

    const cached = this.rtmState.compendiumIndexCache[packId] || [];
    const sourceConfig = source
      ? RollTableManagerService.getSourceConfig(source)
      : null;
    const wantType = sourceConfig?.itemType || "";
    const wantCategory = sourceConfig?.itemCategoryValue || "";
    const idFromUuid = (uuid) => {
      const parts = String(uuid || "").split(".");
      return parts.length ? parts[parts.length - 1] : "";
    };

    let totalCount = 0;
    const actors = [];
    for (const entry of cached) {
      const entryUuid = entry.uuid || pack.getUuid?.(entry.id) || "";
      const entryId = entry.id || idFromUuid(entryUuid);
      if (excludeUuids?.has?.(entryUuid)) continue;
      if (excludeActorIds?.has?.(entryId)) continue;
      // Filter by item type so a shared compendium doesn't leak items of
      // another source (e.g. progression items showing under Events).
      if (wantType && entry.type !== wantType) continue;
      // Filter by category (progression vs escalation)
      if (wantCategory && entry.category !== wantCategory) continue;
      // Folder filter
      if (folderFilter && entry.folder !== folderFilter) continue;
      totalCount += 1;
      if (actors.length < MAX_COMPENDIUM_ACTORS_RENDERED) {
        actors.push({
          uuid: entryUuid,
          name: entry.name,
          img: entry.img,
          power: "",
          primaryPower: "",
          power2: "",
          difficulty: "",
          urgency: "",
        });
      }
    }
    return { totalCount, actors };
  }

  /** Read the saved default creation folder ID for a source+tab. */
  #getDefaultFolder(source, tab) {
    try {
      const defaults = game.settings.get(MODULE_ID, "folderDefaults") || {};
      return defaults[`${source}:${tab}`] || "";
    } catch {
      return "";
    }
  }

  /**
   * Build the folder filter dropdown options for the compendium panel.
   * Returns an empty array when the pack has no folders (hides the control).
   * Folders whose IDs don't appear in any cached index entry are omitted.
   *
   * @param {string} packId
   * @returns {{value:string, label:string, selected:boolean}[]}
   */
  #buildFolderOptions(packId, { source = null, subKey = null } = {}) {
    if (!packId) return [];
    const pack = game.packs.get(packId);
    if (!pack) return [];
    const cached = this.rtmState.compendiumIndexCache[packId] || [];

    // Resolve source config to apply the same type/category filters used
    // by the compendium fetch, so only folders with relevant entries show.
    const sourceConfig = source
      ? RollTableManagerService.getSourceConfig(source)
      : null;
    const isItemSource = !!sourceConfig?.itemSettingKey;
    const wantItemType = isItemSource ? sourceConfig.itemType || "" : "";
    const wantCategory = isItemSource
      ? sourceConfig.itemCategoryValue || ""
      : "";
    const wantActorType =
      !isItemSource && source ? `${MODULE_ID}.${source}` : "";

    // Collect folder IDs from entries that pass source-specific filters
    const usedIds = new Set();
    for (const entry of cached) {
      if (!entry.folder) continue;
      if (isItemSource) {
        if (wantItemType && entry.type !== wantItemType) continue;
        if (wantCategory && entry.category !== wantCategory) continue;
      } else {
        if (wantActorType && entry.type && entry.type !== wantActorType)
          continue;
        if (subKey) {
          const entrySubKey =
            source === "poi" ? entry.poiType : entry.assetType;
          if (entrySubKey !== subKey) continue;
        }
      }
      usedIds.add(entry.folder);
    }
    if (!usedIds.size) return [];

    // Build a map of id → folder document for ancestor traversal
    const folderMap = {};
    for (const f of pack.folders ?? []) folderMap[f.id] = f;

    // For each used folder build its full path-parts array and depth.
    // path parts are used for hierarchical sorting; depth drives indentation.
    const entries = [];
    for (const id of usedIds) {
      const parts = [];
      let current = folderMap[id];
      while (current) {
        parts.unshift(current.name);
        current = current.folder ? folderMap[current.folder] : null;
      }
      entries.push({ id, parts, depth: parts.length - 1 });
    }

    // Hierarchical sort: compare path arrays element-by-element so siblings
    // are grouped under their common parent, each level sorted by name.
    entries.sort((a, b) => {
      const len = Math.min(a.parts.length, b.parts.length);
      for (let i = 0; i < len; i++) {
        const cmp = a.parts[i].localeCompare(b.parts[i]);
        if (cmp !== 0) return cmp;
      }
      return a.parts.length - b.parts.length;
    });

    const opts = [
      {
        value: "",
        label: game.i18n.localize("STA_TC.RollTableManager.AllFolders"),
        selected: !this.rtmState.compFolderFilter,
      },
    ];

    for (const { id, parts, depth } of entries) {
      // Two non-breaking spaces per depth level so native <select> shows indent
      const indent = "\u00A0\u00A0".repeat(depth);
      opts.push({
        value: id,
        label: indent + parts[parts.length - 1],
        selected: this.rtmState.compFolderFilter === id,
      });
    }

    return opts;
  }

  #getOrCreateStagedTab(cacheKey, { activeResults, usedResults }) {
    if (!this.rtmState.stagedTabs[cacheKey]) {
      this.rtmState.stagedTabs[cacheKey] = {
        activeResults: foundry.utils.deepClone(activeResults || []),
        usedResults: foundry.utils.deepClone(usedResults || []),
      };
    }
    return this.rtmState.stagedTabs[cacheKey];
  }

  #getCurrentStagedTab() {
    const key = `${this.rtmState.source}:${this.rtmState.tab}`;
    return this.rtmState.stagedTabs[key] || null;
  }

  async #applyOperationToStaged(operation) {
    const key = `${operation.source}:${operation.tab || this.rtmState.tab}`;
    const staged = this.rtmState.stagedTabs[key];
    if (!staged) return;

    switch (operation.type) {
      case "addExisting": {
        const actor = await fromUuid(operation.actorUuid);
        if (!actor) return;
        staged.activeResults.unshift({
          id: `pending-${foundry.utils.randomID()}`,
          name: actor.name,
          img: actor.img || "icons/svg/mystery-man.svg",
          documentUuid: actor.uuid,
          weight: 1,
          range: null,
          drawn: false,
          valid: true,
          pendingOnly: true,
        });
        break;
      }
      case "removeResult": {
        const idx = staged.activeResults.findIndex(
          (r) => r.id === operation.resultId,
        );
        if (idx === -1) return;
        const [removed] = staged.activeResults.splice(idx, 1);
        staged.usedResults.unshift({
          index: -1,
          subKey: operation.tab,
          origin: "manual",
          resultName: removed.name || "",
          resultImg: removed.img || "icons/svg/d20-grey.svg",
          resultSnapshot: {
            name: removed.name || "",
            img: removed.img || "icons/svg/d20-grey.svg",
            documentUuid: removed.documentUuid || "",
            weight: removed.weight || 1,
            range: removed.range || [1, 1],
            drawn: false,
          },
        });
        break;
      }
      case "restoreUsed": {
        const index = Number(operation.index);
        if (
          Number.isNaN(index) ||
          index < 0 ||
          index >= staged.usedResults.length
        ) {
          return;
        }
        const [record] = staged.usedResults.splice(index, 1);
        const snapshot = foundry.utils.deepClone(record.resultSnapshot || {});
        staged.activeResults.unshift({
          id: `pending-${foundry.utils.randomID()}`,
          name: snapshot.name || record.resultName || "",
          img: snapshot.img || record.resultImg || "icons/svg/d20-grey.svg",
          documentUuid: snapshot.documentUuid || record.sourceActorUuid || "",
          weight: snapshot.weight || 1,
          range: snapshot.range || null,
          drawn: false,
          valid: !!(snapshot.documentUuid || record.sourceActorUuid),
          pendingOnly: true,
        });
        break;
      }
      case "removeUsedRecord": {
        const index = Number(operation.index);
        if (
          Number.isNaN(index) ||
          index < 0 ||
          index >= staged.usedResults.length
        ) {
          return;
        }
        staged.usedResults.splice(index, 1);
        break;
      }
      case "createNew": {
        staged.activeResults.unshift({
          id: `pending-new-${foundry.utils.randomID()}`,
          name: operation.name,
          img: "icons/svg/mystery-man.svg",
          documentUuid: "",
          weight: 1,
          range: null,
          drawn: false,
          valid: true,
          pendingOnly: true,
        });
        break;
      }
      case "deleteActor": {
        this.rtmState.pendingDeletedActorUuids[operation.actorUuid] = true;
        staged.activeResults = staged.activeResults.filter(
          (r) => (r.documentUuid || "") !== operation.actorUuid,
        );
        break;
      }
      default:
        break;
    }
  }

  #invalidateData({ clearCompendiumIndex = false } = {}) {
    this.rtmState.needsReload = true;
    this.rtmState.stagedTabs = {};
    this.rtmState.pendingDeletedActorUuids = {};
    if (clearCompendiumIndex) {
      this.rtmState.compendiumIndexCache = {};
    }
  }

  async #performOrQueue(operation) {
    if (this.saveMode === "manual") {
      await this.#applyOperationToStaged(operation);
      this.rtmState.pending.push(operation);
      this.#setStatus(
        game.i18n.format("STA_TC.RollTableManager.PendingQueued", {
          count: this.rtmState.pending.length,
        }),
      );
      this.#queueRender(`manual:${operation.type}`);
      return;
    }

    await this.#applyOperation(operation);
    this.#queueRender(`instant:${operation.type}`);
  }

  async #applyOperation(operation) {
    switch (operation.type) {
      case "addExisting": {
        const table = await RollTableManagerService.loadEditableTable(
          operation.source,
          operation.tab,
        );
        const actor = await fromUuid(operation.actorUuid);
        if (!actor) {
          throw new Error(
            game.i18n.localize("STA_TC.RollTableManager.Errors.ActorNotFound"),
          );
        }
        await RollTableManagerService.addActorResult(table, actor);
        this.#invalidateData();
        this.#setStatus(
          game.i18n.localize("STA_TC.RollTableManager.Status.Added"),
        );
        break;
      }
      case "removeResult": {
        const table = await RollTableManagerService.loadEditableTable(
          operation.source,
          operation.tab,
        );
        const usedRecord =
          await RollTableManagerService.removeResultToUsedRecord(
            table,
            operation.resultId,
            {
              source: operation.source,
              subKey: operation.tab,
              origin: "manual",
            },
          );
        await RollTableManagerService.appendUsedRecord(
          this.tracker,
          operation.source,
          usedRecord,
        );
        this.#invalidateData();
        this.#setStatus(
          game.i18n.localize("STA_TC.RollTableManager.Status.RemovedToUsed"),
        );
        break;
      }
      case "restoreUsed": {
        const usedKey = RollTableManagerService.getUsedKey(operation.source);
        const usedList = foundry.utils.deepClone(
          this.tracker.system[usedKey] || [],
        );
        const record = usedList[operation.index];
        if (!record) return;
        await RollTableManagerService.restoreUsedRecord(record);
        usedList.splice(operation.index, 1);
        await this.tracker.update({ [`system.${usedKey}`]: usedList });
        this.#invalidateData();
        this.#setStatus(
          game.i18n.localize("STA_TC.RollTableManager.Status.Restored"),
        );
        break;
      }
      case "removeUsedRecord": {
        await RollTableManagerService.removeUsedRecordAtIndex(
          this.tracker,
          operation.source,
          operation.index,
        );
        this.#invalidateData();
        this.#setStatus(
          game.i18n.localize("STA_TC.RollTableManager.Status.UsedRemoved"),
        );
        break;
      }
      case "createNew": {
        const table = await RollTableManagerService.loadEditableTable(
          operation.source,
          operation.tab,
        );
        const config = RollTableManagerService.getSourceConfig(
          operation.source,
        );
        // Always use the saved default folder for creation, not the filter dropdown.
        const folderId =
          this.#getDefaultFolder(operation.source, operation.tab) || null;
        if (config.actorType) {
          // Actor-backed (POI/Asset): create actor in compendium.
          const actor = await RollTableManagerService.createActorQuick({
            name: operation.name,
            source: operation.source,
            subKey: operation.tab,
            table,
            folderId,
          });
          this.#invalidateData({ clearCompendiumIndex: true });
          actor?.sheet?.render(true);
        } else if (config.itemSettingKey) {
          // Item-backed (Progression/Escalation/Event): create item in
          // compendium when one is configured, else fall back to text result.
          const itemPackId = await RollTableManagerService.inferItemCompendium(
            operation.source,
            table,
          );
          if (itemPackId) {
            const item = await RollTableManagerService.createItemQuick({
              name: operation.name,
              source: operation.source,
              table,
              folderId,
            });
            this.#invalidateData({ clearCompendiumIndex: true });
            item?.sheet?.render(true);
          } else {
            await RollTableManagerService.createTextResult({
              name: operation.name,
              table,
            });
            this.#invalidateData();
          }
        } else {
          // Plain text result for unconfigured sources.
          await RollTableManagerService.createTextResult({
            name: operation.name,
            table,
          });
          this.#invalidateData();
        }
        this.#setStatus(
          game.i18n.localize("STA_TC.RollTableManager.Status.Created"),
        );
        break;
      }
      case "deleteActor": {
        try {
          await RollTableManagerService.deleteActorWithWarning(
            operation.actorUuid,
            {
              force: false,
            },
          );
        } catch (error) {
          const confirm = await DialogV2.confirm({
            window: {
              title: game.i18n.localize("STA_TC.RollTableManager.DeleteActor"),
            },
            content: `<p>${foundry.utils.escapeHTML(error.message)}</p><p>${game.i18n.localize("STA_TC.RollTableManager.ForceDeletePrompt")}</p>`,
          });
          if (!confirm) return;
          await RollTableManagerService.deleteActorWithWarning(
            operation.actorUuid,
            {
              force: true,
            },
          );
        }
        this.#invalidateData({ clearCompendiumIndex: true });
        this.#setStatus(
          game.i18n.localize("STA_TC.RollTableManager.Status.ActorDeleted"),
        );
        break;
      }
      default:
        break;
    }
  }

  #setStatus(message, level = "info") {
    this.rtmState.statusMessage = message;
    this.rtmState.statusLevel = level;
  }

  #switchSource(source) {
    if (!SOURCE_TABS[source]) return;
    this.rtmState.source = source;
    this.rtmState.tab = SOURCE_TABS[source][0];
    this.rtmState.compFolderFilter = ""; // reset folder when source changes
    this.#invalidateData();
    this.#queueRender("switchSource");
  }

  static async _onSwitchTab(event, target) {
    const tab = target.dataset.tab;
    if (!tab) return;
    this.rtmState.tab = tab;
    this.#invalidateData();
    this.#queueRender("switchTab");
  }

  static async _onUpdateSearch(event, target) {
    this.rtmState.search = target.value || "";
  }

  static async _onAddExisting(event, target) {
    const actorUuid = target.dataset.uuid;
    if (!actorUuid) return;
    try {
      await this.#performOrQueue({
        type: "addExisting",
        source: this.rtmState.source,
        tab: this.rtmState.tab,
        actorUuid,
      });
    } catch (error) {
      this.#reportError("onAddExisting", error);
    }
  }

  static async _onRemoveResult(event, target) {
    const resultId = target.dataset.resultId;
    if (!resultId) return;
    try {
      await this.#performOrQueue({
        type: "removeResult",
        source: this.rtmState.source,
        tab: this.rtmState.tab,
        resultId,
      });
    } catch (error) {
      this.#reportError("onRemoveResult", error);
    }
  }

  static async _onRestoreUsed(event, target) {
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) return;
    try {
      await this.#performOrQueue({
        type: "restoreUsed",
        source: this.rtmState.source,
        index,
      });
    } catch (error) {
      this.#reportError("onRestoreUsed", error);
    }
  }

  static async _onRemoveUsedRecord(event, target) {
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) return;
    try {
      await this.#performOrQueue({
        type: "removeUsedRecord",
        source: this.rtmState.source,
        index,
      });
    } catch (error) {
      this.#reportError("onRemoveUsedRecord", error);
    }
  }

  static async _onCreateNew(event, target) {
    const input = this.element?.querySelector("[name='newName']");
    const name = (input?.value || "").trim();
    if (!name) {
      this.#setStatus(
        game.i18n.localize("STA_TC.RollTableManager.Errors.NameRequired"),
        "error",
      );
      this.#queueRender("createNew:missingName");
      return;
    }

    input.value = "";

    try {
      await this.#performOrQueue({
        type: "createNew",
        source: this.rtmState.source,
        tab: this.rtmState.tab,
        name,
      });
    } catch (error) {
      this.#reportError("onCreateNew", error);
    }
  }

  static async _onOpenActor(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const actor = await fromUuid(uuid);
    actor?.sheet?.render(true);
  }

  static async _onOpenTable(event, target) {
    const table = this.rtmState.cachedTable;
    if (table?.sheet) {
      table.sheet.render(true);
      return;
    }
    const uuid = this.rtmState.cachedTable?.uuid;
    const resolved = uuid ? await fromUuid(uuid) : null;
    resolved?.sheet?.render(true);
  }

  static async _onOpenCompendium(event, target) {
    const packId = this.rtmState.cachedInferredPackId;
    if (!packId) return;
    game.packs.get(packId)?.render(true);
  }

  static async _onApplyPending(event, target) {
    if (!this.rtmState.pending.length) {
      this.#setStatus(
        game.i18n.localize("STA_TC.RollTableManager.PendingNone"),
      );
      this.#queueRender("applyPending:none");
      return;
    }

    const ops = [...this.rtmState.pending];
    this.rtmState.pending = [];

    for (const op of ops) {
      try {
        await this.#applyOperation(op);
      } catch (error) {
        this.#reportError("onApplyPending", error);
        return;
      }
    }

    this.#setStatus(
      game.i18n.localize("STA_TC.RollTableManager.PendingApplied"),
    );
    this.#invalidateData({ clearCompendiumIndex: true });
    this.#queueRender("applyPending:complete");
  }

  static async _onCloseDialog(event, target) {
    this.close();
  }

  static open(tracker) {
    if (!game.user?.isGM) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.RollTableManager.Errors.GmOnly"),
      );
      return null;
    }
    const app = new RollTableManager(tracker);
    app.render(true);
    return app;
  }

  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners?.(partId, htmlElement, options);
    if (partId !== "sheet") return;
    const root = htmlElement;
    if (!root) return;

    const compendiumRows = new Set(
      root.querySelectorAll(".rtm-list-compendium [data-rtm-filter-name]"),
    );

    const applyFilters = () => {
      const normalize = (v) =>
        String(v ?? "")
          .trim()
          .toLowerCase();
      const q = String(this.rtmState.search ?? "")
        .trim()
        .toLowerCase();
      const poiPower = normalize(this.rtmState.compPower);
      const difficulty = normalize(this.rtmState.compDifficulty);
      const urgency = normalize(this.rtmState.compUrgency);
      const assetPower = normalize(this.rtmState.compAssetPower);

      for (const row of root.querySelectorAll("[data-rtm-filter-name]")) {
        const name = String(row.dataset.rtmFilterName ?? "").toLowerCase();
        let visible = !q || name.includes(q);

        if (
          visible &&
          compendiumRows.has(row) &&
          this.rtmState.source === "poi"
        ) {
          if (poiPower) {
            const rowPower = normalize(row.dataset.rtmPower);
            const rowPower2 = normalize(row.dataset.rtmPower2);
            visible = rowPower === poiPower || rowPower2 === poiPower;
          }
          if (visible && difficulty) {
            visible = normalize(row.dataset.rtmDifficulty) === difficulty;
          }
          if (visible && urgency && this.rtmState.tab === "tacticalThreat") {
            visible = normalize(row.dataset.rtmUrgency) === urgency;
          }
        } else if (
          visible &&
          compendiumRows.has(row) &&
          this.rtmState.source === "asset"
        ) {
          if (assetPower) {
            visible = normalize(row.dataset.rtmPrimaryPower) === assetPower;
          }
        }

        row.style.display = visible ? "" : "none";
      }
    };

    const searchInput = root.querySelector("#rtm-search");
    if (searchInput) {
      searchInput.addEventListener("input", (event) => {
        this.rtmState.search = event.currentTarget?.value || "";
        applyFilters();
      });
      if (searchInput.value !== this.rtmState.search) {
        searchInput.value = this.rtmState.search || "";
      }
    }

    // Compendium attribute filters (POI only). DOM-only, no re-render.
    const bindFilter = (selector, stateKey) => {
      const el = root.querySelector(selector);
      if (!el) return;
      el.addEventListener("change", (event) => {
        this.rtmState[stateKey] = event.currentTarget?.value || "";
        applyFilters();
      });
    };
    bindFilter("#rtm-filter-power", "compPower");
    bindFilter("#rtm-filter-difficulty", "compDifficulty");
    bindFilter("#rtm-filter-urgency", "compUrgency");
    bindFilter("#rtm-filter-asset-power", "compAssetPower");

    // Folder filter: unlike attribute filters, this requires a re-render
    // because filtering happens at fetch time, not in the DOM.
    const folderSelect = root.querySelector("#rtm-folder-filter");
    if (folderSelect) {
      folderSelect.addEventListener("change", (event) => {
        this.rtmState.compFolderFilter = event.currentTarget?.value || "";
        this.rtmState.needsReload = true;
        this.#queueRender("folderFilter:change");
      });
    }

    // Source select uses a change listener rather than a click action so that
    // opening the native dropdown does not trigger a re-render (which would
    // immediately close the dropdown).
    const sourceSelect = root.querySelector("#rtm-source");
    sourceSelect?.addEventListener("change", (event) => {
      this.#switchSource(event.currentTarget?.value);
    });

    const autoMoveCheckbox = root.querySelector("#rtm-auto-move-on-draw");
    if (autoMoveCheckbox) {
      autoMoveCheckbox.addEventListener("change", async (event) => {
        const table = this.rtmState.cachedTable;
        if (!table) return;
        await RollTableManagerService.setAutoMoveOnDraw(
          table,
          event.currentTarget.checked,
        );
      });
    }

    applyFilters();
  }
}
