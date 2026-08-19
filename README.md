# STA Tactical Campaign

Tools for running a Star Trek Adventures tactical campaign in Foundry VTT 14.

## Active Effects 2.0

The module uses Foundry V14 Active Effects with changes stored in
`system.changes`. Event Item effects transfer to their owning Point of Interest,
while Lost, Unavailable, and progression effects modify Asset actors directly.

Campaign-turn durations remain separate from Foundry combat durations. They are
stored as an absolute campaign turn in the module's Active Effect flags and are
expired by the Campaign Tracker at turn end.

The active GM automatically runs a one-time migration for deterministic
module-owned effects. Numeric Event effects whose original type cannot be
reconstructed are reported without being changed. To preview the current audit:

```js
await game.modules
  .get("sta-tactical-campaign")
  .api.auditActiveEffects({ apply: false });
```
