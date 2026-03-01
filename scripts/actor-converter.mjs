/**
 * Actor Converter for STA Tactical Campaign
 *
 * Converts STA system actors (characters and starships/smallcraft)
 * into Tactical Campaign Asset actors using the power formulas from
 * the Federation-Klingon War Tactical Campaign rules.
 *
 * CHARACTER powers:
 *   MEDICAL:   Insight   + Medicine,  focus = Medicine
 *   MILITARY:  Daring    + Security,  focus = Security
 *   PERSONAL:  Control   + Security,  focus = Security
 *   SCIENCE:   Reason    + Science,   focus = Science
 *   SOCIAL:    Presence  + Command,   focus = Command
 *
 * SHIP powers (starship / smallcraft):
 *   MEDICAL:   Computers      + Medicine,  focus = Medicine
 *   MILITARY:  Weapons        + Security,  focus = Security
 *   PERSONAL:  Engines        + Conn,      focus = Conn
 *   SCIENCE:   Sensors        + Science,   focus = Science
 *   SOCIAL:    Communications + Command,   focus = Command
 */

const MODULE_ID = "sta-tactical-campaign";

const POWER_KEYS = ["medical", "military", "personal", "science", "social"];

/**
 * Maps STA character attributes+disciplines to asset powers.
 * Each entry: [attributeKey, disciplineKey]
 */
const CHARACTER_FORMULAS = {
  medical: { attr: "insight", disc: "medicine" },
  military: { attr: "daring", disc: "security" },
  personal: { attr: "control", disc: "security" },
  science: { attr: "reason", disc: "science" },
  social: { attr: "presence", disc: "command" },
};

/**
 * Maps STA starship/smallcraft systems+departments to asset powers.
 * Each entry: [systemKey, departmentKey]
 */
const SHIP_FORMULAS = {
  medical: { sys: "computers", dept: "medicine" },
  military: { sys: "weapons", dept: "security" },
  personal: { sys: "engines", dept: "conn" },
  science: { sys: "sensors", dept: "science" },
  social: { sys: "communications", dept: "command" },
};

/**
 * Maps each discipline/department to eligible primary power(s).
 * Used by the "highest discipline" mode to determine which power
 * the top discipline corresponds to.
 *
 * Characters: medicine→medical, security→military|personal, conn→military,
 *             science→science, command→social
 * Ships use departments with the same mapping.
 * Engineering has no direct mapping – if it is the highest, the next
 * highest discipline is checked instead.
 */
const DISC_TO_POWERS = {
  medicine: ["medical"],
  security: ["military", "personal"],
  conn: ["military"],
  science: ["science"],
  command: ["social"],
};

// ============================================================================
// ActorConverter
// ============================================================================

export class ActorConverter {
  /**
   * Main entry point. Prompts the user to pick an STA actor and converts it
   * into a new Tactical Campaign Asset.
   *
   * @returns {Promise<Actor|null>} The newly created asset Actor, or null.
   */
  static async convert() {
    // Step 1 – Pick source actor
    const source = await this._pickSourceActor();
    if (!source) return null;

    // Step 2 – Determine conversion type
    const conversionType = this._getConversionType(source);
    if (!conversionType) {
      ui.notifications.warn(
        game.i18n.format("STA_TC.Converter.UnsupportedType", {
          type: source.type,
        }),
      );
      return null;
    }

    // Step 3 – Calculate powers
    const powers =
      conversionType === "character"
        ? this._calcCharacterPowers(source)
        : this._calcShipPowers(source);

    // Step 4 – Choose primary power based on setting
    const primaryPower = await this._choosePrimaryPower(
      source,
      conversionType,
      powers,
    );
    if (!primaryPower) return null; // user cancelled choice dialog

    // Step 5 – Create the asset actor
    const assetType = conversionType === "character" ? "character" : "ship";
    const assetData = {
      name: source.name,
      type: `${MODULE_ID}.asset`,
      img: source.img,
      system: {
        assetType,
        selectedPower: primaryPower,
        primaryPower,
        description: this._buildDescription(source, conversionType),
        powers,
      },
    };

    const asset = await Actor.create(assetData);

    // Step 6 – Notify + chat message
    ui.notifications.info(
      game.i18n.format("STA_TC.Converter.Created", {
        name: asset.name,
        type: game.i18n.localize(
          `STA_TC.AssetTypes.${assetType.charAt(0).toUpperCase() + assetType.slice(1)}`,
        ),
      }),
    );

    await this._postChatCard(source, asset, conversionType, primaryPower);

    return asset;
  }

  // --------------------------------------------------------------------------
  // Actor selection
  // --------------------------------------------------------------------------

  /**
   * Show a dialog letting the user pick from eligible STA actors.
   * If a single token is selected on the canvas, use its actor directly.
   * @returns {Promise<Actor|null>}
   */
  static async _pickSourceActor() {
    // If a token is selected, use it directly
    const controlled = canvas.tokens?.controlled ?? [];
    if (controlled.length === 1) {
      const actor = controlled[0].actor;
      if (actor && this._getConversionType(actor)) return actor;
    }

    // Build a list of eligible actors
    const eligible = game.actors.filter((a) => this._getConversionType(a));
    if (!eligible.length) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Converter.NoEligibleActors"),
      );
      return null;
    }

    // Group by type for display
    const characters = eligible.filter(
      (a) => this._getConversionType(a) === "character",
    );
    const ships = eligible.filter((a) => this._getConversionType(a) === "ship");

    let options = "";
    if (characters.length) {
      options += `<optgroup label="${game.i18n.localize("STA_TC.Converter.GroupCharacters")}">`;
      for (const a of characters) {
        options += `<option value="${a.id}">${a.name}</option>`;
      }
      options += "</optgroup>";
    }
    if (ships.length) {
      options += `<optgroup label="${game.i18n.localize("STA_TC.Converter.GroupShips")}">`;
      for (const a of ships) {
        options += `<option value="${a.id}">${a.name}</option>`;
      }
      options += "</optgroup>";
    }

    const content = `
      <div class="form-group">
        <label>${game.i18n.localize("STA_TC.Converter.SelectActor")}</label>
        <select id="converter-actor-select" style="width:100%;">${options}</select>
      </div>`;

    const actorId = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize("STA_TC.Converter.Title"),
        icon: "fa-solid fa-exchange-alt",
      },
      content,
      buttons: [
        {
          action: "convert",
          icon: "fa-solid fa-check",
          label: game.i18n.localize("STA_TC.Converter.Convert"),
          default: true,
          callback: (event, button, dialog) => {
            return dialog.element.querySelector("#converter-actor-select")
              .value;
          },
        },
        {
          action: "cancel",
          icon: "fa-solid fa-xmark",
          label: game.i18n.localize("STA_TC.Cancel"),
        },
      ],
      rejectClose: false,
    });

    if (!actorId || actorId === "cancel") return null;
    return game.actors.get(actorId) ?? null;
  }

  // --------------------------------------------------------------------------
  // Type detection
  // --------------------------------------------------------------------------

  /**
   * Determine whether an actor can be converted and what category it falls into.
   * @param {Actor} actor
   * @returns {"character"|"ship"|null}
   */
  static _getConversionType(actor) {
    const type = actor.type;
    if (type === "character") return "character";
    if (type === "starship" || type === "smallcraft") return "ship";
    return null;
  }

  // --------------------------------------------------------------------------
  // Power calculations
  // --------------------------------------------------------------------------

  /**
   * Calculate asset powers from a character actor.
   * @param {Actor} actor  A character-type STA actor
   * @returns {object}     Powers object matching the AssetData schema
   */
  static _calcCharacterPowers(actor) {
    const attrs = actor.system.attributes;
    const discs = actor.system.disciplines;
    const powers = {};

    for (const [powerKey, formula] of Object.entries(CHARACTER_FORMULAS)) {
      const attrVal = attrs[formula.attr]?.value ?? 0;
      const discVal = discs[formula.disc]?.value ?? 0;
      powers[powerKey] = {
        value: attrVal + discVal,
        focus: discVal,
      };
    }

    return powers;
  }

  /**
   * Calculate asset powers from a starship or smallcraft actor.
   * @param {Actor} actor  A starship/smallcraft-type STA actor
   * @returns {object}     Powers object matching the AssetData schema
   */
  static _calcShipPowers(actor) {
    const systems = actor.system.systems;
    const depts = actor.system.departments;
    const powers = {};

    for (const [powerKey, formula] of Object.entries(SHIP_FORMULAS)) {
      const sysVal = systems[formula.sys]?.value ?? 0;
      const deptVal = depts[formula.dept]?.value ?? 0;
      powers[powerKey] = {
        value: sysVal + deptVal,
        focus: deptVal,
      };
    }

    return powers;
  }

  // --------------------------------------------------------------------------
  // Primary power selection
  // --------------------------------------------------------------------------

  /**
   * Choose a primary power based on the world setting.
   * @param {Actor} source          The source STA actor
   * @param {"character"|"ship"} conversionType
   * @param {object} powers         The computed powers object
   * @returns {Promise<string|null>} A power key, or null if cancelled
   */
  static async _choosePrimaryPower(source, conversionType, powers) {
    const mode = game.settings.get(MODULE_ID, "primaryPowerMode");

    switch (mode) {
      case "highest":
        return this._choosePrimaryByHighest(source, conversionType, powers);
      case "choice":
        return this._choosePrimaryByUser(source);
      case "random":
      default:
        return POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)];
    }
  }

  /**
   * Pick the primary power based on the highest discipline/department value.
   * Disciplines are sorted by value descending. Starting from the highest,
   * each is checked for a mapping in DISC_TO_POWERS. Disciplines without a
   * mapping (e.g. engineering) are skipped and the next highest is tried.
   * If the mapped discipline yields multiple candidate powers, the one
   * with the highest computed power value wins. Ties broken randomly.
   * @param {Actor} source
   * @param {"character"|"ship"} conversionType
   * @param {object} powers
   * @returns {string}
   */
  static _choosePrimaryByHighest(source, conversionType, powers) {
    // Get discipline/department values
    const scores =
      conversionType === "character"
        ? source.system.disciplines
        : source.system.departments;

    // Sort disciplines by value descending
    const sorted = Object.entries(scores)
      .map(([key, data]) => ({ key, value: data.value ?? 0 }))
      .sort((a, b) => b.value - a.value);

    // Walk down the sorted list, grouping ties, until we find a mapped set
    let i = 0;
    while (i < sorted.length) {
      const currentVal = sorted[i].value;

      // Collect all disciplines tied at this value
      const tied = [];
      while (i < sorted.length && sorted[i].value === currentVal) {
        tied.push(sorted[i].key);
        i++;
      }

      // Collect eligible power keys from these disciplines
      const candidatePowers = new Set();
      for (const disc of tied) {
        const mapped = DISC_TO_POWERS[disc];
        if (mapped) {
          for (const p of mapped) candidatePowers.add(p);
        }
      }

      // If we found at least one mapped power, pick the best
      if (candidatePowers.size) {
        const candidates = [...candidatePowers];
        let bestVal = -1;
        let bestPowers = [];
        for (const key of candidates) {
          const v = powers[key]?.value ?? 0;
          if (v > bestVal) {
            bestVal = v;
            bestPowers = [key];
          } else if (v === bestVal) {
            bestPowers.push(key);
          }
        }
        return bestPowers[Math.floor(Math.random() * bestPowers.length)];
      }

      // No mapping at this tier – continue to the next lower value
    }

    // Fallback: no discipline had a mapping (shouldn’t happen in practice)
    return POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)];
  }

  /**
   * Show a dialog letting the user choose the primary power, displaying
   * the actor's traits and focuses to inform the decision.
   * @param {Actor} source
   * @returns {Promise<string|null>} The chosen power key, or null if cancelled
   */
  static async _choosePrimaryByUser(source) {
    // Gather traits (item type "trait") and focuses (item type "focus")
    const traits = source.items
      .filter((i) => i.type === "trait")
      .map((i) => i.name);
    const focuses = source.items
      .filter((i) => i.type === "focus")
      .map((i) => i.name);

    // Also include the traits text field if present
    const traitText = source.system.traits ?? "";
    if (traitText && !traits.length) {
      traits.push(
        ...traitText
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      );
    }

    // Build info display
    let infoHtml = "";
    if (traits.length) {
      infoHtml += `<p style="margin:4px 0;"><strong>${game.i18n.localize("STA_TC.Converter.Traits")}:</strong> ${traits.join(", ")}</p>`;
    }
    if (focuses.length) {
      infoHtml += `<p style="margin:4px 0;"><strong>${game.i18n.localize("STA_TC.Converter.Focuses")}:</strong> ${focuses.join(", ")}</p>`;
    }
    if (!infoHtml) {
      infoHtml = `<p style="margin:4px 0; color:#888; font-style:italic;">${game.i18n.localize("STA_TC.Converter.NoTraitsOrFocuses")}</p>`;
    }

    // Build power radio buttons
    const powerOptions = POWER_KEYS.map((key, i) => {
      const label = game.i18n.localize(
        `STA_TC.Powers.${key.charAt(0).toUpperCase() + key.slice(1)}`,
      );
      const checked = i === 0 ? "checked" : "";
      return `<label style="display:block; margin:2px 0; cursor:pointer;">
        <input type="radio" name="primaryPower" value="${key}" ${checked}> ${label}
      </label>`;
    }).join("");

    const content = `
      <div style="margin-bottom:8px;">
        <h4 style="margin:0 0 4px 0;">${source.name}</h4>
        ${infoHtml}
      </div>
      <hr>
      <div class="form-group">
        <label><strong>${game.i18n.localize("STA_TC.Converter.ChoosePrimary")}</strong></label>
        ${powerOptions}
      </div>`;

    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.format("STA_TC.Converter.ChoosePrimaryTitle", {
          name: source.name,
        }),
        icon: "fa-solid fa-star",
      },
      content,
      buttons: [
        {
          action: "confirm",
          icon: "fa-solid fa-check",
          label: game.i18n.localize("STA_TC.Converter.Confirm"),
          default: true,
          callback: (event, button, dialog) => {
            const selected = dialog.element.querySelector(
              'input[name="primaryPower"]:checked',
            );
            return selected?.value ?? POWER_KEYS[0];
          },
        },
        {
          action: "cancel",
          icon: "fa-solid fa-xmark",
          label: game.i18n.localize("STA_TC.Cancel"),
        },
      ],
      rejectClose: false,
    });

    if (!result || result === "cancel") return null;
    return result;
  }

  // --------------------------------------------------------------------------
  // Description builder
  // --------------------------------------------------------------------------

  /**
   * Build an HTML description noting the source actor.
   * @param {Actor} source
   * @param {"character"|"ship"} conversionType
   * @returns {string}
   */
  static _buildDescription(source, conversionType) {
    const typeLabel =
      conversionType === "character"
        ? game.i18n.localize("STA_TC.Converter.SourceCharacter")
        : game.i18n.localize("STA_TC.Converter.SourceShip");
    return `<p>${game.i18n.format("STA_TC.Converter.ConvertedFrom", {
      name: source.name,
      type: typeLabel,
    })}</p>`;
  }

  // --------------------------------------------------------------------------
  // Chat card
  // --------------------------------------------------------------------------

  /**
   * Post a chat message summarising the conversion.
   * @param {Actor} source         The original STA actor
   * @param {Actor} asset          The newly created asset
   * @param {"character"|"ship"} conversionType
   * @param {string} primaryPower  The randomly chosen primary power key
   */
  static async _postChatCard(source, asset, conversionType, primaryPower) {
    const icon = conversionType === "character" ? "👤" : "🚀";
    const color = conversionType === "character" ? "#4a90d9" : "#e67e22";
    const typeLabel =
      conversionType === "character"
        ? game.i18n.localize("STA_TC.AssetTypes.Character")
        : game.i18n.localize("STA_TC.AssetTypes.Ship");

    const primaryLabel = game.i18n.localize(
      `STA_TC.Powers.${primaryPower.charAt(0).toUpperCase() + primaryPower.slice(1)}`,
    );

    // Build power summary lines
    const powers = asset.system.powers;
    const powerLines = POWER_KEYS.map((key) => {
      const p = powers[key];
      const label = game.i18n.localize(
        `STA_TC.Powers.${key.charAt(0).toUpperCase() + key.slice(1)}`,
      );
      const isPrimary = key === primaryPower;
      const star = isPrimary ? " ★" : "";
      return `<span style="color:${isPrimary ? "#ffd700" : "#ccc"};">${label}: ${p.value}/${p.focus}${star}</span>`;
    }).join(" &nbsp;|&nbsp; ");

    const html = `
      <div class="asset-converter-result" style="background:#222; border-radius:8px; overflow:hidden;">
        <div style="background:${color}; padding:10px; text-align:center;">
          <span style="font-size:24px;">${icon}</span>
          <h3 style="margin:5px 0 0 0; color:white;">
            ${game.i18n.localize("STA_TC.Converter.ChatTitle")}
          </h3>
        </div>
        <div style="padding:10px; color:#eee;">
          <div style="background:#333; padding:8px; border-radius:4px;">
            <p style="margin:0; font-size:11px; color:#888;">
              ${game.i18n.localize("STA_TC.Converter.Source")}: ${source.name} (${typeLabel})
            </p>
            <p style="margin:5px 0 0 0; font-size:14px; font-weight:bold; color:#fff;">
              @UUID[${asset.uuid}]{${asset.name}}
            </p>
            <p style="margin:5px 0 0 0; font-size:12px;">${powerLines}</p>
            <p style="margin:5px 0 0 0; font-size:11px; color:#aaa;">
              ${game.i18n.localize("STA_TC.Powers.Primary")}: <strong style="color:#ffd700;">${primaryLabel}</strong>
            </p>
          </div>
        </div>
      </div>`;

    await ChatMessage.create({
      content: html,
      speaker: {
        alias: game.i18n.localize("STA_TC.Converter.SpeakerAlias"),
      },
    });
  }

  // --------------------------------------------------------------------------
  // Batch folder conversion
  // --------------------------------------------------------------------------

  /**
   * Convert all eligible actors in a chosen folder into assets in a new folder.
   * Prompts the user to select a source folder, then creates a destination
   * folder and converts every eligible actor inside.
   *
   * @returns {Promise<Actor[]>} Array of newly created asset Actors.
   */
  static async convertFolder() {
    // Collect all actor folders that contain at least one eligible actor
    const eligibleFolders = game.folders
      .filter((f) => f.type === "Actor")
      .filter((f) => {
        return game.actors.some(
          (a) => a.folder?.id === f.id && this._getConversionType(a),
        );
      });

    if (!eligibleFolders.length) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Converter.NoEligibleFolders"),
      );
      return [];
    }

    // Build folder select options
    const options = eligibleFolders
      .map((f) => {
        const count = game.actors.filter(
          (a) => a.folder?.id === f.id && this._getConversionType(a),
        ).length;
        return `<option value="${f.id}">${f.name} (${count})</option>`;
      })
      .join("");

    const content = `
      <div class="form-group">
        <label>${game.i18n.localize("STA_TC.Converter.SelectFolder")}</label>
        <select id="converter-folder-select" style="width:100%;">${options}</select>
      </div>`;

    const folderId = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize("STA_TC.Converter.FolderTitle"),
        icon: "fa-solid fa-folder-open",
      },
      content,
      buttons: [
        {
          action: "convert",
          icon: "fa-solid fa-check",
          label: game.i18n.localize("STA_TC.Converter.Convert"),
          default: true,
          callback: (event, button, dialog) => {
            return dialog.element.querySelector("#converter-folder-select")
              .value;
          },
        },
        {
          action: "cancel",
          icon: "fa-solid fa-xmark",
          label: game.i18n.localize("STA_TC.Cancel"),
        },
      ],
      rejectClose: false,
    });

    if (!folderId || folderId === "cancel") return [];

    const sourceFolder = game.folders.get(folderId);
    if (!sourceFolder) return [];

    // Gather eligible actors from the source folder
    const actors = game.actors.filter(
      (a) => a.folder?.id === folderId && this._getConversionType(a),
    );

    if (!actors.length) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Converter.NoEligibleActors"),
      );
      return [];
    }

    // Create destination folder
    const destName = game.i18n.format("STA_TC.Converter.DestFolderName", {
      name: sourceFolder.name,
    });
    const destFolder = await Folder.create({
      name: destName,
      type: "Actor",
      parent: sourceFolder.folder?.id ?? null,
    });

    // Convert each actor
    const results = [];
    for (const source of actors) {
      const conversionType = this._getConversionType(source);
      const powers =
        conversionType === "character"
          ? this._calcCharacterPowers(source)
          : this._calcShipPowers(source);

      const primaryPower = await this._choosePrimaryPower(
        source,
        conversionType,
        powers,
      );
      if (!primaryPower) continue; // user cancelled – skip this actor
      const assetType = conversionType === "character" ? "character" : "ship";

      const assetData = {
        name: source.name,
        type: `${MODULE_ID}.asset`,
        img: source.img,
        folder: destFolder.id,
        system: {
          assetType,
          selectedPower: primaryPower,
          primaryPower,
          description: this._buildDescription(source, conversionType),
          powers,
        },
      };

      const asset = await Actor.create(assetData);
      results.push(asset);
    }

    // Post summary chat card
    await this._postFolderChatCard(sourceFolder, destFolder, results);

    ui.notifications.info(
      game.i18n.format("STA_TC.Converter.FolderComplete", {
        count: results.length,
        folder: destFolder.name,
      }),
    );

    return results;
  }

  /**
   * Post a summary chat message for a folder batch conversion.
   * @param {Folder} sourceFolder
   * @param {Folder} destFolder
   * @param {Actor[]} assets
   */
  static async _postFolderChatCard(sourceFolder, destFolder, assets) {
    const assetLines = assets
      .map((a) => {
        const sys = a.system;
        const typeIcon = sys.assetType === "character" ? "👤" : "🚀";
        const primaryKey = sys.primaryPower;
        const primaryLabel = game.i18n.localize(
          `STA_TC.Powers.${primaryKey.charAt(0).toUpperCase() + primaryKey.slice(1)}`,
        );
        return `<li>${typeIcon} @UUID[${a.uuid}]{${a.name}} — ${game.i18n.localize("STA_TC.Powers.Primary")}: <strong style="color:#ffd700;">${primaryLabel}</strong></li>`;
      })
      .join("");

    const html = `
      <div class="asset-converter-result" style="background:#222; border-radius:8px; overflow:hidden;">
        <div style="background:#2e8b57; padding:10px; text-align:center;">
          <span style="font-size:24px;">📁</span>
          <h3 style="margin:5px 0 0 0; color:white;">
            ${game.i18n.localize("STA_TC.Converter.FolderChatTitle")}
          </h3>
        </div>
        <div style="padding:10px; color:#eee;">
          <p style="margin:0 0 5px 0; font-size:11px; color:#888;">
            ${game.i18n.localize("STA_TC.Converter.Source")}: ${sourceFolder.name}
            → ${destFolder.name}
          </p>
          <ul style="margin:5px 0; padding-left:20px; font-size:13px;">
            ${assetLines}
          </ul>
          <p style="margin:5px 0 0 0; font-size:11px; color:#aaa;">
            ${game.i18n.format("STA_TC.Converter.FolderComplete", { count: assets.length, folder: destFolder.name })}
          </p>
        </div>
      </div>`;

    await ChatMessage.create({
      content: html,
      speaker: {
        alias: game.i18n.localize("STA_TC.Converter.SpeakerAlias"),
      },
    });
  }
}
