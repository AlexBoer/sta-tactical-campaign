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
   * Export all POI actors in a folder to an array of key-value strings.
   *
   * @param {string|Folder} folderOrId  A Folder instance, folder ID, or
   *                                     folder name to export from
   * @returns {string[]} Array of key-value formatted strings
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

    const strings = actors.map((actor) => this._actorToString(actor));

    ui.notifications.info(
      game.i18n.format("STA_TC.Poi.Exporter.Complete", {
        count: strings.length,
        folder: folder.name,
      }),
    );

    return strings;
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
      game.folders.find(
        (f) => f.type === "Actor" && f.name === folderOrId,
      ) ?? null
    );
  }

  /**
   * Serialize a single POI actor to a key-value string.
   *
   * @param {Actor} actor  A POI actor
   * @returns {string}
   */
  static _actorToString(actor) {
    const sys = actor.system;
    const parts = [];

    // For unknown POIs, export the real name if available
    const name =
      sys.poiType === "unknown" && sys.realName ? sys.realName : actor.name;
    parts.push(`name: ${name}`);

    // Type — always include
    parts.push(`type: ${sys.poiType}`);

    // Primary power & difficulty
    parts.push(`power: ${sys.power}`);
    parts.push(`difficulty: ${sys.difficulty}`);

    // Secondary power & difficulty (only if set)
    if (sys.power2) {
      parts.push(`power2: ${sys.power2}`);
      if (sys.difficulty2 != null) {
        parts.push(`difficulty2: ${sys.difficulty2}`);
      }
    }

    // Urgency (only if non-default)
    if (sys.urgency > 1) {
      parts.push(`urgency: ${sys.urgency}`);
    }

    // Description (strip HTML tags for a cleaner round-trip)
    const desc = (sys.description || "").replace(/<[^>]*>/g, "").trim();
    if (desc) {
      parts.push(`desc: ${desc}`);
    }

    // Note
    if (sys.note) {
      parts.push(`note: ${sys.note}`);
    }

    // Image (skip Foundry default)
    if (actor.img && !actor.img.includes("mystery-man")) {
      parts.push(`img: ${actor.img}`);
    }

    return parts.join(", ");
  }
}
