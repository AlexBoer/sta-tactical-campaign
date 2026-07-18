/**
 * TrackerNotifier — dispatch point for gameplay-facing automation notifications.
 *
 * Call emit() to surface a notification. The notifier reads NOTIFICATION_CONFIG
 * to determine severity and placement channels, then applies the world verbosity
 * setting to filter toasts.
 *
 * Batch mode (beginBatch / flushBatch) accumulates log entries and writes them in
 * one tracker update — use this for the turn-end sweep to avoid sequential writes.
 */

import {
  NOTIFICATION_CONFIG,
  DEFAULT_CONFIG_ENTRY,
  SEVERITY,
  PLACEMENT,
} from "./notification-config.mjs";

const MODULE_ID = "sta-tactical-campaign";

class _TrackerNotifier {
  constructor() {
    /** @type {boolean} */
    this._batchActive = false;
    /** @type {object[]} */
    this._batchLogEntries = [];
    /** @type {Actor|null} */
    this._batchTracker = null;
    /** @type {number} */
    this._batchTurn = 0;
  }

  // ---------------------------------------------------------------------------
  // Verbosity helpers
  // ---------------------------------------------------------------------------

  _getVerbosity() {
    try {
      return (
        game.settings.get(MODULE_ID, "automationNotifications") ?? "important"
      );
    } catch {
      return "important";
    }
  }

  /**
   * Return true if a toast should fire given severity and current verbosity.
   * @param {string} severity
   * @param {string} verbosity
   */
  _shouldToast(severity, verbosity) {
    if (verbosity === "off" || verbosity === "chatOnly") return false;
    if (verbosity === "important") {
      return severity === SEVERITY.WARN || severity === SEVERITY.CRITICAL;
    }
    return true; // "all"
  }

  _toastFn(severity) {
    if (severity === SEVERITY.CRITICAL)
      return ui.notifications.error.bind(ui.notifications);
    if (severity === SEVERITY.WARN)
      return ui.notifications.warn.bind(ui.notifications);
    return ui.notifications.info.bind(ui.notifications);
  }

  // ---------------------------------------------------------------------------
  // Batch support
  // ---------------------------------------------------------------------------

  /**
   * Begin a batch window. Log writes are deferred until flushBatch().
   * Toasts are suppressed for INFO/WARN during a batch; CRITICAL still fires immediately.
   * @param {Actor} tracker
   */
  beginBatch(tracker) {
    this._batchActive = true;
    this._batchLogEntries = [];
    this._batchTracker = tracker;
    this._batchTurn = tracker.system?.campaignTurnNumber ?? 0;
  }

  /**
   * Flush all accumulated batch log entries in a single tracker update.
   */
  async flushBatch() {
    if (!this._batchActive) return;
    const entries = this._batchLogEntries;
    const tracker = this._batchTracker;
    this._batchActive = false;
    this._batchLogEntries = [];
    this._batchTracker = null;
    this._batchTurn = 0;

    if (tracker && entries.length) {
      const current = foundry.utils.deepClone(
        tracker.system?.notificationLog ?? [],
      );
      await tracker.update({
        "system.notificationLog": [...current, ...entries],
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Emit
  // ---------------------------------------------------------------------------

  /**
   * Emit a notification event.
   *
   * @param {object} opts
   * @param {Actor}  opts.tracker     — the campaign tracker actor
   * @param {string} opts.event       — event id (key in NOTIFICATION_CONFIG)
   * @param {string} opts.message     — human-readable message
   * @param {string} [opts.entityUuid] — UUID of affected POI / asset (for badges)
   * @param {object} [opts.data]      — optional extra data (not persisted to schema)
   */
  async emit({ tracker, event, message, entityUuid = "", data = {} }) {
    const config = NOTIFICATION_CONFIG[event] ?? DEFAULT_CONFIG_ENTRY;
    const { severity, placements, group } = config;
    const verbosity = this._getVerbosity();

    if (verbosity === "off") return;

    // ---- Toast ----
    if (placements.includes(PLACEMENT.TOAST)) {
      const doToast = this._batchActive
        ? severity === SEVERITY.CRITICAL // only critical fires during a batch
        : this._shouldToast(severity, verbosity);
      if (doToast) {
        this._toastFn(severity)(message);
      }
    }

    // ---- Chat (individual, GM-whispered) ----
    // Skipped in batch mode — turn-end has its own consolidated chat card.
    if (placements.includes(PLACEMENT.CHAT) && !this._batchActive) {
      await ChatMessage.create({
        content: `<p>${message}</p>`,
        speaker: { alias: game.i18n.localize("STA_TC.Wizard.SpeakerAlias") },
        whisper: game.users.contents.filter((u) => u.isGM).map((u) => u.id),
      });
    }

    // ---- Log ----
    if (placements.includes(PLACEMENT.LOG)) {
      const effectiveTracker = tracker ?? this._batchTracker;
      const logEntry = {
        turn: this._batchActive
          ? this._batchTurn
          : (effectiveTracker?.system?.campaignTurnNumber ?? 0),
        ts: Date.now(),
        group,
        event,
        severity,
        message,
        entityUuid,
      };

      if (this._batchActive) {
        this._batchLogEntries.push(logEntry);
      } else if (effectiveTracker) {
        const current = foundry.utils.deepClone(
          effectiveTracker.system?.notificationLog ?? [],
        );
        await effectiveTracker.update({
          "system.notificationLog": [...current, logEntry],
        });
      }
    }
  }
}

export const TrackerNotifier = new _TrackerNotifier();
