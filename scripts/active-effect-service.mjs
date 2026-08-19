import { buildAeChange } from "./utils.mjs";

const MODULE_ID = "sta-tactical-campaign";
const TRACKER_TYPE = `${MODULE_ID}.campaignTracker`;

const STATUS_CONFIG = {
  lost: {
    field: "system.lost",
    id: "sta-tc.lost",
    img: "icons/svg/skull.svg",
  },
  unavailable: {
    field: "system.unavailable",
    id: "sta-tc.unavailable",
    img: "icons/svg/sleep.svg",
  },
};

export async function getCampaignTracker() {
  const configuredUuid = game.settings.get(MODULE_ID, "worldCampaignTracker");
  const configured = configuredUuid ? await fromUuid(configuredUuid) : null;
  if (configured?.type === TRACKER_TYPE) return configured;

  const trackers = game.actors.filter((actor) => actor.type === TRACKER_TYPE);
  return trackers.length === 1 ? trackers[0] : null;
}

export async function getCurrentCampaignTurn() {
  const tracker = await getCampaignTracker();
  return tracker?.system?.campaignTurnNumber ?? 0;
}

export function getCampaignExpiry(effect) {
  return effect.flags?.[MODULE_ID]?.expireAfterTurn ?? null;
}

export async function getRemainingCampaignTurns(effect) {
  const expiry = getCampaignExpiry(effect);
  if (expiry == null) return null;
  return Math.max(0, expiry - (await getCurrentCampaignTurn()));
}

export async function expireCampaignTurnEffects(tracker) {
  const currentTurn = tracker.system.campaignTurnNumber ?? 0;
  const assetUuids = new Set([
    ...(tracker.system.characterAssets || []),
    ...(tracker.system.shipAssets || []),
    ...(tracker.system.resourceAssets || []),
  ]);
  const expired = [];

  for (const uuid of assetUuids) {
    const actor = await fromUuid(uuid);
    if (!actor) continue;
    const effects = actor.effects.filter((effect) => {
      const expiry = getCampaignExpiry(effect);
      return expiry != null && currentTurn >= expiry;
    });
    if (!effects.length) continue;

    await actor.deleteEmbeddedDocuments(
      "ActiveEffect",
      effects.map((effect) => effect.id),
    );
    expired.push(...effects.map((effect) => ({ actor, effect })));
  }

  return expired;
}

export async function replaceAssetStatusEffect(
  actor,
  status,
  { name, expireAfterTurn = null } = {},
) {
  const config = STATUS_CONFIG[status];
  if (!config) throw new Error(`Unsupported asset status: ${status}`);

  const existing = actor.effects.find(
    (effect) => effect.flags?.[MODULE_ID]?.[status],
  );
  if (existing) await existing.delete();

  const moduleFlags = { [status]: true };
  if (expireAfterTurn != null) moduleFlags.expireAfterTurn = expireAfterTurn;

  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name:
        name ||
        game.i18n.localize(
          `STA_TC.Status.${status === "lost" ? "Lost" : "Unavailable"}`,
        ),
      img: config.img,
      disabled: false,
      transfer: false,
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      statuses: [config.id],
      system: {
        changes: [buildAeChange(config.field, "upgrade", true)],
      },
      flags: { [MODULE_ID]: moduleFlags },
    },
  ]);
  return effect;
}
