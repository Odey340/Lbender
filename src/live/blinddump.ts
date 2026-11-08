// Endgame blind dump: Damo's one change from K-13.
//
// Damo, like K-13, holds tiles for 7+ letter words (3x) and cashes most of
// them in at the final auction: in simulation against a strong field about
// a quarter of its score is played in that last 1-second window, and about
// a third in the last 4-8 auctions (scripts/measure-endgame.ts). Words can
// only be played while the match is running, so if the subscription feed
// stalls near the end, everything still in hand is lost. That has happened
// live (watchdog.ts: "scored 0 with 10 tiles in hand"), and the watchdog
// only reconnects after 6 s of silence, which is too late in the last ~7
// auctions.
//
// The fix: during a running match an auction opens or closes every auction
// length (1 s), so a silence of 2 auctions is already abnormal. If the feed
// has been silent that long and the bag is (by estimate) down to 8 tiles or fewer, play
// the best partition of the tiles we know we hold right away. Words are
// legal at any point of a match, and the tiles in the client cache are a
// subset of the real rack (a rack only grows until we play), so every word
// is still spellable. If the match has already ended, the server refuses
// the words and nothing is lost. On a healthy feed this never fires, so
// normal play is exactly K-13's.

/** Settings, from DAMO_BLIND_DUMP / DAMO_BLIND_DUMP_MS / DAMO_BLIND_DUMP_BAG. */
export interface BlindDumpConfig {
  enabled: boolean;
  /** Silence that triggers the dump; 0 = 2 auction lengths, at least 1.8 s. */
  silenceMs: number;
  /** Only when the estimated bag holds at most this many tiles. */
  maxBag: number;
}

export const DEFAULT_BLIND_DUMP: Readonly<BlindDumpConfig> = Object.freeze({
  enabled: true,
  silenceMs: 0,
  maxBag: 8,
});

export function blindDumpConfig(env: NodeJS.ProcessEnv = process.env): BlindDumpConfig {
  const num = (v: string | undefined, d: number) =>
    v !== undefined && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : d;
  return {
    enabled: env.DAMO_BLIND_DUMP !== "0",
    silenceMs: Math.max(0, num(env.DAMO_BLIND_DUMP_MS, DEFAULT_BLIND_DUMP.silenceMs)),
    maxBag: Math.max(0, Math.floor(num(env.DAMO_BLIND_DUMP_BAG, DEFAULT_BLIND_DUMP.maxBag))),
  };
}

/** Silence that counts as a stall for the blind dump. */
export function blindSilenceMs(auctionMs: number, cfg: BlindDumpConfig): number {
  if (cfg.silenceMs > 0) return cfg.silenceMs;
  const a = Number.isFinite(auctionMs) && auctionMs > 0 ? auctionMs : 1000;
  return Math.max(1800, 2 * a);
}

/**
 * Tiles still in the bag, estimated through a silence: the cached bagTotal
 * stops moving when the feed does, but the server keeps selling a tile
 * every auction length (unsold tiles are discarded, not returned).
 */
export function estimatedBag(cachedBag: number, silentMs: number, auctionMs: number): number {
  const a = Number.isFinite(auctionMs) && auctionMs > 0 ? auctionMs : 1000;
  return Math.max(0, cachedBag - Math.floor(Math.max(0, silentMs) / a));
}

/** True when the endgame blind dump should fire now. */
export function blindDumpDue(
  nowMs: number,
  lastFeedMs: number,
  auctionMs: number,
  cachedBag: number,
  cfg: BlindDumpConfig,
): boolean {
  if (!cfg.enabled) return false;
  const silent = nowMs - lastFeedMs;
  if (!(silent > blindSilenceMs(auctionMs, cfg))) return false;
  return estimatedBag(cachedBag, silent, auctionMs) <= cfg.maxBag;
}

/** The rack minus the letters of words already sent and not yet acknowledged. */
export function rackAfterInFlight(rack: readonly number[], inFlight: readonly number[]): number[] {
  return rack.map((n, i) => Math.max(0, n - (inFlight[i] ?? 0)));
}
