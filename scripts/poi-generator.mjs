/**
 * Point of Interest Generator for STA Tactical Campaign
 *
 * Rolls on configured rollable tables to generate a Point of Interest.
 * Step 1: Roll on the POI Type table to determine the category.
 * Step 2: Roll on the sub-table, which returns the UUID of a POI actor.
 * The resolved actor is posted to chat with a drag-to-canvas token.
 */

const MODULE_ID = "sta-tactical-campaign";

/**
 * Mapping from the main POI Type table result names (uppercased) to
 * the sub-table setting key suffix.
 */
const TYPE_TO_KEY = {
  "TACTICAL THREAT": "tacticalThreat",
  EXPLORATION: "exploration",
  ROUTINE: "routine",
  UNKNOWN: "unknown",
};

/**
 * Display configuration for each POI category.
 */
const TYPE_CONFIG = {
  tacticalThreat: {
    nameKey: "STA_TC.Poi.Generator.Types.TacticalThreat",
    icon: "⚔️",
    color: "#8b0000",
  },
  exploration: {
    nameKey: "STA_TC.Poi.Generator.Types.Exploration",
    icon: "🔭",
    color: "#1e90ff",
  },
  routine: {
    nameKey: "STA_TC.Poi.Generator.Types.Routine",
    icon: "📋",
    color: "#2e8b57",
  },
  unknown: {
    nameKey: "STA_TC.Poi.Generator.Types.Unknown",
    icon: "❓",
    color: "#4b0082",
  },
};

// ============================================================================
// PoiGenerator
// ============================================================================

export class PoiGenerator {
  // --------------------------------------------------------------------------
  // Settings helpers
  // --------------------------------------------------------------------------

  /**
   * Retrieve configured table UUIDs from module settings.
   * @returns {Record<string, string>}
   */
  static getTableSettings() {
    return {
      pointOfInterestType: game.settings.get(MODULE_ID, "tablePoiType"),
      tacticalThreat: game.settings.get(MODULE_ID, "tableTacticalThreat"),
      exploration: game.settings.get(MODULE_ID, "tableExploration"),
      routine: game.settings.get(MODULE_ID, "tableRoutine"),
      unknown: game.settings.get(MODULE_ID, "tableUnknown"),
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
        game.i18n.format("STA_TC.Poi.Generator.TableNotConfigured", {
          name: label,
        }),
      );
      return null;
    }

    const table = await fromUuid(uuid);
    if (!table) {
      console.warn(`${MODULE_ID} | Table not found: ${label} (${uuid})`);
      ui.notifications.error(
        game.i18n.format("STA_TC.Poi.Generator.TableNotFound", {
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
   * The result name may contain extra text like "2 Tactical Threats" etc.
   * @param {string} typeName - The uppercased result name
   * @returns {string|null} The matching sub-table key, or null
   */
  static _matchTypeKey(typeName) {
    if (typeName.includes("TACTICAL") || typeName.includes("THREAT"))
      return "tacticalThreat";
    if (typeName.includes("EXPLORATION")) return "exploration";
    if (typeName.includes("ROUTINE")) return "routine";
    if (typeName.includes("UNKNOWN")) return "unknown";
    return null;
  }

  // --------------------------------------------------------------------------
  // Generation
  // --------------------------------------------------------------------------

  /**
   * Generate a Point of Interest by rolling on the configured tables.
   * The sub-table result text is expected to contain the UUID of a POI actor.
   * Posts the resolved actor to chat with a drag-to-canvas token.
   *
   * @returns {Promise<{typeResult: object, subResult: object, subTableKey: string, actor: Actor|null}|null>}
   */
  static async generate() {
    const tables = this.getTableSettings();

    // Step 1 – Roll on the main Point of Interest Type table
    const typeResult = await this.rollOnTable(
      tables.pointOfInterestType,
      game.i18n.localize("STA_TC.Poi.Generator.TypeTableName"),
    );
    if (!typeResult) {
      ui.notifications.error(
        game.i18n.localize("STA_TC.Poi.Generator.TypeRollFailed"),
      );
      return null;
    }

    // Determine which sub-table to use (keyword match within the result name)
    const typeName = typeResult.name.toUpperCase().trim();
    const subTableKey = this._matchTypeKey(typeName);

    if (!subTableKey) {
      // Unknown type – show what was rolled anyway
      ui.notifications.warn(
        game.i18n.format("STA_TC.Poi.Generator.UnknownType", {
          type: typeName,
        }),
      );

      await ChatMessage.create({
        content: this._buildFallbackHtml(typeResult),
        speaker: {
          alias: game.i18n.localize("STA_TC.Poi.Generator.SpeakerAlias"),
        },
        whisper: [game.user.id],
      });
      return null;
    }

    // Step 2 – Roll on the appropriate sub-table (returns a UUID in the text field)
    const config = TYPE_CONFIG[subTableKey];
    const configName = game.i18n.localize(config.nameKey);
    const subResult = await this.rollOnTable(tables[subTableKey], configName);

    if (!subResult) {
      await ChatMessage.create({
        content: this._buildNoSubTableHtml(typeResult, configName, config),
        speaker: {
          alias: game.i18n.localize("STA_TC.Poi.Generator.SpeakerAlias"),
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
        `${MODULE_ID} | Could not resolve POI actor from sub-table result. ` +
          `Name: "${subResult.name}", documentUuid: "${actorUuid}"`,
      );
      ui.notifications.warn(
        game.i18n.format("STA_TC.Poi.Generator.ActorNotFound", {
          name: subResult.name,
        }),
      );
    }

    // Step 4 – Build and send chat message
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
        alias: game.i18n.localize("STA_TC.Poi.Generator.SpeakerAlias"),
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
      <div class="poi-generator-result" style="background:#333; border-radius:8px; padding:10px; color:#eee;">
        <h3 style="margin:0 0 10px 0; color:#ffd700;">📍 ${game.i18n.localize("STA_TC.Types.PointOfInterest")}</h3>
        <p><strong>${game.i18n.localize("STA_TC.Powers.Type")}:</strong> ${typeResult.name}</p>
        <p style="font-size:11px; color:#888;">(Roll: ${typeResult.roll})</p>
        ${typeResult.text ? `<p style="font-style:italic; margin-top:10px;">${typeResult.text}</p>` : ""}
      </div>`;
  }

  /** Message when the sub-table is not configured. */
  static _buildNoSubTableHtml(typeResult, configName, config) {
    return `
      <div class="poi-generator-result" style="background:#222; border-radius:8px; overflow:hidden;">
        <div style="background:${config.color}; padding:10px; text-align:center;">
          <span style="font-size:24px;">${config.icon}</span>
          <h3 style="margin:5px 0 0 0; color:white;">${configName}</h3>
          <span style="font-size:11px; color:rgba(255,255,255,0.7);">
            ${game.i18n.localize("STA_TC.Poi.Generator.TypeRoll")}: ${typeResult.roll}
          </span>
        </div>
        <div style="padding:10px; color:#eee;">
          <p style="color:#ff6666; font-style:italic;">
            ${game.i18n.format("STA_TC.Poi.Generator.SubTableNotConfigured", { type: configName })}
          </p>
        </div>
      </div>`;
  }

  /** Main chat card showing the resolved POI actor with a drag-to-canvas token. */
  static _buildChatHtml(typeResult, subResult, subTableKey, config, actor) {
    const configName = game.i18n.localize(config.nameKey);

    let html = `
      <div class="poi-generator-result" style="background:#222; border-radius:8px; overflow:hidden;">
        <div style="background:${config.color}; padding:10px; text-align:center;">
          <span style="font-size:24px;">${config.icon}</span>
          <h3 style="margin:5px 0 0 0; color:white;">${configName}</h3>
          <span style="font-size:11px; color:rgba(255,255,255,0.7);">
            ${game.i18n.localize("STA_TC.Poi.Generator.TypeRoll")}: ${typeResult.roll}
          </span>
        </div>
        <div style="padding:10px; color:#eee;">`;

    if (actor) {
      const system = actor.system ?? {};
      const powerKey = system.power ?? "military";
      const powerLabel = game.i18n.localize(
        `STA_TC.Powers.${powerKey.charAt(0).toUpperCase() + powerKey.slice(1)}`,
      );
      const difficulty = system.difficulty ?? 1;
      const urgency = system.urgency ?? 1;

      const statsLine = [
        `<span style="color:#ffd700;">${powerLabel} ${difficulty}</span>`,
        `<span style="color:#ff8c00;">${game.i18n.localize("STA_TC.Poi.Urgency")}: ${urgency}</span>`,
      ].join(" &nbsp;|&nbsp; ");

      html += `
        <div style="background:#333; padding:8px; border-radius:4px; margin-top:5px;">
          <p style="margin:5px 0 0 0; font-size:12px;">${statsLine}</p>
          <p style="margin:5px 0 0 0; font-size:10px; color:#666;">
            ${game.i18n.localize("STA_TC.Poi.Generator.SubTableRoll")}: ${subResult.roll}
          </p>
          <div class="poi-buttons-container" style="margin-top:8px; padding-top:8px; border-top:1px solid #555;">
            <div class="poi-drag-token" draggable="true"
              data-actor-uuid="${_escapeAttr(actor.uuid)}"
              data-poi-type="${_escapeAttr(subTableKey)}"
              style="display:inline-block; margin:2px; padding:6px 10px; background:#555;
                     border-radius:4px; cursor:grab; border:1px solid #777;">
              <i class="fas fa-crosshairs" style="margin-right:4px;"></i>${actor.name}
              <span style="font-size:10px; color:#aaa; display:block;">
                ${game.i18n.localize("STA_TC.Poi.Generator.DragToCanvas")}
              </span>
            </div>
          </div>
        </div>`;
    } else {
      // Actor could not be resolved – show what we have
      html += `
        <div style="background:#333; padding:8px; border-radius:4px; margin-top:5px;">
          <p style="margin:0; font-size:13px; color:#eee;">${subResult.name}</p>
          <p style="margin:5px 0 0 0; font-size:11px; color:#ff6666; font-style:italic;">
            ${game.i18n.localize("STA_TC.Poi.Generator.ActorNotResolved")}
          </p>
          <p style="margin:5px 0 0 0; font-size:10px; color:#666;">
            ${game.i18n.localize("STA_TC.Poi.Generator.SubTableRoll")}: ${subResult.roll}
          </p>
        </div>`;
    }

    html += `
        </div>
      </div>`;
    return html;
  }

  // --------------------------------------------------------------------------
  // Hook registration
  // --------------------------------------------------------------------------

  /**
   * Register all Hooks required for drag-to-canvas support.
   * Should be called once during module initialisation.
   */
  static registerHooks() {
    // Attach dragstart listeners to POI token elements inside chat messages
    Hooks.on("renderChatMessageHTML", (_message, html) => {
      const element = html;
      const tokens = element.querySelectorAll(".poi-drag-token");
      for (const token of tokens) {
        token.addEventListener("dragstart", (event) => {
          const el = event.currentTarget;
          const dragData = {
            type: "POIToken",
            actorUuid: el.dataset.actorUuid,
            poiType: el.dataset.poiType,
          };
          event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        });
      }
    });

    // Handle POIToken drops on the canvas
    Hooks.on("dropCanvasData", async (canvas, data) => {
      if (data.type !== "POIToken") return;
      return PoiGenerator._handleCanvasDrop(canvas, data);
    });
  }

  // --------------------------------------------------------------------------
  // Canvas drop handler
  // --------------------------------------------------------------------------

  /**
   * Create an unlinked POI token on the canvas from drag data.
   * @param {Canvas} canvas - The active canvas
   * @param {object} data   - The drag payload
   * @returns {Promise<false>} Always returns false to suppress default handling
   */
  static async _handleCanvasDrop(canvas, data) {
    const actorUuid = data.actorUuid;
    if (!actorUuid) {
      ui.notifications.warn(
        game.i18n.localize("STA_TC.Poi.Generator.ActorNotResolved"),
      );
      return false;
    }

    const sourceActor = await fromUuid(actorUuid);
    if (!sourceActor) {
      ui.notifications.error(
        game.i18n.format("STA_TC.Poi.Generator.ActorNotFound", {
          name: actorUuid,
        }),
      );
      return false;
    }

    // If the actor is from a compendium, import it into the world first
    let actor = sourceActor;
    if (sourceActor.pack) {
      try {
        actor = await Actor.implementation.create(sourceActor.toObject());
        console.log(
          `${MODULE_ID} | Imported compendium actor "${actor.name}" to world (${actor.id})`,
        );
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to import actor:`, error);
        ui.notifications.error(
          game.i18n.format("STA_TC.Poi.Generator.TokenFailed", {
            error: error.message,
          }),
        );
        return false;
      }
    }

    // Build token creation data from the actor's prototype token
    const tokenData = foundry.utils.deepClone(actor.prototypeToken);
    const tokenCreateData = tokenData.toObject
      ? tokenData.toObject()
      : tokenData;

    // Centre token on cursor position
    const { x, y } = data;
    const gridSize = canvas.grid.size;
    const tokenWidth = (tokenCreateData.width || 0.5) * gridSize;
    const tokenHeight = (tokenCreateData.height || 0.5) * gridSize;
    tokenCreateData.x = x - tokenWidth / 2;
    tokenCreateData.y = y - tokenHeight / 2;

    // Create as unlinked token
    tokenCreateData.actorLink = false;
    tokenCreateData.actorId = actor.id;

    try {
      const [token] = await canvas.scene.createEmbeddedDocuments("Token", [
        tokenCreateData,
      ]);
      if (token) {
        ui.notifications.info(
          game.i18n.format("STA_TC.Poi.Generator.TokenPlaced", {
            name: actor.name,
          }),
        );
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to create POI token:`, error);
      ui.notifications.error(
        game.i18n.format("STA_TC.Poi.Generator.TokenFailed", {
          error: error.message,
        }),
      );
    }

    return false;
  }
}

// ============================================================================
// Private helpers
// ============================================================================

/** Escape a string for safe use inside an HTML attribute. */
function _escapeAttr(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
