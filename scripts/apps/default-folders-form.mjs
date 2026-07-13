/**
 * FormApplication for managing default creation folders per source+tab.
 * Allows users to configure where new actors/items are created in the compendium.
 */

const MODULE_ID = "sta-tactical-campaign";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Import RollTableManagerService to access source configuration
import { RollTableManagerService } from "./roll-table-manager-service.mjs";

// Maps source to its tabs and their labels
const SOURCE_CONFIGS = {
  poi: {
    label: "STA_TC.Types.PointOfInterest",
    tabs: {
      tacticalThreat: "STA_TC.Poi.Types.TacticalThreat",
      exploration: "STA_TC.Poi.Types.Exploration",
      routine: "STA_TC.Poi.Types.Routine",
      unknown: "STA_TC.Poi.Types.Unknown",
    },
  },
  asset: {
    label: "STA_TC.Types.Asset",
    tabs: {
      character: "STA_TC.AssetTypes.Character",
      ship: "STA_TC.AssetTypes.Ship",
      resource: "STA_TC.AssetTypes.Resource",
    },
  },
  progression: {
    label: "STA_TC.RollTableManager.SourceProgression",
    tabs: {
      progression: "STA_TC.RollTableManager.TabProgression",
    },
  },
  escalation: {
    label: "STA_TC.RollTableManager.SourceEscalation",
    tabs: {
      escalation: "STA_TC.RollTableManager.TabEscalation",
    },
  },
  event: {
    label: "STA_TC.RollTableManager.SourceEvent",
    tabs: {
      event: "STA_TC.RollTableManager.TabEvents",
    },
  },
};

export class DefaultFoldersForm extends HandlebarsApplicationMixin(
  ApplicationV2,
) {
  static DEFAULT_OPTIONS = {
    id: "sta-tactical-campaign-default-folders",
    classes: ["sta-tactical-campaign", "default-folders-form"],
    tag: "form",
    window: {
      icon: "fas fa-folder",
      title: "STA_TC.Settings.DefaultFolders",
      resizable: true,
    },
    position: {
      width: 600,
      height: 700,
    },
    form: {
      handler: DefaultFoldersForm._onSubmitForm,
      submitOnChange: true,
      closeOnSubmit: false,
    },
  };

  static PARTS = {
    form: {
      template:
        "modules/sta-tactical-campaign/templates/default-folders-form.hbs",
    },
  };

  /**
   * Get all available folders for a given compendium pack, returned in
   * hierarchical (tree) order: each parent folder is immediately followed by
   * its children, with siblings sorted alphabetically. Each entry carries the
   * folder's own name and its nesting depth so the UI can indent it.
   */
  static #getFoldersForPack(packId) {
    if (!packId) return [];
    const pack = game.packs.get(packId);
    if (!pack) return [];

    const all = Array.from(pack.folders ?? []);
    if (!all.length) return [];

    const ids = new Set(all.map((f) => f.id));
    const parentIdOf = (f) => {
      const parent = f.folder;
      if (!parent) return null;
      const parentId =
        typeof parent === "string" ? parent : (parent.id ?? null);
      return parentId && ids.has(parentId) ? parentId : null;
    };

    // Group folders by their (resolved) parent id; null keys the roots.
    const childrenByParent = new Map();
    for (const f of all) {
      const parentId = parentIdOf(f);
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId).push(f);
    }
    for (const list of childrenByParent.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Depth-first walk from the roots to produce tree order.
    const folders = [];
    const walk = (parentId, depth) => {
      for (const f of childrenByParent.get(parentId) ?? []) {
        folders.push({ id: f.id, name: f.name, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);

    return folders;
  }

  /**
   * Resolve the compendium pack ID for a source+tab the same way the Roll
   * Table Manager does: use the configured actor/item compendium setting when
   * present, otherwise infer it from the configured rollable table's results.
   *
   * Loads the table read-only via its UUID (rather than
   * `loadEditableTable`, which throws for locked compendium packs) so it works
   * even when the tables live in a locked, shared compendium.
   */
  static async #getPackIdForSourceTab(source, tab) {
    try {
      let table = null;
      try {
        const uuid = RollTableManagerService.getTableUuid(source, tab);
        if (uuid) table = await fromUuid(uuid);
      } catch {
        table = null;
      }

      const packId = RollTableManagerService.isItemBasedSource(source)
        ? await RollTableManagerService.inferItemCompendium(source, table)
        : await RollTableManagerService.inferCompendium(source, table);

      return packId || null;
    } catch {
      return null;
    }
  }

  async _prepareContext(options = {}) {
    const defaults = foundry.utils.deepClone(
      game.settings.get(MODULE_ID, "folderDefaults") || {},
    );

    const rows = [];

    for (const [source, sourceConfig] of Object.entries(SOURCE_CONFIGS)) {
      const sourceLabel = game.i18n.localize(sourceConfig.label);
      let firstTabInSource = true;

      for (const [tab, tabLabel] of Object.entries(sourceConfig.tabs)) {
        const key = `${source}:${tab}`;
        const packId = await DefaultFoldersForm.#getPackIdForSourceTab(
          source,
          tab,
        );
        const folders = packId
          ? DefaultFoldersForm.#getFoldersForPack(packId)
          : [];

        const allFolders = [
          {
            id: "",
            label: game.i18n.localize("STA_TC.RollTableManager.AllFolders"),
          },
          ...folders.map((f) => ({
            id: f.id,
            label: "\u00A0\u00A0\u00A0\u00A0".repeat(f.depth) + f.name,
          })),
        ];

        const currentDefault = defaults[key] || "";

        rows.push({
          key,
          source,
          tab,
          sourceLabel: firstTabInSource ? sourceLabel : "",
          tabLabel: game.i18n.localize(tabLabel),
          folders: allFolders,
          currentDefault,
          noFolders: !packId || !folders.length,
        });

        firstTabInSource = false;
      }
    }

    return {
      rows,
    };
  }

  /**
   * Handle form submission. Persists the selected default folder for each
   * source:tab combination to the `folderDefaults` world setting.
   * @this {DefaultFoldersForm}
   * @param {SubmitEvent} event         The originating submit event.
   * @param {HTMLFormElement} form      The submitted form element.
   * @param {FormDataExtended} formData The processed form data.
   */
  static async _onSubmitForm(event, form, formData) {
    const defaults = {};

    // Parse form data: "source:tab" = "folderId". Only persist non-empty
    // selections; an empty value means "All Folders" (no stored default).
    for (const [key, value] of Object.entries(formData.object)) {
      if (key.includes(":") && value) {
        defaults[key] = value;
      }
    }

    await game.settings.set(MODULE_ID, "folderDefaults", defaults);
  }
}
