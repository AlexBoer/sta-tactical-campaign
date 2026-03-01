/**
 * Data Models for STA Tactical Campaign
 * Defines the data schemas for Asset and Point of Interest actors
 */

const { SchemaField, NumberField, StringField, HTMLField } =
  foundry.data.fields;

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
      description: new HTMLField({
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
      urgency: new NumberField({
        required: true,
        integer: true,
        initial: 1,
        min: 1,
        max: 5,
      }),
    };
  }
}
