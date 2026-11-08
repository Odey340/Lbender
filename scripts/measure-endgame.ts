// How much of Damo's score is earned in the last few auctions of a match?
// That is what a feed stall near the end puts at risk: words are only
// played while the match is running, and Damo holds tiles for 7+ letter
// words until the final auction.
//
//   npx tsx scripts/measure-endgame.ts [--games 40] [--table clone:18,clone:114,...|palaces] [--seed 1]

import { createAgent } from "../src/brain/index.js";
import { loadEnv } from "../src/brain/evaljobs.js";
import { runMatch, type MatchSeat } from "../src/sim/engine.js";

const argv = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1]! : d;
};
const games = Number(arg("--games", "40"));
const tableSpec = arg("--table", "clone:18,clone:114,clone:62,clone:107,clone:23");
const seed0 = Number(arg("--seed", "1"));
const params = JSON.parse(arg("--params", '{"refineSamplesSim":96}')) as Record<string, unknown>;
const K = [1, 2, 3, 4, 6, 8];

const env = await loadEnv({ palace: params });
const TEST = 1_000_000;
const totals = { score: 0, place: 0, wins: 0 };
const atRisk = new Map<number, number>(K.map((k) => [k, 0]));
const lostWins = new Map<number, number>(K.map((k) => [k, 0]));

for (let g = 0; g < games; g++) {
  const seed = (seed0 * 1000 + g) >>> 0;
  const specs = tableSpec === "palaces" ? Array(5).fill("palace") : tableSpec.split(",");
  const seats: MatchSeat[] = specs.map((s, i) => {
    const botId = 100 + i;
    const sd = (seed * 31 + i * 7919) >>> 0;
    if (s === "palace")
      return {
        botId,
        isSim: false,
        agent: createAgent({ mode: "sim", seed: sd, params, model: env.model }),
      };
    const id = Number(s.split(":")[1]);
    return { botId: id, isSim: false, agent: env.createClone!(id, { seed: sd, model: env.model }) };
  });
  const testPos = g % (seats.length + 1);
  seats.splice(testPos, 0, {
    botId: TEST,
    isSim: false,
    agent: createAgent({ mode: "sim", seed: seed ^ 0x5bd1e995, params, model: env.model }),
  });
  const out = runMatch({ seats, seed, matchId: g + 1 });
  const hist = out.engine.history as { kind: string; botId?: number; reward?: number }[];
  const auctions = hist.filter((e) => e.kind === "auction").length;
  // Points each seat earns after auction index `cut` has closed (i.e. in the last k windows).
  const scores = out.seats.map((s) => s.score);
  const me = out.seats.findIndex((s) => s.botId === TEST);
  const ranked = [...scores].sort((a, b) => b - a);
  totals.score += scores[me]!;
  totals.place += 1 + scores.filter((x) => x > scores[me]!).length;
  if (scores[me] === ranked[0]) totals.wins++;
  for (const k of K) {
    let seen = 0;
    let late = 0;
    for (const e of hist) {
      if (e.kind === "auction") seen++;
      else if (e.kind === "word" && e.botId === TEST && seen >= auctions - k) late += e.reward ?? 0;
    }
    atRisk.set(k, atRisk.get(k)! + late);
    // Would losing those points have cost the win?
    if (
      scores[me] === ranked[0] &&
      scores[me]! - late < Math.max(...scores.filter((_, i) => i !== me))
    )
      lostWins.set(k, lostWins.get(k)! + 1);
  }
}

console.log(`${games} games vs ${tableSpec}, params ${JSON.stringify(params)}`);
console.log(
  `Damo: mean score ${(totals.score / games).toFixed(1)}, mean place ${(totals.place / games).toFixed(2)}, wins ${totals.wins}`,
);
console.log(
  `| stall covers the last k auctions | points at risk per match | share of score | wins that would be lost |`,
);
console.log(`|---|---|---|---|`);
for (const k of K) {
  const pts = atRisk.get(k)! / games;
  console.log(
    `| ${k} | ${pts.toFixed(1)} | ${((100 * atRisk.get(k)!) / totals.score).toFixed(0)}% | ${lostWins.get(k)} of ${totals.wins} |`,
  );
}
