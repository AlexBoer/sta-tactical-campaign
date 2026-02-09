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

---

## File Structure

```
sta-tactical-campaign/
├── module.json              # Module manifest
├── AGENT_GUIDE.md           # This file
├── scripts/
│   ├── module.js            # Entry point, hooks, registration
│   ├── data-models.js       # AssetData, PoiData TypeDataModels
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

// Use STA dice rolling (if needed)
game.sta.roll(...);
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

- **1.0.0** - Initial release with Asset and POI actor types
