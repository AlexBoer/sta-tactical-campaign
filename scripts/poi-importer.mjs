/**
 * Point of Interest Batch Importer for STA Tactical Campaign
 *
 * Parses an array of key-value formatted strings and creates a folder of
 * POI actors. Each string defines one POI using comma-separated key:value
 * pairs.  Only the `name` key is required; all other fields fall back to
 * the PoiData schema defaults.
 *
 * Supported keys:
 *   name          – Actor display name (required)
 *   type          – POI type: tacticalThreat|threat|tactical|exploration|explore|routine|unknown
 *   power         – Primary power: medical|military|personal|science|social
 *   difficulty    – Primary difficulty 1-5 (alias: diff)
 *   power2        – Secondary power (same choices, or blank)
 *   difficulty2   – Secondary difficulty 1-5 (alias: diff2)
 *   urgency       – Urgency 1-5
 *   description   – HTML or plain-text description (alias: desc)
 *   note          – GM notes
 *   img           – Portrait / token image path
 *
 * Example string:
 *   "name: Klingon Fleet, type: threat, power: military, difficulty: 3, urgency: 2"
 */

const MODULE_ID = "sta-tactical-campaign";

const VALID_TYPES = new Set([
  "tacticalThreat",
  "exploration",
  "routine",
  "unknown",
]);

const TYPE_ALIASES = {
  threat: "tacticalThreat",
  tactical: "tacticalThreat",
  tacticalthreat: "tacticalThreat",
  explore: "exploration",
};

const VALID_POWERS = new Set([
  "medical",
  "military",
  "personal",
  "science",
  "social",
]);

const TYPE_CONFIG = {
  tacticalThreat: { icon: "⚔️", labelKey: "STA_TC.Poi.Types.TacticalThreat" },
  exploration: { icon: "🔭", labelKey: "STA_TC.Poi.Types.Exploration" },
  routine: { icon: "📋", labelKey: "STA_TC.Poi.Types.Routine" },
  unknown: { icon: "❓", labelKey: "STA_TC.Poi.Types.Unknown" },
};

export class PoiImporter {
  /**
   * Import an array of key-value strings as POI actors into a new folder.
   *
   * @param {string[]} strings  Array of key-value formatted strings
   * @param {object}   [options]
   * @param {string}   [options.folderName]  Name for the created folder
   *                    (defaults to localized "Imported POIs")
   * @returns {Promise<Folder>} The created folder containing the new POI actors
   */
  static async import(strings, { folderName } = {}) {
    if (!Array.isArray(strings) || strings.length === 0) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Poi.Importer.NoEntries"),
      );
      return null;
    }

    // Parse all entries, collecting warnings
    const parsed = [];
    for (let i = 0; i < strings.length; i++) {
      const entry = this._parseString(strings[i], i);
      if (entry) parsed.push(entry);
    }

    if (parsed.length === 0) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Poi.Importer.NoneValid"),
      );
      return null;
    }

    // Create the folder
    const name =
      folderName || game.i18n.localize("STA_TC.Poi.Importer.FolderName");
    const folder = await Folder.create({ name, type: "Actor" });

    // Create each POI actor
    const created = [];
    for (const entry of parsed) {
      const actorData = {
        name: entry.name,
        type: `${MODULE_ID}.poi`,
        img: entry.img || undefined,
        folder: folder.id,
        system: entry.system,
      };
      const actor = await Actor.create(actorData);
      created.push(actor);
    }

    // Post summary to chat
    await this._postChatSummary(folder, created);

    ui.notifications.info(
      game.i18n.format("STA_TC.Poi.Importer.Complete", {
        count: created.length,
        folder: folder.name,
      }),
    );

    return folder;
  }

  /**
   * Parse a single key-value string into POI actor data.
   *
   * @param {string} str    The key-value string to parse
   * @param {number} index  Index in the original array (for logging)
   * @returns {{ name: string, system: object, img: string|undefined }|null}
   */
  static _parseString(str, index) {
    if (typeof str !== "string" || !str.trim()) {
      console.warn(
        `${MODULE_ID} | POI Importer: Entry ${index} is empty, skipping.`,
      );
      return null;
    }

    // Parse key:value pairs separated by commas.
    // Values may contain colons (e.g. in description text), so we only split
    // on the first colon in each segment.
    const pairs = {};
    for (const segment of str.split(",")) {
      const colonIdx = segment.indexOf(":");
      if (colonIdx === -1) continue;
      const key = segment.slice(0, colonIdx).trim().toLowerCase();
      const value = segment.slice(colonIdx + 1).trim();
      if (key) pairs[key] = value;
    }

    // Name is required
    const name = pairs.name;
    if (!name) {
      console.warn(
        `${MODULE_ID} | POI Importer: Entry ${index} has no "name" key, skipping. Input: "${str}"`,
      );
      ui.notifications.warn(
        game.i18n.format("STA_TC.Poi.Importer.NoName", { index: index + 1 }),
      );
      return null;
    }

    const system = {};

    // Type
    const rawType = pairs.type;
    if (rawType) {
      const normalized = this._normalizeType(rawType);
      if (normalized) {
        system.poiType = normalized;
      } else {
        console.warn(
          `${MODULE_ID} | POI Importer: Entry ${index} has invalid type "${rawType}", using default.`,
        );
      }
    }

    // Primary power
    const rawPower = pairs.power?.toLowerCase();
    if (rawPower) {
      if (VALID_POWERS.has(rawPower)) {
        system.power = rawPower;
      } else {
        console.warn(
          `${MODULE_ID} | POI Importer: Entry ${index} has invalid power "${rawPower}", using default.`,
        );
      }
    }

    // Primary difficulty
    const rawDiff = pairs.difficulty ?? pairs.diff;
    if (rawDiff != null) {
      const num = Number(rawDiff);
      if (Number.isInteger(num) && num >= 1 && num <= 5) {
        system.difficulty = num;
      } else {
        console.warn(
          `${MODULE_ID} | POI Importer: Entry ${index} has invalid difficulty "${rawDiff}", using default.`,
        );
      }
    }

    // Secondary power
    const rawPower2 = pairs.power2?.toLowerCase();
    if (rawPower2) {
      if (VALID_POWERS.has(rawPower2)) {
        system.power2 = rawPower2;
      } else {
        console.warn(
          `${MODULE_ID} | POI Importer: Entry ${index} has invalid power2 "${rawPower2}", using default.`,
        );
      }
    }

    // Secondary difficulty
    const rawDiff2 = pairs.difficulty2 ?? pairs.diff2;
    if (rawDiff2 != null) {
      const num = Number(rawDiff2);
      if (Number.isInteger(num) && num >= 1 && num <= 5) {
        system.difficulty2 = num;
      } else {
        console.warn(
          `${MODULE_ID} | POI Importer: Entry ${index} has invalid difficulty2 "${rawDiff2}", using default.`,
        );
      }
    }

    // Urgency
    const rawUrgency = pairs.urgency;
    if (rawUrgency != null) {
      const num = Number(rawUrgency);
      if (Number.isInteger(num) && num >= 1 && num <= 5) {
        system.urgency = num;
      } else {
        console.warn(
          `${MODULE_ID} | POI Importer: Entry ${index} has invalid urgency "${rawUrgency}", using default.`,
        );
      }
    }

    // Description
    const rawDesc = pairs.description ?? pairs.desc;
    if (rawDesc) system.description = rawDesc;

    // Note
    if (pairs.note) system.note = pairs.note;

    // Unknown POI auto-masking: stash the real name and replace with generic
    const poiType = system.poiType ?? "unknown";
    let displayName = name;
    if (poiType === "unknown") {
      system.realName = name;
      displayName = game.i18n.localize("STA_TC.Poi.UnknownDefaultName");
    }

    return {
      name: displayName,
      system,
      img: pairs.img || undefined,
    };
  }

  /**
   * Normalize a user-supplied type string to a valid poiType value.
   *
   * @param {string} raw  The raw type string
   * @returns {string|null} Normalized type or null if invalid
   */
  static _normalizeType(raw) {
    const lower = raw.trim().toLowerCase();
    if (VALID_TYPES.has(lower)) return lower;
    return TYPE_ALIASES[lower] ?? null;
  }

  /**
   * Post a chat message summarizing the imported POIs.
   *
   * @param {Folder}  folder   The created folder
   * @param {Actor[]} actors   The created POI actors
   */
  static async _postChatSummary(folder, actors) {
    let rows = "";
    for (const actor of actors) {
      const poiType = actor.system.poiType;
      const cfg = TYPE_CONFIG[poiType] ?? TYPE_CONFIG.unknown;
      const typeLabel = game.i18n.localize(cfg.labelKey);
      const powerLabel = game.i18n.localize(
        `STA_TC.Powers.${actor.system.power.charAt(0).toUpperCase() + actor.system.power.slice(1)}`,
      );
      const displayName =
        poiType === "unknown" && actor.system.realName
          ? `${actor.name} (${actor.system.realName})`
          : actor.name;

      rows += `<tr>
        <td>${cfg.icon} ${typeLabel}</td>
        <td>@UUID[${actor.uuid}]{${displayName}}</td>
        <td>${powerLabel} ${actor.system.difficulty}</td>
      </tr>`;
    }

    const content = `
      <h3>${game.i18n.format("STA_TC.Poi.Importer.ChatTitle", { folder: folder.name })}</h3>
      <p>${game.i18n.format("STA_TC.Poi.Importer.ChatCount", { count: actors.length })}</p>
      <table>
        <thead>
          <tr>
            <th>${game.i18n.localize("STA_TC.Poi.Type")}</th>
            <th>${game.i18n.localize("STA_TC.PoiName")}</th>
            <th>${game.i18n.localize("STA_TC.Poi.Power")}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    await ChatMessage.create({
      content,
      speaker: {
        alias: game.i18n.localize("STA_TC.Poi.Importer.SpeakerAlias"),
      },
    });
  }
}
