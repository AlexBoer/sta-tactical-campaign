/**
 * Notification configuration for STA Tactical Campaign tracker automations.
 *
 * Each event id maps to:
 *   group      — timing window (turnStart | interaction | stepTransition | turnEnd | betweenTurn)
 *   severity   — info | warn | critical
 *   placements — ordered array of  toast | chat | badge | log
 *
 * Edit these entries at any time to change where and how notifications appear.
 * No code changes required — the notifier reads this config at runtime.
 */

export const SEVERITY = {
  INFO: "info",
  WARN: "warn",
  CRITICAL: "critical",
};

export const GROUP = {
  TURN_START: "turnStart",
  INTERACTION: "interaction",
  STEP_TRANSITION: "stepTransition",
  TURN_END: "turnEnd",
  BETWEEN_TURN: "betweenTurn",
};

export const PLACEMENT = {
  TOAST: "toast",
  CHAT: "chat",
  BADGE: "badge",
  LOG: "log",
};

export const NOTIFICATION_CONFIG = {
  // ----- G1: Turn Start -----

  supplyBonusApplied: {
    group: GROUP.TURN_START,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.TOAST, PLACEMENT.LOG],
  },

  // ----- G2: During active interactions -----

  batchPoisGenerated: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.CHAT],
  },
  eventRolled: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.TOAST, PLACEMENT.BADGE, PLACEMENT.LOG],
  },
  eventReset: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.TOAST, PLACEMENT.LOG],
  },
  conflictFinalized: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.TOAST, PLACEMENT.BADGE, PLACEMENT.LOG],
  },
  consequenceExtraPoi: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.WARN,
    placements: [PLACEMENT.TOAST, PLACEMENT.BADGE, PLACEMENT.LOG],
  },
  consequenceThreatIncrease: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.WARN,
    placements: [PLACEMENT.TOAST, PLACEMENT.BADGE, PLACEMENT.LOG],
  },
  consequenceRollLoss: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.CRITICAL,
    placements: [PLACEMENT.CHAT, PLACEMENT.BADGE, PLACEMENT.LOG],
  },
  phase3Intensify: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.WARN,
    placements: [PLACEMENT.TOAST, PLACEMENT.BADGE, PLACEMENT.LOG],
  },
  phase3Catastrophe: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.WARN,
    placements: [PLACEMENT.TOAST, PLACEMENT.LOG],
  },
  phase3DiffIncrease: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.WARN,
    placements: [PLACEMENT.TOAST, PLACEMENT.BADGE, PLACEMENT.LOG],
  },
  phase3ExplorationRemove: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.TOAST, PLACEMENT.LOG],
  },
  phase3ExtraPoi: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.TOAST, PLACEMENT.LOG],
  },
  phase3Commandeer: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.WARN,
    placements: [PLACEMENT.TOAST, PLACEMENT.BADGE, PLACEMENT.LOG],
  },
  phase3Ignore: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.TOAST, PLACEMENT.LOG],
  },
  progressionConfirmed: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.TOAST, PLACEMENT.LOG],
  },
  progressionRolled: {
    group: GROUP.INTERACTION,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.CHAT, PLACEMENT.LOG],
  },

  // ----- G3: Step / Phase boundary transitions -----

  carryOverConsumed: {
    group: GROUP.STEP_TRANSITION,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.TOAST, PLACEMENT.LOG],
  },

  // ----- G4: Turn End -----
  // The main chat card is handled by the existing consolidated message in _onEndTurn.
  // These events only write to the persistent log so the Turn Log has full detail.

  turnEndEventUnavailable: {
    group: GROUP.TURN_END,
    severity: SEVERITY.WARN,
    placements: [PLACEMENT.LOG],
  },
  turnEndResolved: {
    group: GROUP.TURN_END,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.LOG],
  },
  turnEndThreatIntensify: {
    group: GROUP.TURN_END,
    severity: SEVERITY.WARN,
    placements: [PLACEMENT.LOG],
  },
  turnEndThreatCatastrophe: {
    group: GROUP.TURN_END,
    severity: SEVERITY.WARN,
    placements: [PLACEMENT.LOG],
  },
  turnEndRoutineCommandeer: {
    group: GROUP.TURN_END,
    severity: SEVERITY.WARN,
    placements: [PLACEMENT.LOG],
  },
  turnEndRoutineDiscard: {
    group: GROUP.TURN_END,
    severity: SEVERITY.WARN,
    placements: [PLACEMENT.LOG],
  },
  turnEndExplorationDiff: {
    group: GROUP.TURN_END,
    severity: SEVERITY.WARN,
    placements: [PLACEMENT.LOG],
  },
  turnEndExplorationRemove: {
    group: GROUP.TURN_END,
    severity: SEVERITY.WARN,
    placements: [PLACEMENT.LOG],
  },
  turnEndUnknownRemoved: {
    group: GROUP.TURN_END,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.LOG],
  },
  turnEndProgressionCommit: {
    group: GROUP.TURN_END,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.LOG],
  },
  turnEndAeExpired: {
    group: GROUP.TURN_END,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.LOG],
  },

  // ----- G5: Between turns -----

  aeExpired: {
    group: GROUP.BETWEEN_TURN,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.TOAST, PLACEMENT.BADGE, PLACEMENT.LOG],
  },
  carryOverActivated: {
    group: GROUP.BETWEEN_TURN,
    severity: SEVERITY.INFO,
    placements: [PLACEMENT.LOG],
  },
};

/**
 * Fallback used when an event id is not found in NOTIFICATION_CONFIG.
 */
export const DEFAULT_CONFIG_ENTRY = {
  group: GROUP.INTERACTION,
  severity: SEVERITY.INFO,
  placements: [PLACEMENT.LOG],
};
