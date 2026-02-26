# STA Tactical Campaign Module - AI Agent Guide

## Overview

This Foundry VTT v13 module extends the **Star Trek Adventures (STA)** game system with support for **Tactical Campaign** rules from the _Federation-Klingon War_ sourcebook. It adds two new Actor types for managing strategic-level gameplay alongside traditional character adventures.

### Purpose

In the Federation-Klingon War supplement, players engage in a meta-game layer where they deploy **Assets** (personnel, resources, capabilities) to resolve **Points of Interest** (strategic objectives, crises, missions). This module provides dedicated actor sheets to track these elements.

---

## Actor Types

### Asset (`sta-tactical-campaign.asset`)

Represents deployable resources, personnel, or capabilities belonging to a faction.

**Data Fields:**

- `description` (HTML) - Narrative description of the asset
- `powers` (Object) - Five power categories, each with:
  - `value` (Integer, 0-20, nullable) - The power rating
  - `focus` (Integer, 0-5, nullable) - Specialization bonus

Power categories:

- `medical` - Medical/humanitarian capabilities
- `military` - Combat/tactical capabilities
- `personal` - Individual skills/personnel
- `science` - Research/technical capabilities
- `social` - Diplomatic/political capabilities

### Point of Interest (`sta-tactical-campaign.poi`)

Represents a strategic location, mission, or objective requiring attention.

**Data Fields:**

- `description` (HTML) - What this POI represents
- `power` (String) - Which power category applies: `medical`, `military`, `personal`, `science`, or `social`
- `difficulty` (Integer, 1-5) - How hard to resolve
- `urgency` (Integer, 1-5) - How quickly it needs attention

---

## Architecture

### Technology Stack

- **Foundry VTT v13** - Target platform
- **STA System v2.4+** - Required dependency
- **ApplicationV2** - Modern Foundry application framework
- **TypeDataModel** - Foundry's data validation/schema system
- **Handlebars** - Template engine for sheets

### Design Patterns

This module follows patterns established by the STA core system:

1. **TypeDataModel** for data schemas (`data-models.js`)
   - Extends `foundry.abstract.TypeDataModel`
   - Uses `defineSchema()` with Foundry data fields
   - Implements `prepareDerivedData()` for computed values

2. **ApplicationV2 Sheets** (`sheets/*.mjs`)
   - Extends `HandlebarsApplicationMixin(ActorSheetV2)`
   - Uses `static DEFAULT_OPTIONS` for configuration
   - Uses `static PARTS` for template registration
   - Implements `_prepareContext()` for template data

3. **Registration Pattern** (`module.js`)
   - Data models registered to `CONFIG.Actor.dataModels`
   - Sheets registered via `DocumentSheetConfig.registerSheet()`
   - World settings registered via `game.settings.register()` in `settings.js`
   - Public API exposed on `game.modules.get(MODULE_ID).api` during ready hook

4. **POI Generator** (`poi-generator.mjs`)
   - Static class with `generate()`, `rollOnTable()`, `parsePowerAndDifficultyOptions()`
   - Registers `renderChatMessage` hook for chat drag support
   - Registers `dropCanvasData` hook for canvas token creation

---

## File Structure

```
sta-tactical-campaign/
├── module.json              # Module manifest
├── AGENT_GUIDE.md           # This file
├── scripts/
│   ├── module.js            # Entry point, hooks, registration, API exposure
│   ├── data-models.js       # AssetData, PoiData TypeDataModels
│   ├── settings.js          # World settings registration (table & actor UUIDs)
│   ├── poi-generator.mjs    # POI generator (table rolls, chat cards, drag-to-canvas)
│   └── sheets/
│       ├── asset-sheet.mjs  # Asset actor sheet class
│       └── poi-sheet.mjs    # POI actor sheet class
├── templates/
│   ├── asset-sheet.hbs      # Asset Handlebars template
│   └── poi-sheet.hbs        # POI Handlebars template
├── styles/
│   └── styles.css           # Sheet styling
└── lang/
    └── en.json              # English localization
```

---

## Common Tasks

### Adding a New Field to an Actor Type

1. **Update the schema** in `scripts/data-models.js`:

   ```javascript
   // In defineSchema()
   newField: new StringField({ initial: "default" });
   ```

2. **Add to template context** in the sheet class `_prepareContext()`:

   ```javascript
   return {
     ...context,
     newField: system.newField,
   };
   ```

3. **Add to template** (`.hbs` file):

   ```handlebars
   <input name="system.newField" value="{{system.newField}}" />
   ```

4. **Add localization** in `lang/en.json`:
   ```json
   "NewField": "New Field Label"
   ```

### Adding Sheet Actions

In the sheet class:

```javascript
static DEFAULT_OPTIONS = {
  actions: {
    myAction: AssetSheet._onMyAction
  }
};

static async _onMyAction(event, target) {
  // Handle action
}
```

In the template:

```handlebars
<button type="button" data-action="myAction">Click Me</button>
```

### Creating Derived/Computed Data

In the TypeDataModel's `prepareDerivedData()`:

```javascript
prepareDerivedData() {
  this.computedValue = this.field1 + this.field2;
}
```

### Adding a New Actor Type

1. Add to `module.json` documentTypes
2. Create TypeDataModel class in `data-models.js`
3. Create sheet class in `scripts/sheets/`
4. Create template in `templates/`
5. Register model and sheet in `module.js`
6. Add localization strings

---

## Integration with STA System

### System Dependency

The module declares STA as a required system in `module.json`:

```json
"relationships": {
  "systems": [{
    "id": "sta",
    "type": "system",
    "compatibility": { "minimum": "2.4.0" }
  }]
}
```

### Actor Type Naming

Module-defined actor types are automatically prefixed with the module ID:

- `asset` → `sta-tactical-campaign.asset`
- `poi` → `sta-tactical-campaign.poi`

This appears in:

- `CONFIG.Actor.dataModels["sta-tactical-campaign.asset"]`
- Actor creation dialog type dropdown
- `actor.type` property

### Accessing STA Functionality

The STA system exposes its API at `game.sta`. Common uses:

```javascript
// Access STA configuration
const staConfig = CONFIG.sta;
```

### Using STA's Dice Rolling API (v2.5.0+)

As of STA v2.5.0, the rolling API changed from individual parameters to a data object pattern.

**Task Rolls:**

```javascript
const roller = new STARoll();

// Using custom flavor text (recommended for module extensions)
const taskData = {
  speakerName: actor.name, // Display name for chat
  selectedAttributeValue: 8, // First half of target number
  selectedDisciplineValue: 3, // Second half (also used for focus threshold)
  rolltype: "custom", // Use 'custom' for custom flavor text
  flavor: "My Custom Roll", // Custom header text in chat card
  dicePool: 2, // Number of d20s
  usingFocus: true, // Double successes on 1s or <= discipline
  usingDedicatedFocus: false, // Double successes on <= 2x discipline
  usingDetermination: false, // Add automatic 1 (2 successes)
  complicationRange: 1, // 20 only = 1, 19-20 = 2, etc.
};

await roller.rollTask(taskData);
```

**Available rolltypes:**

- `custom` - Use the `flavor` property for custom header text
- `character2e` / `character1e` - Localizes attribute/discipline names
- `starship` - Localizes system/department names
- `sidebar` - Generic "Task Roll" label

**Scene Complication Range:**

The system can calculate complication range from scene traits:

```javascript
const calculatedRange = await roller._sceneComplications();
```

**Challenge Rolls (d6 damage/effect dice):**

```javascript
const roller = new STARoll();
const challengeData = {
  speakerName: actor.name,
  dicePool: 3, // Number of challenge dice
  challengeName: "Phaser Damage", // Description for chat
};

await roller.performChallengeRoll(challengeData);
```

---

## Localization

All user-visible strings should use localization keys from `lang/en.json`.

**In JavaScript:**

```javascript
game.i18n.localize("STA_TC.Powers.Medical");
```

**In Handlebars:**

```handlebars
{{localize "STA_TC.Powers.Medical"}}
```

**Naming Convention:**

- `TYPES.Actor.sta-tactical-campaign.*` - Actor type labels (required by Foundry)
- `STA_TC.*` - All other module strings

---

## Debugging

### Console Logging

The module logs initialization status:

```
sta-tactical-campaign | Initializing STA Tactical Campaign module
sta-tactical-campaign | Initialization complete
sta-tactical-campaign | Module ready
```

### Verifying Registration

In browser console:

```javascript
// Check data models
CONFIG.Actor.dataModels["sta-tactical-campaign.asset"];
CONFIG.Actor.dataModels["sta-tactical-campaign.poi"];

// Check registered types
game.actors.documentTypes;

// Create test actor
Actor.create({ name: "Test Asset", type: "sta-tactical-campaign.asset" });
```

---

## POI Generator

### Overview

The module includes a Point of Interest generator that rolls on configurable rollable tables, posts formatted results to chat, and supports drag-to-canvas token creation.

### World Settings

All table and template actor UUIDs are configured via **Module Settings** (Configure Settings → Module Settings → STA Tactical Campaign):

**Table UUIDs** (right-click a table → Copy UUID):

- `tablePoiType` – Main table that determines the POI category
- `tableTacticalThreat` – Sub-table for Tactical Threat results
- `tableExploration` – Sub-table for Exploration results
- `tableRoutine` – Sub-table for Routine results
- `tableUnknown` – Sub-table for Unknown results

**Template Actor UUIDs** (right-click an actor → Copy UUID):

- `templateActorTacticalThreat` – Template POI actor for Tactical Threat tokens
- `templateActorExploration` – Template POI actor for Exploration tokens
- `templateActorRoutine` – Template POI actor for Routine tokens
- `templateActorUnknown` – Template POI actor for Unknown tokens

Template actors should be `sta-tactical-campaign.poi` type actors with desired token settings (image, size, etc.). Generated tokens are unlinked and inherit prototype token visuals.

### Public API

The module exposes an API at `game.modules.get("sta-tactical-campaign").api`:

```javascript
// Generate a POI (rolls tables, posts chat card)
await game.modules.get("sta-tactical-campaign").api.generatePoi();

// Direct access to the PoiGenerator class
const { PoiGenerator } = game.modules.get("sta-tactical-campaign").api;

// Roll on a specific table by UUID
const result = await PoiGenerator.rollOnTable(uuid, "Table Name");

// Parse power/difficulty from text
const { options, urgency } = PoiGenerator.parsePowerAndDifficultyOptions(text);

// Read current settings
const tables = PoiGenerator.getTableSettings();
const actors = PoiGenerator.getTemplateActorSettings();
```

### Generation Flow

1. Roll on the main POI Type table → result name (e.g. "TACTICAL THREAT")
2. Map the result name (uppercased) to a sub-table key via `TYPE_TO_KEY`
3. Roll on the matching sub-table → description, power/difficulty text
4. Parse power types, difficulties, and urgency from the sub-table result text
5. Build a chat card with coloured header, description, and drag-to-canvas buttons
6. When dragged to canvas, create an unlinked token from the template actor with rolled stats in `delta.system`

### Type Mapping

The main table result name (uppercased) must match one of:

- `"TACTICAL THREAT"` → `tacticalThreat`
- `"EXPLORATION"` → `exploration`
- `"ROUTINE"` → `routine`
- `"UNKNOWN"` → `unknown`

---

## Future Enhancements

Potential areas for expansion:

1. **Journaling Integration** - Link POIs/Assets to Journal entries
2. **Automated Resolution** - Dice rolling to resolve POIs with Assets
3. **Campaign Tracker** - Sidebar app showing active POIs and deployed Assets
4. **Timeline System** - Track turn-based strategic phases
5. **Faction Support** - Multiple factions with their own Asset pools
6. **Import/Export** - Bulk management of tactical campaign data

---

## Version History

- **1.0.1** - Updated roll API for STA v2.5.0 compatibility (rollTask with custom flavor support)
- **1.0.0** - Initial release with Asset and POI actor types
