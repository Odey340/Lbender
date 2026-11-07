// Cost of a false alarm by the endgame blind dump (src/live/blinddump.ts):
// the feed hiccups, the bot cashes in its best partition early, and the
// match then carries on normally. Paired by deal: the same seeds, seats and
// opponents are played by plain Damo and by Damo forced to dump once when
// the bag first holds <= B tiles.
//
//   npx tsx scripts/measure-blind-dump.ts [--games 30] [--table palaces|clone:..] [--bags 10,4]

import { createAgent } from "../src/brain/index.js";
import { loadEnv } from "../src/brain/evaljobs.js";
import type { Agent, AuctionView, MatchView } from "../src/core/types.js";
import { getWordEngine } from "../src/core/words.js";
import { runMatch, type MatchSeat } from "../src/sim/engine.js";

const argv = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1]! : d;
};
const games = Number(arg("--games", "30"));
const tableSpec = arg("--table", "palaces");
const bags = arg("--bags", "10,4").split(",").map(Number);
const params = JSON.parse(arg("--params", '{"refineSamplesSim":96}')) as Record<string, unknown>;
const env = await loadEnv({ palace: params });
const engine = getWordEngine();
const TEST = 1_000_000;

/** Damo, plus one premature dump the first time the bag is at or below `bag`. */
class FalseAlarm implements Agent {
  readonly name = "false-alarm";
  private fired = false;
  constructor(
    private readonly base: Agent,
    private readonly bag: number,
  ) {}
  quickBid(v: MatchView, a: AuctionView) {
    return this.base.quickBid(v, a);
  }
  refineBid(v: MatchView, a: AuctionView, ms: number) {
    return this.base.refineBid ? this.base.refineBid(v, a, ms) : null;
  }
  chooseWords(v: MatchView): string[] {
    if (!this.fired && v.bagTotal <= this.bag && v.bagTotal > 0) {
      this.fired = true;
      return engine.bestPartition(v.myRack, { timeBudgetMs: 250 }).words;
    }
    return this.base.chooseWords(v);
  }
  onMatchEnd(v: MatchView) {
    this.base.onMatchEnd?.(v);
  }
}

function play(g: number, bag: number | null) {
  const seed = (7000 + g) >>> 0;
  const specs = tableSpec === "palaces" ? Array(5).fill("palace") : tableSpec.split(",");
  const seats: MatchSeat[] = specs.map((s, i) => {
    const sd = (seed * 31 + i * 7919) >>> 0;
    if (s === "palace") return { botId: 100 + i, isSim: false, agent: createAgent({ mode: "sim", seed: sd, params, model: env.model }) };
    const id = Number(s.split(":")[1]);
    return { botId: id, isSim: false, agent: env.createClone!(id, { seed: sd, model: env.model }) };
  });
  const damo = createAgent({ mode: "sim", seed: seed ^ 0x5bd1e995, params, model: env.model });
  seats.splice(g % (seats.length + 1), 0, { botId: TEST, isSim: false, agent: bag === null ? damo : new FalseAlarm(damo, bag) });
  const out = runMatch({ seats, seed, matchId: g + 1 });
  const scores = out.seats.map((s) => s.score);
  const me = out.seats.findIndex((s) => s.botId === TEST);
  const place = 1 + scores.filter((x) => x > scores[me]!).length;
  return { score: scores[me]!, place, win: place === 1 ? 1 : 0 };
}

const arms: (number | null)[] = [null, ...bags];
const res = new Map(arms.map((a) => [a, [] as ReturnType<typeof play>[]]));
for (let g = 0; g < games; g++) for (const a of arms) res.get(a)!.push(play(g, a));

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ci = (xs: number[]) => {
  const m = mean(xs);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
  return 1.96 * sd / Math.sqrt(xs.length);
};
const base = res.get(null)!;
console.log(`${games} paired deals vs ${tableSpec}, params ${JSON.stringify(params)}`);
console.log(`| arm | score | place | wins | Δscore vs plain (95%) | Δplace vs plain (95%) |`);
console.log(`|---|---|---|---|---|---|`);
for (const a of arms) {
  const r = res.get(a)!;
  const ds = r.map((x, i) => x.score - base[i]!.score);
  const dp = r.map((x, i) => x.place - base[i]!.place);
  const name = a === null ? "plain Damo" : `false alarm at bag ${a}`;
  console.log(`| ${name} | ${mean(r.map((x) => x.score)).toFixed(1)} | ${mean(r.map((x) => x.place)).toFixed(2)} | ${r.reduce((s, x) => s + x.win, 0)} | ${a === null ? "-" : `${mean(ds).toFixed(1)} ±${ci(ds).toFixed(1)}`} | ${a === null ? "-" : `${mean(dp).toFixed(2)} ±${ci(dp).toFixed(2)}`} |`);
}
