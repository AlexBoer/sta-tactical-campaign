/**
 * Point of Interest Folder Exporter for STA Tactical Campaign
 *
 * Exports all POI actors in a given folder to an array of key-value
 * formatted strings compatible with {@link PoiImporter.import}.
 *
 * Usage:
 *   const api = game.modules.get("sta-tactical-campaign").api;
 *   const strings = api.exportPois("My POIs");
 */

const MODULE_ID = "sta-tactical-campaign";

export class PoiExporter {
  /**
   * Prompt for a source folder, then export POIs from it.
   *
   * @returns {Promise<string[]>}
   */
  static async promptAndExport() {
    const poiType = `${MODULE_ID}.poi`;

    const folders = game.folders.filter((f) => {
      if (f.type !== "Actor") return false;
      return game.actors.some(
        (a) => a.type === poiType && a.folder?.id === f.id,
      );
    });

    if (!folders.length) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Poi.Exporter.NoPoiFolders"),
      );
      return [];
    }

    const options = folders
      .map((f) => {
        const count = game.actors.filter(
          (a) => a.type === poiType && a.folder?.id === f.id,
        ).length;
        return `<option value="${f.id}">${foundry.utils.escapeHTML(f.name)} (${count})</option>`;
      })
      .join("");

    const folderId = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize("STA_TC.Poi.Exporter.DialogTitle"),
      },
      content: `
        <div class="form-group">
          <label>${game.i18n.localize("STA_TC.Poi.Exporter.DialogFolderLabel")}</label>
          <select id="poi-export-folder-select" style="width:100%;">${options}</select>
        </div>`,
      buttons: [
        {
          action: "export",
          default: true,
          label: game.i18n.localize("STA_TC.Poi.Exporter.DialogExport"),
          callback: (_event, _button, dialog) => {
            const select = dialog.element.querySelector(
              "#poi-export-folder-select",
            );
            return select?.value ?? null;
          },
        },
        {
          action: "cancel",
          label: game.i18n.localize("STA_TC.Cancel"),
        },
      ],
      close: () => null,
    });

    if (!folderId) return [];

    const objects = this.export(folderId);
    if (!objects.length) return objects;

    const jsonText = JSON.stringify(objects, null, 2);
    await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize("STA_TC.Poi.Exporter.ResultTitle"),
      },
      position: { width: 640, height: "auto" },
      content: `
        <p>${game.i18n.localize("STA_TC.Poi.Exporter.ResultHint")}</p>
        <textarea style="width:100%; min-height:320px; font-family:monospace; font-size:11px;" readonly>${foundry.utils.escapeHTML(jsonText)}</textarea>`,
      buttons: [
        {
          action: "copy",
          default: true,
          label: game.i18n.localize("STA_TC.Poi.Exporter.CopyToClipboard"),
          callback: async () => {
            await navigator.clipboard.writeText(jsonText);
            ui.notifications.info(
              game.i18n.localize("STA_TC.Poi.Exporter.Copied"),
            );
          },
        },
        {
          action: "close",
          label: game.i18n.localize("STA_TC.Cancel"),
        },
      ],
      close: () => null,
    });

    return objects;
  }

  /**
   * Export all POI actors in a folder to an array of JSON objects.
   *
   * @param {string|Folder} folderOrId  A Folder instance, folder ID, or
   *                                     folder name to export from
   * @returns {object[]} Array of POI data objects
   */
  static export(folderOrId) {
    const folder = this._resolveFolder(folderOrId);
    if (!folder) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Poi.Exporter.FolderNotFound"),
      );
      return [];
    }

    const poiType = `${MODULE_ID}.poi`;
    const actors = game.actors.filter(
      (a) => a.type === poiType && a.folder?.id === folder.id,
    );

    if (actors.length === 0) {
      ui.notifications.warn(
        game.i18n.format("STA_TC.Poi.Exporter.NoPois", {
          folder: folder.name,
        }),
      );
      return [];
    }

    const objects = actors.map((actor) => this._actorToObject(actor));

    ui.notifications.info(
      game.i18n.format("STA_TC.Poi.Exporter.Complete", {
        count: objects.length,
        folder: folder.name,
      }),
    );

    return objects;
  }

  /**
   * Resolve a folder from an ID, name, or Folder instance.
   *
   * @param {string|Folder} folderOrId
   * @returns {Folder|null}
   */
  static _resolveFolder(folderOrId) {
    if (!folderOrId) return null;
    if (folderOrId instanceof Folder) return folderOrId;

    // Try by ID first
    const byId = game.folders.get(folderOrId);
    if (byId?.type === "Actor") return byId;

    // Fall back to name match
    return (
      game.folders.find((f) => f.type === "Actor" && f.name === folderOrId) ??
      null
    );
  }

  /**
   * Serialize a single POI actor to a plain object.
   *
   * @param {Actor} actor  A POI actor
   * @returns {object}
   */
  static _actorToObject(actor) {
    const sys = actor.system;
    const obj = {};

    // For unknown POIs, export the real name if available
    const name =
      sys.poiType === "unknown" && sys.realName ? sys.realName : actor.name;
    obj.name = name;

    // Type — always include
    obj.type = sys.poiType;

    // Primary power & difficulty
    obj.power = sys.power;
    obj.difficulty = sys.difficulty;

    // Secondary power & difficulty (only if set)
    if (sys.power2) {
      obj.power2 = sys.power2;
      if (sys.difficulty2 != null) {
        obj.difficulty2 = sys.difficulty2;
      }
    }

    // Urgency (only if non-default)
    if (sys.urgency > 1) {
      obj.urgency = sys.urgency;
    }

    // Description (strip HTML tags for a cleaner round-trip)
    const desc = (sys.description || "").replace(/<[^>]*>/g, "").trim();
    if (desc) {
      obj.description = desc;
    }

    // Note
    if (sys.note) {
      obj.note = sys.note;
    }

    // Image (skip Foundry default)
    if (actor.img && !actor.img.includes("mystery-man")) {
      obj.img = actor.img;
    }

    return obj;
  }
}
