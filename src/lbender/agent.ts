import {
  canSpell,
  idx,
  totalTiles,
  type Counts,
} from "../core/rules.js";
import { getWordEngine } from "../core/words.js";
import type { Agent, AuctionView, MatchView, PublicEvent } from "../core/types.js";
import { evaluateLetterOptions } from "./valuation.js";

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}
function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor((a.length - 1) * q))]!;
}
function subtractWord(rack: Counts, word: string): Counts {
  const out = rack.slice();
  for (let i = 0; i < word.length; i++) out[idx(word[i]!)]!--;
  return out;
}

interface MarketSample {
  prices: number[];
  byOpponent: Map<number, number[]>;
}
function marketSamples(view: MatchView): MarketSample {
  const prices: number[] = [];
  const byOpponent = new Map<number, number[]>();
  for (const event of view.history as PublicEvent[]) {
    if (event.kind !== "auction" || event.winnerBotId === null || event.winnerBotId === view.myBotId) continue;
    // In Vickrey this is the runner-up/clearing price; in FirstPrice it is
    // the winner's paid bid. Treat Vickrey values as market thresholds, not
    // as an observation of the winner's private willingness to pay.
    if (event.paid < 0) continue;
    prices.push(event.paid);
    const xs = byOpponent.get(event.winnerBotId) ?? [];
    xs.push(event.paid);
    byOpponent.set(event.winnerBotId, xs);
  }
  return { prices, byOpponent };
}

/**
 * Independent LBender strategy.
 * Auction pricing uses observed market-clearing prices; Vickrey bidding stays
 * value-oriented while FirstPrice bids shade toward an empirical price
 * quantile. Opponent history is used conservatively because Vickrey paid
 * amounts reveal the runner-up, not the winner's actual bid.
 */
export class LbenderAgent implements Agent {
  readonly name = "lbender";
  private cachedRack = "";
  private cachedValues: number[] = [];

  private values(rack: Counts): number[] {
    const key = rack.join(",");
    if (key !== this.cachedRack) {
      this.cachedValues = evaluateLetterOptions(rack);
      this.cachedRack = key;
    }
    return this.cachedValues;
  }
  private balance(view: MatchView): number {
    return view.participants.find((p) => p.botId === view.myBotId)?.balance ?? 0;
  }
  private coinShadow(view: MatchView): number {
    const me = this.balance(view);
    const auctionsLeft = Math.max(0, view.bagTotal);
    if (auctionsLeft <= 1) return 0.08; // coins expire at match end
    const seats = Math.max(2, view.participants.length);
    const expectedFutureWins = Math.max(1, auctionsLeft / seats);
    // Current balance already includes any previously earned word rewards;
    // do not count historical income a second time.
    const spendable = me;
    return clamp(7 / Math.max(1, spendable / expectedFutureWins), 0.12, 1.8);
  }

  quickBid(view: MatchView, auction: AuctionView): number {
    const balance = Math.max(0, Math.floor(this.balance(view)));
    if (!balance || view.bagTotal <= 0) return 0;
    const letter = idx(auction.letter);
    if (letter < 0 || letter >= 26) return 0;
    const value = this.values(view.myRack)[letter] ?? 0;
    if (value <= 0) return 0;

    const shadow = this.coinShadow(view);
    const samples = marketSamples(view);
    const enoughData = samples.prices.length >= 5;
    const marketMedian = median(samples.prices);
    const marketP75 = quantile(samples.prices, 0.75);
    const fairValue = value / shadow;

    if (view.auctionType === "Vickrey") {
      // Truthful value is the baseline; a modest market-informed denial
      // premium is allowed only when the market has a meaningful sample.
      const denial = enoughData ? Math.min(fairValue * 0.12, marketMedian * 0.25) : 0;
      return Math.floor(clamp(fairValue + denial, 0, balance));
    }

    // First-price: don't pay our full private value. Use recent market
    // clearing prices to shade toward the upper quartile, bounded by value.
    const target = enoughData ? Math.max(marketMedian, marketP75 * 0.85) : fairValue * 0.62;
    return Math.floor(clamp(Math.min(fairValue * 0.92, target), 0, balance));
  }

  refineBid(view: MatchView, auction: AuctionView, budgetMs: number): number | null {
    const balance = Math.max(0, Math.floor(this.balance(view)));
    if (!balance || view.bagTotal <= 0) return 0;
    const letter = idx(auction.letter);
    if (letter < 0 || letter >= 26) return 0;
    const value = (this.values(view.myRack)[letter] ?? 0) / this.coinShadow(view);
    if (value <= 0) return 0;

    const samples = marketSamples(view);
    if (samples.prices.length < 4) return null;
    const deadline = performance.now() + Math.max(1, Math.min(12, budgetMs));
    const maxBid = Math.min(balance, Math.ceil(value * 1.15));
    let bestBid = this.quickBid(view, auction);
    let bestUtility = -Infinity;
    // Empirical discrete expected-utility search. For Vickrey, payment is the
    // observed clearing price; for FirstPrice, payment is our submitted bid.
    for (let bid = 0; bid <= maxBid; bid++) {
      if (performance.now() > deadline) break;
      let wins = 0;
      let payment = 0;
      for (const price of samples.prices) {
        if (bid > price) {
          wins++;
          payment += view.auctionType === "Vickrey" ? price : bid;
        }
      }
      const p = wins / samples.prices.length;
      const avgPay = wins ? payment / wins : 0;
      const utility = p * (value - avgPay);
      if (utility > bestUtility) {
        bestUtility = utility;
        bestBid = bid;
      }
    }
    return clamp(bestBid, 0, balance);
  }

  chooseWords(view: MatchView): string[] {
    const engine = getWordEngine();
    const rack = view.myRack.slice();
    const size = totalTiles(rack);
    if (size < 2) return [];
    const me = view.participants.find((p) => p.botId === view.myBotId);
    const balance = me?.balance ?? 0;
    const bag = view.bagTotal;
    const best = engine.best(rack);
    if (!best) return [];

    const endgame = bag <= 1;
    const cashPressure = balance <= 22 && bag <= 18;
    const crowdedRack = size >= 9;
    const behind = view.participants.some(
      (p) => p.botId !== view.myBotId && p.score > (me?.score ?? 0) + 12,
    );

    // Exact best partition in the final window. Earlier, prefer high-value
    // words but cash shorter words when coins are scarce or the rack is full.
    if (endgame) return engine.bestPartition(rack, { timeBudgetMs: 12 }).words;

    const chosen: string[] = [];
    let remaining = rack;
    for (let n = 0; n < 3; n++) {
      const candidates = engine.topK(remaining, 24);
      if (!candidates.length) break;
      const candidate = candidates.find((w) => {
        if (w.word.length >= 6) return true;
        if (w.word.length === 5) return true;
        if (w.word.length === 4) return cashPressure || crowdedRack || behind;
        return cashPressure && (crowdedRack || behind) && w.word.length >= 3;
      });
      if (!candidate) break;

      // Preserve a short word only if it can plausibly be extended; otherwise
      // bank its points/coins now. A high-scoring immediate word is never
      // suppressed solely because it is shorter than seven letters.
      if (candidate.word.length <= 4 && !cashPressure && !crowdedRack && !behind) {
        const after = subtractWord(remaining, candidate.word);
        const futureBest = engine.bestReward(after);
        if (futureBest >= candidate.reward * 1.35) break;
      }
      chosen.push(candidate.word);
      remaining = subtractWord(remaining, candidate.word);
    }
    return chosen;
  }
}

export function createLbenderAgent(): Agent {
  return new LbenderAgent();
}
