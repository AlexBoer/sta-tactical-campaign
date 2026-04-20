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
   * Prompt for pasted POI text, then import into a folder.
   *
   * @param {object}   [options]
   * @param {string}   [options.folderName]  Default folder name for the dialog
   * @returns {Promise<Folder|null>}
   */
  static async promptAndImport({ folderName } = {}) {
    const defaultFolderName =
      folderName || game.i18n.localize("STA_TC.Poi.Importer.FolderName");

    const formData = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("STA_TC.Poi.Importer.DialogTitle") },
      content: `
        <div class="sta-tc-poi-import-dialog">
          <p>${game.i18n.localize("STA_TC.Poi.Importer.DialogHint")}</p>
          <div class="form-group">
            <label>${game.i18n.localize("STA_TC.Poi.Importer.FolderLabel")}</label>
            <input type="text" name="folderName" value="${foundry.utils.escapeHTML(defaultFolderName)}" />
          </div>
          <div class="form-group">
            <label>${game.i18n.localize("STA_TC.Poi.Importer.DialogInputLabel")}</label>
            <textarea
              name="poiText"
              rows="10"
              placeholder="${foundry.utils.escapeHTML(game.i18n.localize("STA_TC.Poi.Importer.DialogPlaceholder"))}"
            ></textarea>
          </div>
        </div>`,
      buttons: [
        {
          action: "import",
          default: true,
          label: game.i18n.localize("STA_TC.Poi.Importer.DialogImport"),
          callback: (_event, _button, dialog) => {
            const form = dialog.element.querySelector("form");
            return form ? new FormData(form) : null;
          },
        },
        {
          action: "cancel",
          label: game.i18n.localize("Cancel"),
        },
      ],
      close: () => null,
    });

    if (!formData) return null;

    const text = String(formData.get("poiText") ?? "").trim();
    const chosenFolder = String(formData.get("folderName") ?? "").trim();

    return this.importFromText(text, {
      folderName: chosenFolder || defaultFolderName,
    });
  }

  /**
   * Import POIs from pasted text.
   *
   * Accepts either newline-delimited POI entries or a JSON array of strings.
   *
   * @param {string} text
   * @param {object} [options]
   * @param {string} [options.folderName]
   * @returns {Promise<Folder|null>}
   */
  static async importFromText(text, options = {}) {
    const entries = this._coerceEntriesInput(text);
    const reviewed = await this._promptReview(entries, options);
    if (!reviewed) return null;

    return this.import(reviewed.entries, {
      folderName: reviewed.folderName,
    });
  }

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

    // Parse all entries — supports both JSON objects and legacy key-value strings
    const parsed = [];
    for (let i = 0; i < strings.length; i++) {
      const raw = strings[i];
      const entry =
        typeof raw === "object" && raw !== null
          ? this._parseObject(raw, i)
          : this._parseString(raw, i);
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
   * Show a GUI review table before creating actors.
   *
   * @param {(string|object)[]} entries
   * @param {object} [options]
   * @param {string} [options.folderName]
   * @returns {Promise<{entries: object[], folderName: string}|null>}
   */
  static async _promptReview(entries, { folderName } = {}) {
    const normalized = this._normalizeEntriesForReview(entries);
    if (!normalized.length) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Poi.Importer.NoneValid"),
      );
      return null;
    }

    const defaultFolderName =
      folderName || game.i18n.localize("STA_TC.Poi.Importer.FolderName");

    const typeOptions = [
      ["tacticalThreat", "⚔️ Tactical Threat"],
      ["exploration", "🔭 Exploration"],
      ["routine", "📋 Routine"],
      ["unknown", "❓ Unknown"],
    ];
    const powerOptions = [
      ["military", "Military"],
      ["science", "Science"],
      ["medical", "Medical"],
      ["personal", "Personal"],
      ["social", "Social"],
    ];

    const _sel = (name, opts, current, includeNone = false) =>
      `<select name="${name}" style="width:100%;">${
        includeNone
          ? `<option value=""${!current ? " selected" : ""}>— None —</option>`
          : ""
      }${opts
        .map(
          ([v, l]) =>
            `<option value="${v}"${
              v === current ? " selected" : ""
            }>${l}</option>`,
        )
        .join("")}</select>`;

    const rows = normalized
      .map((poi, i) => {
        const hiddenFields = [
          `<input type="hidden" name="urgency_${i}" value="${poi.urgency ?? ""}" />`,
          `<input type="hidden" name="img_${i}" value="${foundry.utils.escapeHTML(poi.img ?? "")}" />`,
        ].join("");

        // Render difficulty as text inputs to avoid browser/Foundry stripping
        // the value attribute on number inputs before the form is submitted.
        const diff1Val = String(poi.difficulty ?? 2);
        const diff2Val = poi.difficulty2 != null ? String(poi.difficulty2) : "";

        return `<tr id="sta-tc-review-row-${i}">
          <td style="text-align:center; width:28px;" rowspan="3">
            <input type="checkbox" name="include_${i}" checked title="Include this POI" />
          </td>
          <td colspan="5" style="padding:4px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <input type="text" name="name_${i}" value="${foundry.utils.escapeHTML(poi.name)}" style="width:100%;" />
              <button type="button"
                style="background:none; border:none; cursor:pointer; color:#c44; width:18px;"
                title="Remove row"
                onclick="
                  const nameRow = document.getElementById('sta-tc-review-row-${i}');
                  const statsRow = document.getElementById('sta-tc-review-stats-${i}');
                  const descRow = document.getElementById('sta-tc-review-desc-${i}');
                  nameRow.style.opacity = '0.35';
                  if (statsRow) statsRow.style.opacity = '0.35';
                  if (descRow) descRow.style.opacity = '0.35';
                  nameRow.querySelector('[name=include_${i}]').checked = false;
                  this.disabled = true;
                ">🗑</button>
            </div>
          </td>
          ${hiddenFields}
        </tr>
        <tr id="sta-tc-review-stats-${i}">
          <td style="width:150px;">${_sel(`type_${i}`, typeOptions, poi.type ?? "tacticalThreat")}</td>
          <td style="width:110px;">${_sel(`power_${i}`, powerOptions, poi.power ?? "military")}</td>
          <td style="width:50px;">
            <input type="text" inputmode="numeric" pattern="[1-5]" name="difficulty_${i}" value="${diff1Val}" style="width:100%;" />
          </td>
          <td style="width:110px;">${_sel(`power2_${i}`, powerOptions, poi.power2 ?? "", true)}</td>
          <td style="width:50px;">
            <input type="text" inputmode="numeric" pattern="[1-5]" name="difficulty2_${i}" value="${diff2Val}" style="width:100%;" placeholder="—" />
          </td>
        </tr>
        <tr id="sta-tc-review-desc-${i}" style="border-bottom:1px solid #333;">
          <td colspan="2" style="padding:2px 4px 6px;">
            <textarea
              name="description_${i}"
              rows="2"
              style="width:100%; font-size:11px; resize:vertical;"
              placeholder="Description…"
            >${foundry.utils.escapeHTML(poi.description ?? "")}</textarea>
          </td>
          <td colspan="3" style="padding:2px 4px 6px;">
            <textarea
              name="note_${i}"
              rows="2"
              style="width:100%; font-size:11px; resize:vertical;"
              placeholder="Note…"
            >${foundry.utils.escapeHTML(poi.note ?? "")}</textarea>
          </td>
        </tr>`;
      })
      .join("");

    const content = `
      <div class="sta-tc-poi-review">
        <div class="form-group" style="margin-bottom:8px;">
          <label style="font-weight:bold;">${game.i18n.localize("STA_TC.Poi.Importer.FolderLabel")}</label>
          <input type="text" name="folderName" value="${foundry.utils.escapeHTML(defaultFolderName)}" style="width:100%;" />
        </div>
        <p style="margin:4px 0 6px; font-size:12px; color:#888;">
          ${game.i18n.format("STA_TC.Poi.Importer.ReviewHint", { count: normalized.length })}
        </p>
        <div style="max-height:62vh; overflow-y:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead>
              <tr style="border-bottom:1px solid #555;">
                <th style="width:28px;"></th>
                <th style="text-align:left; padding:2px 4px;">Type</th>
                <th style="text-align:left; padding:2px 4px;">Power</th>
                <th style="text-align:left; padding:2px 4px;">Diff</th>
                <th style="text-align:left; padding:2px 4px;">Power 2</th>
                <th style="text-align:left; padding:2px 4px;">Diff 2</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <input type="hidden" name="rowCount" value="${normalized.length}" />
      </div>`;

    const formData = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize("STA_TC.Poi.Importer.ReviewTitle"),
        resizable: true,
      },
      position: { width: 920, height: 760 },
      content,
      buttons: [
        {
          action: "import",
          default: true,
          label: game.i18n.localize("STA_TC.Poi.Importer.ReviewImport"),
          callback: (_event, _button, dialog) => {
            const form = dialog.element.querySelector("form");
            return form ? new FormData(form) : null;
          },
        },
        {
          action: "cancel",
          label: game.i18n.localize("STA_TC.Cancel"),
        },
      ],
      close: () => null,
    });

    if (!formData) return null;

    const chosenFolder =
      String(formData.get("folderName") ?? "").trim() || defaultFolderName;
    const count = parseInt(formData.get("rowCount") ?? "0", 10);
    const confirmedEntries = [];

    for (let i = 0; i < count; i++) {
      // Unchecked checkboxes are absent from FormData
      if (!formData.has(`include_${i}`)) continue;

      const obj = {
        name: String(formData.get(`name_${i}`) ?? "").trim(),
        type: String(formData.get(`type_${i}`) ?? "tacticalThreat"),
        power: String(formData.get(`power_${i}`) ?? "military"),
        difficulty: parseInt(formData.get(`difficulty_${i}`) ?? "2", 10),
      };

      if (!obj.name) continue;

      const note = String(formData.get(`note_${i}`) ?? "").trim();
      if (note) obj.note = note;

      const power2 = String(formData.get(`power2_${i}`) ?? "").trim();
      if (power2) {
        obj.power2 = power2;
        const d2 = formData.get(`difficulty2_${i}`);
        if (d2) obj.difficulty2 = parseInt(d2, 10);
      }

      const urgency = formData.get(`urgency_${i}`);
      if (urgency) obj.urgency = parseInt(urgency, 10);

      const description = String(formData.get(`description_${i}`) ?? "").trim();
      if (description) obj.description = description;

      const img = String(formData.get(`img_${i}`) ?? "").trim();
      if (img) obj.img = img;

      confirmedEntries.push(obj);
    }

    if (!confirmedEntries.length) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Poi.Importer.NoneValid"),
      );
      return null;
    }

    return { entries: confirmedEntries, folderName: chosenFolder };
  }

  /**
   * Normalize raw entries into plain objects for the review dialog.
   *
   * @param {(string|object)[]} entries
   * @returns {object[]}
   */
  static _normalizeEntriesForReview(entries) {
    const normalized = [];
    for (let i = 0; i < entries.length; i++) {
      const raw = entries[i];
      const parsed =
        typeof raw === "object" && raw !== null
          ? this._parseObject(raw, i)
          : this._parseString(raw, i);
      if (!parsed) continue;

      const sys = parsed.system;
      const obj = {
        name:
          sys.poiType === "unknown" && sys.realName
            ? sys.realName
            : parsed.name,
        type: sys.poiType ?? "unknown",
        power: sys.power ?? "military",
        difficulty: sys.difficulty ?? 2,
      };
      if (sys.power2) obj.power2 = sys.power2;
      if (sys.difficulty2 != null) obj.difficulty2 = sys.difficulty2;
      if (sys.urgency != null) obj.urgency = sys.urgency;
      if (sys.description) obj.description = sys.description;
      if (sys.note) obj.note = sys.note;
      if (parsed.img) obj.img = parsed.img;

      normalized.push(obj);
    }
    return normalized;
  }

  /**
   * Coerce user input into an array of POI entry strings.
   *
   * @param {string|string[]} input
   * @returns {string[]}
   */
  static _coerceEntriesInput(input) {
    if (Array.isArray(input)) {
      // Preserve plain objects (JSON format); coerce everything else to string
      return input
        .map((item) =>
          typeof item === "object" && item !== null
            ? item
            : String(item ?? "").trim(),
        )
        .filter((item) => (typeof item === "object" ? true : item.length > 0));
    }

    const text = String(input ?? "").trim();
    if (!text) return [];

    // Try parsing as JSON — supports arrays of objects or arrays of strings.
    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item) =>
              (typeof item === "object" && item !== null) ||
              (typeof item === "string" && item.trim().length > 0),
          );
        }
      } catch (_err) {
        // Fall through to newline parsing.
      }
    }

    // Default: one POI entry per line.
    return text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Parse a plain JSON object into POI actor data.
   *
   * @param {object} obj    The object to parse
   * @param {number} index  Index in the original array (for logging)
   * @returns {{ name: string, system: object, img: string|undefined }|null}
   */
  static _parseObject(obj, index) {
    if (typeof obj !== "object" || !obj) {
      console.warn(
        `${MODULE_ID} | POI Importer: Entry ${index} is not a valid object, skipping.`,
      );
      return null;
    }

    const name = obj.name ? String(obj.name).trim() : null;
    if (!name) {
      console.warn(
        `${MODULE_ID} | POI Importer: Entry ${index} has no "name" key, skipping.`,
      );
      ui.notifications.warn(
        game.i18n.format("STA_TC.Poi.Importer.NoName", { index: index + 1 }),
      );
      return null;
    }

    const system = {};

    if (obj.type) {
      const normalized = this._normalizeType(String(obj.type));
      if (normalized) {
        system.poiType = normalized;
      } else {
        console.warn(
          `${MODULE_ID} | POI Importer: Entry ${index} has invalid type "${obj.type}", using default.`,
        );
      }
    }

    const rawPower = obj.power ? String(obj.power).toLowerCase() : null;
    if (rawPower) {
      if (VALID_POWERS.has(rawPower)) {
        system.power = rawPower;
      } else {
        console.warn(
          `${MODULE_ID} | POI Importer: Entry ${index} has invalid power "${rawPower}", using default.`,
        );
      }
    }

    if (obj.difficulty != null) {
      const num = Number(obj.difficulty);
      if (Number.isInteger(num) && num >= 1 && num <= 5) {
        system.difficulty = num;
      } else {
        console.warn(
          `${MODULE_ID} | POI Importer: Entry ${index} has invalid difficulty "${obj.difficulty}", using default.`,
        );
      }
    }

    const rawPower2 = obj.power2 ? String(obj.power2).toLowerCase() : null;
    if (rawPower2) {
      if (VALID_POWERS.has(rawPower2)) {
        system.power2 = rawPower2;
      } else {
        console.warn(
          `${MODULE_ID} | POI Importer: Entry ${index} has invalid power2 "${rawPower2}", using default.`,
        );
      }
    }

    if (obj.difficulty2 != null) {
      const num = Number(obj.difficulty2);
      if (Number.isInteger(num) && num >= 1 && num <= 5) {
        system.difficulty2 = num;
      } else {
        console.warn(
          `${MODULE_ID} | POI Importer: Entry ${index} has invalid difficulty2 "${obj.difficulty2}", using default.`,
        );
      }
    }

    if (obj.urgency != null) {
      const num = Number(obj.urgency);
      if (Number.isInteger(num) && num >= 1 && num <= 5) {
        system.urgency = num;
      } else {
        console.warn(
          `${MODULE_ID} | POI Importer: Entry ${index} has invalid urgency "${obj.urgency}", using default.`,
        );
      }
    }

    const rawDesc = obj.description ?? obj.desc;
    if (rawDesc) system.description = String(rawDesc);

    if (obj.note) system.note = String(obj.note);

    const poiType = system.poiType ?? "unknown";
    let displayName = name;
    if (poiType === "unknown") {
      system.realName = name;
      displayName = game.i18n.localize("STA_TC.Poi.UnknownDefaultName");
    }

    return {
      name: displayName,
      system,
      img: obj.img ? String(obj.img) : undefined,
    };
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

    // Parse key:value pairs by splitting only on ", key:" boundaries so that
    // commas inside values (e.g. in desc or note text) are preserved.
    const KNOWN_KEYS =
      "name|type|power|difficulty|diff|power2|difficulty2|diff2|urgency|description|desc|note|img";
    const FIELD_SPLIT_RE = new RegExp(
      `,\\s*(?=${KNOWN_KEYS})(?=[a-z0-9]+\\s*:)`,
    );
    const pairs = {};
    for (const segment of str.split(FIELD_SPLIT_RE)) {
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
