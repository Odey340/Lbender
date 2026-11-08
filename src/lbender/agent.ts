import * as fs from "node:fs";
import * as path from "node:path";
import {
  canSpell,
  emptyCounts,
  idx,
  totalTiles,
  wordReward,
  type Counts,
} from "../core/rules.js";
import type { Agent, AuctionView, MatchView } from "../core/types.js";
import { evaluateLetterOptions } from "./valuation.js";

const WORDLIST_PATH = path.join(import.meta.dirname, "..", "..", "data", "wordlist.txt");

let dictionary: string[] | undefined;
function words(): string[] {
  if (dictionary) return dictionary;
  dictionary = fs
    .readFileSync(WORDLIST_PATH, "utf8")
    .replace(/\r/g, "")
    .split("\n")
    .filter((word) => word.length >= 2 && /^[A-Z]+$/.test(word));
  return dictionary;
}

function rackKey(rack: Counts): string {
  return rack.join(",");
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

interface PlayableWord {
  word: string;
  reward: number;
}

function playableWords(rack: Counts): PlayableWord[] {
  const out: PlayableWord[] = [];
  const size = totalTiles(rack);
  for (const word of words()) {
    if (word.length > size || !canSpell(word, rack)) continue;
    out.push({ word, reward: wordReward(word) });
  }
  out.sort(
    (a, b) =>
      b.reward - a.reward ||
      b.word.length - a.word.length ||
      (a.word < b.word ? -1 : a.word > b.word ? 1 : 0),
  );
  return out;
}

/**
 * LBender's first independent strategy:
 * - dictionary completion and rack flexibility for letter valuation;
 * - a transparent budget-per-expected-win coin shadow price;
 * - conservative shading in first-price auctions;
 * - long-word preservation with a simple endgame/low-cash release rule.
 *
 * This deliberately does not import the K-13 brain, simulator, market model,
 * sampled-future valuation, or fitted K-13 parameters.
 */
export class LbenderAgent implements Agent {
  readonly name = "lbender";
  private cachedRack = "";
  private cachedValues: number[] = [];

  private letterValues(rack: Counts): number[] {
    const key = rackKey(rack);
    if (key !== this.cachedRack) {
      this.cachedValues = evaluateLetterOptions(rack, words());
      this.cachedRack = key;
    }
    return this.cachedValues;
  }

  private balance(view: MatchView): number {
    return view.participants.find((p) => p.botId === view.myBotId)?.balance ?? 0;
  }

  quickBid(view: MatchView, auction: AuctionView): number {
    const balance = Math.max(0, Math.floor(this.balance(view)));
    if (balance <= 0) return 0;

    const letter = idx(auction.letter);
    if (letter < 0 || letter >= 26) return 0;

    const potential = this.letterValues(view.myRack)[letter] ?? 0;
    if (!(potential > 0)) return 0;

    // Reserve a roughly equal share of the current balance for each expected
    // future win. Six seats are common, but tournament tables can be larger.
    const seats = Math.max(2, view.participants.length);
    const auctionsLeft = Math.max(1, view.bagTotal + 1);
    const expectedWins = Math.max(0.75, auctionsLeft / seats);
    const budgetPerWin = balance / expectedWins;

    // A transparent shadow price: a typical useful tile is valued at about
    // six score points. Clamp it so early/late-game estimates stay bounded.
    const pointsPerCoin = clamp(6 / Math.max(1, budgetPerWin), 0.18, 1.5);
    const firstPriceShade = view.auctionType === "FirstPrice" ? 0.72 : 1;
    const rawBid = (potential / pointsPerCoin) * firstPriceShade;
    const perAuctionLimit = Math.max(1, Math.ceil(budgetPerWin * 2.5));
    return clamp(Math.floor(rawBid), 0, Math.min(balance, perAuctionLimit));
  }

  refineBid(_view: MatchView, _auction: AuctionView, _budgetMs: number): number | null {
    // The independent policy is deterministic; no second-pass search needed.
    return null;
  }

  chooseWords(view: MatchView): string[] {
    const candidates = playableWords(view.myRack);
    if (candidates.length === 0) return [];

    const best = candidates[0]!;
    const balance = this.balance(view);
    const endgame = view.bagTotal <= 1;
    const needsCash = balance <= 14 && view.bagTotal <= 10 && best.word.length >= 5;
    if (!endgame && !needsCash && best.word.length < 7) return [];

    const remaining = view.myRack.slice();
    const chosen: string[] = [];
    for (const candidate of candidates) {
      if (chosen.length >= 3) break;
      if (!canSpell(candidate.word, remaining)) continue;
      chosen.push(candidate.word);
      for (let i = 0; i < candidate.word.length; i++) {
        remaining[candidate.word.charCodeAt(i) - 65]!--;
      }
    }
    return chosen;
  }
}

export function createLbenderAgent(): Agent {
  return new LbenderAgent();
}

export { emptyCounts };
