/**
 * Asset Generator for STA Tactical Campaign
 *
 * Rolls on configured rollable tables to generate a tactical campaign Asset.
 * Step 1: Roll on the Asset Type table to determine which sub-table to use.
 * Step 2: Roll on the sub-table, which returns the UUID of an asset actor.
 * The resolved actor is posted to chat for easy reference.
 */

const MODULE_ID = "sta-tactical-campaign";

/**
 * Mapping from the main Asset Type table result names (uppercased) to
 * the sub-table setting key suffix.
 */
const TYPE_TO_KEY = {
  CHARACTER: "character",
  SHIP: "ship",
  RESOURCE: "resource",
};

/**
 * Display configuration for each asset category.
 */
const TYPE_CONFIG = {
  character: {
    nameKey: "STA_TC.Asset.Generator.Types.Character",
    icon: "👤",
    color: "#4a90d9",
  },
  ship: {
    nameKey: "STA_TC.Asset.Generator.Types.Ship",
    icon: "🚀",
    color: "#e67e22",
  },
  resource: {
    nameKey: "STA_TC.Asset.Generator.Types.Resource",
    icon: "📦",
    color: "#27ae60",
  },
};

// ============================================================================
// AssetGenerator
// ============================================================================

export class AssetGenerator {
  // --------------------------------------------------------------------------
  // Settings helpers
  // --------------------------------------------------------------------------

  /**
   * Retrieve configured table UUIDs from module settings.
   * @returns {Record<string, string>}
   */
  static getTableSettings() {
    return {
      assetType: game.settings.get(MODULE_ID, "tableAssetType"),
      character: game.settings.get(MODULE_ID, "tableAssetCharacter"),
      ship: game.settings.get(MODULE_ID, "tableAssetShip"),
      resource: game.settings.get(MODULE_ID, "tableAssetResource"),
    };
  }

  // --------------------------------------------------------------------------
  // Table rolling
  // --------------------------------------------------------------------------

  /**
   * Roll on a RollTable identified by UUID.
   * @param {string} uuid  - The table UUID
   * @param {string} label - Human-readable name for notifications
   * @returns {Promise<{roll: number, name: string, documentUuid: string, description: string}|null>}
   */
  static async rollOnTable(uuid, label) {
    if (!uuid) {
      ui.notifications.warn(
        game.i18n.format("STA_TC.Asset.Generator.TableNotConfigured", {
          name: label,
        }),
      );
      return null;
    }

    const table = await fromUuid(uuid);
    if (!table) {
      console.warn(`${MODULE_ID} | Table not found: ${label} (${uuid})`);
      ui.notifications.error(
        game.i18n.format("STA_TC.Asset.Generator.TableNotFound", {
          name: label,
        }),
      );
      return null;
    }

    const roll = await table.roll();
    const result = roll.results[0];
    return {
      roll: roll.roll.total,
      name: result?.name || "No result",
      documentUuid: result?.documentUuid || "",
      description: result?.description || "",
    };
  }

  // --------------------------------------------------------------------------
  // Type matching
  // --------------------------------------------------------------------------

  /**
   * Match a type table result name to a sub-table key by searching for keywords.
   * If the result is conditional (mentions both CHARACTER and SHIP), prompt the
   * GM to choose which sub-table to use.
   * @param {string} typeName - The uppercased result name
   * @returns {Promise<string|null>} The matching sub-table key, or null
   */
  static async _resolveTypeKey(typeName) {
    const hasCharacter = typeName.includes("CHARACTER");
    const hasShip = typeName.includes("SHIP");
    const hasResource = typeName.includes("RESOURCE");

    // Conditional result – mentions multiple asset types
    if (hasCharacter && hasShip) {
      return this._promptConditionalType();
    }

    if (hasCharacter) return "character";
    if (hasShip) return "ship";
    if (hasResource) return "resource";
    return null;
  }

  /**
   * Show a dialog asking the GM how many Character assets they currently have,
   * then return the appropriate sub-table key.
   * @returns {Promise<string|null>} "character" or "ship", or null if cancelled
   */
  static async _promptConditionalType() {
    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize("STA_TC.Asset.Generator.ConditionalTitle"),
      },
      content: `
        <p>${game.i18n.localize("STA_TC.Asset.Generator.ConditionalPrompt")}</p>
        <div style="text-align:center; margin:8px 0;">
          <p style="font-style:italic; font-size:12px; color:#888;">
            ${game.i18n.localize("STA_TC.Asset.Generator.ConditionalHint")}
          </p>
        </div>`,
      buttons: [
        {
          action: "character",
          label: game.i18n.localize("STA_TC.Asset.Generator.Types.Character"),
          icon: "fas fa-user",
        },
        {
          action: "ship",
          label: game.i18n.localize("STA_TC.Asset.Generator.Types.Ship"),
          icon: "fas fa-rocket",
        },
      ],
      close: () => null,
    });
    return result;
  }

  // --------------------------------------------------------------------------
  // Generation
  // --------------------------------------------------------------------------

  /**
   * Generate an Asset by rolling on the configured tables.
   * Posts the result to chat with a link to the resolved actor.
   *
   * @returns {Promise<{typeResult: object, subResult: object, subTableKey: string, actor: Actor|null}|null>}
   */
  static async generate() {
    const tables = this.getTableSettings();

    // Step 1 – Roll on the Asset Type table
    const typeResult = await this.rollOnTable(
      tables.assetType,
      game.i18n.localize("STA_TC.Asset.Generator.TypeTableName"),
    );
    if (!typeResult) {
      ui.notifications.error(
        game.i18n.localize("STA_TC.Asset.Generator.TypeRollFailed"),
      );
      return null;
    }

    // Determine which sub-table to use (keyword match, with GM prompt for conditionals)
    const typeName = typeResult.name.toUpperCase().trim();
    const subTableKey = await this._resolveTypeKey(typeName);

    if (!subTableKey) {
      ui.notifications.warn(
        game.i18n.format("STA_TC.Asset.Generator.UnknownType", {
          type: typeName,
        }),
      );

      await ChatMessage.create({
        content: this._buildFallbackHtml(typeResult),
        speaker: {
          alias: game.i18n.localize("STA_TC.Asset.Generator.SpeakerAlias"),
        },
        whisper: [game.user.id],
      });
      return null;
    }

    // Step 2 – Roll on the sub-table (returns a UUID in the text field)
    const config = TYPE_CONFIG[subTableKey];
    const configName = game.i18n.localize(config.nameKey);
    const subResult = await this.rollOnTable(tables[subTableKey], configName);

    if (!subResult) {
      await ChatMessage.create({
        content: this._buildNoSubTableHtml(typeResult, configName, config),
        speaker: {
          alias: game.i18n.localize("STA_TC.Asset.Generator.SpeakerAlias"),
        },
        whisper: [game.user.id],
      });
      return { typeResult, subResult: null, subTableKey, actor: null };
    }

    // Step 3 – Resolve the actor UUID from the sub-table result
    const actorUuid = subResult.documentUuid?.trim() || "";
    let actor = null;

    if (actorUuid) {
      actor = await fromUuid(actorUuid);
    }

    if (!actor) {
      console.warn(
        `${MODULE_ID} | Could not resolve asset actor from sub-table result. ` +
          `Name: "${subResult.name}", documentUuid: "${actorUuid}"`,
      );
      ui.notifications.warn(
        game.i18n.format("STA_TC.Asset.Generator.ActorNotFound", {
          name: subResult.name,
        }),
      );
    }

    // Step 4 – Post chat message
    const html = this._buildChatHtml(
      typeResult,
      subResult,
      subTableKey,
      config,
      actor,
    );

    await ChatMessage.create({
      content: html,
      speaker: {
        alias: game.i18n.localize("STA_TC.Asset.Generator.SpeakerAlias"),
      },
      whisper: [game.user.id],
    });

    return { typeResult, subResult, subTableKey, actor };
  }

  // --------------------------------------------------------------------------
  // HTML builders
  // --------------------------------------------------------------------------

  /** Fallback message when the type doesn't match any known sub-table. */
  static _buildFallbackHtml(typeResult) {
    return `
      <div class="asset-generator-result" style="background:#333; border-radius:8px; padding:10px; color:#eee;">
        <h3 style="margin:0 0 10px 0; color:#ffd700;">🎲 ${game.i18n.localize("STA_TC.Types.Asset")}</h3>
        <p><strong>${game.i18n.localize("STA_TC.Powers.Type")}:</strong> ${typeResult.name}</p>
        <p style="font-size:11px; color:#888;">(Roll: ${typeResult.roll})</p>
        ${typeResult.text ? `<p style="font-style:italic; margin-top:10px;">${typeResult.text}</p>` : ""}
      </div>`;
  }

  /** Message when the sub-table is not configured. */
  static _buildNoSubTableHtml(typeResult, configName, config) {
    return `
      <div class="asset-generator-result" style="background:#222; border-radius:8px; overflow:hidden;">
        <div style="background:${config.color}; padding:10px; text-align:center;">
          <span style="font-size:24px;">${config.icon}</span>
          <h3 style="margin:5px 0 0 0; color:white;">${configName}</h3>
          <span style="font-size:11px; color:rgba(255,255,255,0.7);">
            ${game.i18n.localize("STA_TC.Asset.Generator.TypeRoll")}: ${typeResult.roll}
          </span>
        </div>
        <div style="padding:10px; color:#eee;">
          <p style="color:#ff6666; font-style:italic;">
            ${game.i18n.format("STA_TC.Asset.Generator.SubTableNotConfigured", { type: configName })}
          </p>
        </div>
      </div>`;
  }

  /** Main chat card showing the resolved asset actor. */
  static _buildChatHtml(typeResult, subResult, subTableKey, config, actor) {
    const configName = game.i18n.localize(config.nameKey);

    let html = `
      <div class="asset-generator-result" style="background:#222; border-radius:8px; overflow:hidden;">
        <div style="background:${config.color}; padding:10px; text-align:center;">
          <span style="font-size:24px;">${config.icon}</span>
          <h3 style="margin:5px 0 0 0; color:white;">${configName}</h3>
          <span style="font-size:11px; color:rgba(255,255,255,0.7);">
            ${game.i18n.localize("STA_TC.Asset.Generator.TypeRoll")}: ${typeResult.roll}
          </span>
        </div>
        <div style="padding:10px; color:#eee;">`;

    if (actor) {
      // Build a summary of the actor's powers
      const powers = actor.system?.powers ?? {};
      const powerLines = Object.entries(powers)
        .filter(([, p]) => p.value > 0)
        .map(([key, p]) => {
          const label = game.i18n.localize(
            `STA_TC.Powers.${key.charAt(0).toUpperCase() + key.slice(1)}`,
          );
          return `<span style="color:#ffd700;">${label}: ${p.value}/${p.focus}</span>`;
        })
        .join(" &nbsp;|&nbsp; ");

      const description = actor.system?.description || "";

      html += `
        <div style="background:#333; padding:8px; border-radius:4px; margin-top:5px;">
          <p style="margin:0; font-size:14px; font-weight:bold; color:#fff;">
            @UUID[${actor.uuid}]{${actor.name}}
          </p>
          ${powerLines ? `<p style="margin:5px 0 0 0; font-size:12px;">${powerLines}</p>` : ""}
          ${description ? `<div style="margin:5px 0 0 0; font-size:11px; color:#ccc;">${description}</div>` : ""}
          <p style="margin:5px 0 0 0; font-size:10px; color:#666;">
            ${game.i18n.localize("STA_TC.Asset.Generator.SubTableRoll")}: ${subResult.roll}
          </p>
        </div>`;
    } else {
      // Actor could not be resolved – show what we have
      html += `
        <div style="background:#333; padding:8px; border-radius:4px; margin-top:5px;">
          <p style="margin:0; font-size:13px; color:#eee;">${subResult.name}</p>
          <p style="margin:5px 0 0 0; font-size:11px; color:#ff6666; font-style:italic;">
            ${game.i18n.localize("STA_TC.Asset.Generator.ActorNotResolved")}
          </p>
          <p style="margin:5px 0 0 0; font-size:10px; color:#666;">
            ${game.i18n.localize("STA_TC.Asset.Generator.SubTableRoll")}: ${subResult.roll}
          </p>
        </div>`;
    }

    html += `
        </div>
      </div>`;
    return html;
  }
}
