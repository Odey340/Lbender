// Compare Damo's live results between two versions (e.g. before and after a
// DAMO_PARAMS change), from the match_end records in logs/decisions-*.jsonl.
//
//   npx tsx scripts/compare.ts --split "2026-11-07 18:08"            before vs after a time (your local time)
//   npx tsx scripts/compare.ts --from "2026-11-07 17:27" --split "2026-11-07 18:08"
//   npx tsx scripts/compare.ts                                       grouped by the DAMO_PARAMS each match logged
//
//   --from   ignore matches before this time (e.g. before a bug was fixed)
//   --split  "before" = matches before this time, "after" = from this time on
//   --logs   log folder (default logs)
//
// Matches where another copy of the bot was caught bidding are left out,
// and so are dry runs and matches whose result wasn't seen.

import * as fs from "node:fs";
import * as path from "node:path";

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const parseTime = (s: string | undefined, flag: string) => {
  if (!s) return undefined;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) {
    console.error(`${flag}: can't read the time '${s}'. Use e.g. "2026-11-07 18:08".`);
    process.exit(2);
  }
  return t;
};
const logs = arg("--logs") ?? "logs";
const from = parseTime(arg("--from"), "--from");
const split = parseTime(arg("--split"), "--split");

interface Match {
  t: number;
  match: string;
  place: number;
  seats: number;
  score: number;
  balance: number;
  spent: number;
  won: number;
  long: number;
  unplayed: number;
  params: string;
}

if (!fs.existsSync(logs)) {
  console.error(
    `No '${logs}' folder: run this from the Damo folder, after the bot has played some matches.`,
  );
  process.exit(2);
}
const matches: Match[] = [];
const twins = new Set<string>();
for (const f of fs
  .readdirSync(logs)
  .filter((f) => /^decisions-.*\.jsonl$/.test(f))
  .sort()) {
  for (const line of fs.readFileSync(path.join(logs, f), "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let r: Record<string, any>;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (r.type === "twin") twins.add(String(r.match));
    if (r.type !== "match_end" || r.dryRun || r.place == null || r.score == null) continue;
    const words: string[] = Array.isArray(r.words) ? r.words : [];
    matches.push({
      t: new Date(r.t).getTime(),
      match: String(r.match),
      place: Number(r.place),
      seats: Number(r.seats),
      score: Number(r.score),
      balance: Number(r.balance ?? 0),
      spent: Number(r.coinsSpent ?? 0),
      won: Number(r.auctionsWon ?? 0),
      long: words.filter((w) => w.length >= 7).length,
      unplayed: Number(r.unplayedTiles ?? 0),
      params: r.params ?? "(defaults)",
    });
  }
}

const usable = matches.filter((m) => !twins.has(m.match) && (from === undefined || m.t >= from));
const groups = new Map<string, Match[]>();
for (const m of usable) {
  const key = split !== undefined ? (m.t < split ? "before" : "after") : m.params;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(m);
}
if (groups.size === 0) {
  console.log("No matches found for that time range.");
  process.exit(0);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const ci = (xs: number[]) => (xs.length > 1 ? (1.96 * sd(xs)) / Math.sqrt(xs.length) : NaN);
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "-");
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "-");

console.log(
  `${usable.length} matches${twins.size ? ` (${[...twins].filter((t) => matches.some((m) => m.match === t)).length} left out: another copy was bidding)` : ""}\n`,
);
console.log(
  "| group | matches | avg place (lower = better) | wins | avg score | coins left at end | coins spent | tiles won | 7+ letter words | tiles unplayed |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const [k, ms] of groups) {
  const place = ms.map((m) => m.place);
  const score = ms.map((m) => m.score);
  console.log(
    `| ${k} | ${ms.length} | ${f2(mean(place))} ±${f2(ci(place))} | ${((100 * ms.filter((m) => m.place === 1).length) / ms.length).toFixed(0)}% | ${f1(mean(score))} ±${f1(ci(score))} | ${f1(mean(ms.map((m) => m.balance)))} | ${f1(mean(ms.map((m) => m.spent)))} | ${f1(mean(ms.map((m) => m.won)))} | ${f2(mean(ms.map((m) => m.long)))} | ${f1(mean(ms.map((m) => m.unplayed)))} |`,
  );
}

// Verdict for a two-group comparison.
if (groups.size === 2) {
  const [[ka, a], [kb, b]] = [...groups];
  const pa = a!.map((m) => m.place);
  const pb = b!.map((m) => m.place);
  const diff = mean(pb) - mean(pa);
  const se = Math.sqrt(sd(pa) ** 2 / pa.length + sd(pb) ** 2 / pb.length);
  const lo = diff - 1.96 * se;
  const hi = diff + 1.96 * se;
  console.log(
    `\nAvg place, ${kb} minus ${ka}: ${diff >= 0 ? "+" : ""}${f2(diff)} (95% range ${f2(lo)} to ${f2(hi)}; negative = ${kb} is better)`,
  );
  const n = Math.min(pa.length, pb.length);
  if (n < 30)
    console.log(`Too early to tell: only ${n} matches in the smaller group. Aim for 50+ in each.`);
  else if (hi < 0)
    console.log(`Verdict: '${kb}' is better, and the gap is bigger than luck would explain.`);
  else if (lo > 0)
    console.log(
      `Verdict: '${kb}' is worse, and the gap is bigger than luck would explain. Go back to '${ka}'.`,
    );
  else
    console.log(
      "Verdict: no clear difference yet. Keep playing, or keep the defaults if it stays this close.",
    );
}
