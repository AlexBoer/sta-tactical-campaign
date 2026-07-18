/**
 * Data Models for STA Tactical Campaign
 * Defines the data schemas for Asset and Point of Interest actors
 */

const {
  SchemaField,
  NumberField,
  StringField,
  HTMLField,
  ArrayField,
  BooleanField,
  ObjectField,
} = foundry.data.fields;

/**
 * Schema for a single Power category (e.g., Medical, Military, etc.)
 * Each power has a value (0-20) and a focus (0-5)
 */
function powerField() {
  return new SchemaField({
    value: new NumberField({
      required: false,
      nullable: true,
      integer: true,
      initial: 0,
      min: 0,
      max: 20,
    }),
    focus: new NumberField({
      required: false,
      nullable: true,
      integer: true,
      initial: 0,
      min: 0,
      max: 5,
    }),
  });
}

/**
 * Data model for Asset actors
 * Assets represent resources, personnel, or capabilities available to a faction
 */
export class AssetData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      assetType: new StringField({
        required: false,
        blank: false,
        initial: "character",
        choices: ["character", "ship", "resource"],
      }),
      selectedPower: new StringField({
        required: false,
        blank: false,
        initial: "medical",
        choices: ["medical", "military", "personal", "science", "social"],
      }),
      primaryPower: new StringField({
        required: false,
        blank: true,
        initial: "",
        choices: ["", "medical", "military", "personal", "science", "social"],
      }),
      lost: new BooleanField({
        required: false,
        initial: false,
      }),
      unavailable: new BooleanField({
        required: false,
        initial: false,
      }),
      description: new HTMLField({
        required: false,
        blank: true,
        initial: "",
      }),
      note: new StringField({
        required: false,
        blank: true,
        initial: "",
      }),
      powers: new SchemaField({
        medical: powerField(),
        military: powerField(),
        personal: powerField(),
        science: powerField(),
        social: powerField(),
      }),
    };
  }

  /**
   * Prepare derived data for the Asset
   */
  prepareDerivedData() {
    // Calculate total power across all categories
    const powers = this.powers;
    this.totalPower = Object.values(powers).reduce((sum, p) => {
      return sum + (p.value || 0);
    }, 0);

    this.totalFocus = Object.values(powers).reduce((sum, p) => {
      return sum + (p.focus || 0);
    }, 0);
  }
}

/**
 * Data model for Point of Interest actors
 * Points of Interest represent strategic locations or objectives in the tactical campaign
 */
export class PoiData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      poiType: new StringField({
        required: true,
        initial: "unknown",
        choices: ["tacticalThreat", "exploration", "routine", "unknown"],
      }),
      description: new HTMLField({
        required: false,
        blank: true,
        initial: "",
      }),
      power: new StringField({
        required: true,
        initial: "military",
        choices: ["medical", "military", "personal", "science", "social"],
      }),
      difficulty: new NumberField({
        required: true,
        integer: true,
        initial: 1,
        min: 1,
        max: 5,
      }),
      power2: new StringField({
        required: false,
        blank: true,
        initial: "",
      }),
      difficulty2: new NumberField({
        required: false,
        nullable: true,
        integer: true,
        initial: null,
        min: 1,
        max: 5,
      }),
      urgency: new NumberField({
        required: true,
        integer: true,
        initial: 1,
        min: 1,
        max: 5,
      }),
      eventName: new StringField({
        required: false,
        blank: true,
        initial: "",
      }),
      eventDescription: new HTMLField({
        required: false,
        blank: true,
        initial: "",
      }),
      note: new StringField({
        required: false,
        blank: true,
        initial: "",
      }),
      // Track how many turns this Exploration POI has gone unresolved
      missedCount: new NumberField({
        required: false,
        integer: true,
        initial: 0,
        min: 0,
      }),
      // Unknown POI reveal system
      realName: new StringField({
        required: false,
        blank: true,
        initial: "",
      }),
      revealed: new BooleanField({
        required: false,
        initial: false,
      }),
      // GM-controlled visibility for non-unknown POI types
      hiddenByGM: new BooleanField({
        required: false,
        initial: false,
      }),
    };
  }
}

/**
 * Data model for Event items
 * Events carry Active Effects that can be applied to Points of Interest
 */
export class EventData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new StringField({
        required: false,
        blank: true,
        initial: "",
      }),
      complexEffects: new ArrayField(
        new SchemaField({
          id: new StringField({ required: true, initial: "" }),
          type: new StringField({ required: true, initial: "" }),
          label: new StringField({ required: false, blank: true, initial: "" }),
          params: new StringField({
            required: false,
            blank: true,
            initial: "{}",
          }),
        }),
        { required: false, initial: [] },
      ),
    };
  }
}

/**
 * Data model for Progression items.
 * Tracks campaign story beats with a saved flag and freeform notes.
 */
export class ProgressionData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      /**
       * Top-level category: "progression" (story beat rewards) or
       * "escalation" (escalation outcomes). Determines which roll table pool
       * this item belongs to in the Roll Table Manager.
       */
      progressionCategory: new StringField({
        required: false,
        blank: false,
        initial: "progression",
        choices: ["progression", "escalation"],
      }),
      /**
       * Effect text shown on the Campaign Tracker when this progression
       * result is applied. The item's name serves as the label.
       */
      effect: new StringField({ required: false, blank: true, initial: "" }),
      saved: new BooleanField({ required: false, initial: false }),
      /**
       * Freeform description for additional context. Has no mechanical
       * effect and is not shown on the tracker.
       */
      description: new StringField({
        required: false,
        blank: true,
        initial: "",
      }),
    };
  }
}

/**
 * Schema for a single POI entry in the Campaign Tracker.
 * Each entry references a POI actor (with 2 asset slots) and stores
 * all per-POI campaign-turn resolution data so that wizard state lives
 * in the data model rather than in actor flags.
 */
function poiEntryField() {
  return new SchemaField({
    actorUuid: new StringField({ required: true, initial: "" }),
    asset1Uuid: new StringField({ required: false, blank: true, initial: "" }),
    asset2Uuid: new StringField({ required: false, blank: true, initial: "" }),
    // Per-turn event result
    eventResult: new StringField({ required: false, blank: true, initial: "" }),
    // Per-turn conflict resolution
    conflictResult: new StringField({
      required: false,
      blank: true,
      initial: "",
    }),
    conflictSuccesses: new foundry.data.fields.NumberField({
      required: false,
      integer: true,
      initial: 0,
    }),
    conflictMomentum: new foundry.data.fields.NumberField({
      required: false,
      integer: true,
      initial: 0,
    }),
    conflictHadNat20: new foundry.data.fields.BooleanField({
      required: false,
      initial: false,
    }),
    conflictRolled: new foundry.data.fields.BooleanField({
      required: false,
      initial: false,
    }),
    // Consequence / failure choice made after resolution
    consequenceChosen: new StringField({
      required: false,
      blank: true,
      initial: "",
    }),
    failureChoice: new StringField({
      required: false,
      blank: true,
      initial: "",
    }),
    lossResult: new StringField({ required: false, blank: true, initial: "" }),
    // Phase 3 per-entry outcome state
    escalationRolled: new BooleanField({ required: false, initial: false }),
    commandeeredAssetUuid: new StringField({
      required: false,
      blank: true,
      initial: "",
    }),
    outcomeConfirmed: new BooleanField({ required: false, initial: false }),
    outcomeIgnored: new BooleanField({ required: false, initial: false }),
  });
}

/**
 * Schema for a used roll-table result entry kept on a campaign tracker.
 * Stores enough data to restore the original TableResult to the source table.
 */
function usedResultField() {
  return new SchemaField({
    sourceActorUuid: new StringField({
      required: false,
      blank: true,
      initial: "",
    }),
    resultName: new StringField({ required: false, blank: true, initial: "" }),
    resultImg: new StringField({ required: false, blank: true, initial: "" }),
    tableUuid: new StringField({ required: false, blank: true, initial: "" }),
    subKey: new StringField({ required: false, blank: true, initial: "" }),
    weight: new NumberField({
      required: false,
      integer: true,
      min: 1,
      initial: 1,
    }),
    resultSnapshot: new ObjectField({ required: false, initial: {} }),
    movedAt: new NumberField({
      required: false,
      integer: true,
      nullable: true,
      initial: null,
    }),
    origin: new StringField({
      required: false,
      blank: true,
      initial: "manual",
    }),
  });
}

/**
 * Data model for Campaign Tracker actors
 * Tracks campaign-level stats, assets, and points of interest assignments
 */
export class CampaignTrackerData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      campaignMomentum: new NumberField({
        required: true,
        integer: true,
        initial: 0,
        min: 0,
      }),
      progression: new NumberField({
        required: true,
        integer: true,
        initial: 0,
        min: 0,
      }),
      pace: new NumberField({
        required: true,
        integer: true,
        initial: 5,
        min: 0,
      }),
      prioritySupply: new NumberField({
        required: true,
        integer: true,
        initial: 2,
        min: 0,
      }),
      characterAssets: new ArrayField(new StringField()),
      shipAssets: new ArrayField(new StringField()),
      resourceAssets: new ArrayField(new StringField()),
      poiListThreat: new ArrayField(poiEntryField()),
      poiListExploration: new ArrayField(poiEntryField()),
      poiListRoutine: new ArrayField(poiEntryField()),
      poiListUnknown: new ArrayField(poiEntryField()),
      // Campaign-turn state (replaces actor flags)
      turnPhase: new StringField({ required: false, blank: true, initial: "" }),
      turnUserId: new StringField({
        required: false,
        blank: true,
        initial: "",
      }),
      scenarioPoi: new StringField({
        required: false,
        blank: true,
        initial: "",
      }),
      turnGeneratedPois: new ArrayField(new StringField()),
      turnThreatIncrease: new foundry.data.fields.NumberField({
        required: false,
        integer: true,
        initial: 0,
      }),
      turnExtraPoisNextTurn: new foundry.data.fields.NumberField({
        required: false,
        integer: true,
        initial: 0,
      }),
      // Phase 3 aggregate turn state
      turnRoleplayBonus: new NumberField({
        required: false,
        integer: true,
        initial: 0,
        min: 0,
      }),
      turnMomentumGained: new NumberField({
        required: false,
        integer: true,
        initial: 0,
        min: 0,
      }),
      turnMomentumSpent: new NumberField({
        required: false,
        integer: true,
        initial: 0,
        min: 0,
      }),
      turnReinforcementsReceived: new NumberField({
        required: false,
        integer: true,
        initial: 0,
        min: 0,
      }),
      turnExtraTacticalPoisNextTurn: new NumberField({
        required: false,
        integer: true,
        initial: 0,
        min: 0,
      }),
      turnExtraUnknownPoisNextTurn: new NumberField({
        required: false,
        integer: true,
        initial: 0,
        min: 0,
      }),
      turnStep: new foundry.data.fields.NumberField({
        required: false,
        integer: true,
        initial: 1,
        min: 1,
        max: 4,
      }),
      // Asset UUIDs commandeered this turn — unavailable until next turn start
      commandeeredAssets: new ArrayField(new StringField()),
      // Monotonically-increasing campaign turn counter used for AE expiry
      campaignTurnNumber: new foundry.data.fields.NumberField({
        required: false,
        integer: true,
        initial: 0,
        min: 0,
      }),
      // Campaign turn notes (visible during Phase 3 and after)
      turnNotes: new StringField({ required: false, blank: true, initial: "" }),
      // Pending notes buffer (accumulates during Phase 2, promoted at Phase 3)
      turnPendingNotes: new StringField({
        required: false,
        blank: true,
        initial: "",
      }),
      // Flexible Deployments: when true, resource assets may be assigned to 2 slots
      turnFlexibleDeployments: new BooleanField({
        required: false,
        initial: false,
      }),
      // Supply bonus to apply at the start of the next campaign turn
      nextTurnSupplyBonus: new NumberField({
        required: false,
        integer: true,
        initial: 0,
        min: 0,
      }),
      // Temporary pace modifier that resets at the end of each campaign turn.
      // Use positive values to add extra POI generation pressure for one turn,
      // or negative values to reduce it. Does not affect the base Pace stat.
      paceTempBonus: new NumberField({
        required: false,
        integer: true,
        initial: 0,
      }),
      // Whether progression gain for this turn has been confirmed (applied to system.progression)
      turnProgressionConfirmed: new BooleanField({
        required: false,
        initial: false,
      }),
      // POI table results removed from active pools and kept as follow-up reminders
      usedPoiResults: new ArrayField(usedResultField(), {
        required: false,
        initial: [],
      }),
      // Asset table results removed from active pools (manual-only queue)
      usedAssetResults: new ArrayField(usedResultField(), {
        required: false,
        initial: [],
      }),
      // Progression (Events) table results removed from active pool
      usedProgressionResults: new ArrayField(usedResultField(), {
        required: false,
        initial: [],
      }),
      // Escalation table results removed from active pool
      usedEscalationResults: new ArrayField(usedResultField(), {
        required: false,
        initial: [],
      }),
      // Event table results removed from active pool
      usedEventResults: new ArrayField(usedResultField(), {
        required: false,
        initial: [],
      }),
      // Persistent gameplay automation notification log (Turn Log)
      notificationLog: new ArrayField(
        new SchemaField({
          turn: new NumberField({
            required: false,
            integer: true,
            initial: 0,
            min: 0,
          }),
          ts: new NumberField({
            required: false,
            integer: true,
            initial: 0,
            min: 0,
          }),
          group: new StringField({ required: false, blank: true, initial: "" }),
          event: new StringField({ required: false, blank: true, initial: "" }),
          severity: new StringField({
            required: false,
            blank: true,
            initial: "info",
          }),
          message: new StringField({
            required: false,
            blank: true,
            initial: "",
          }),
          entityUuid: new StringField({
            required: false,
            blank: true,
            initial: "",
          }),
        }),
        { required: false, initial: [] },
      ),
    };
  }
}
