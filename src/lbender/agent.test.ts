import assert from "node:assert/strict";
import test from "node:test";
import { emptyCounts, idx, canSpell } from "../core/rules.js";
import type { MatchView } from "../core/types.js";
import { LbenderAgent } from "./agent.js";

function view(letters: string[], auctionType: "Vickrey" | "FirstPrice" = "Vickrey"): MatchView {
  const rack = emptyCounts();
  for (const letter of letters) rack[idx(letter)]!++;
  return {
    matchId: 1,
    myBotId: 10,
    auctionType,
    round: 1,
    bagTotal: 67,
    startingRackSize: 5,
    participants: [
      { botId: 10, balance: 100, score: 0, isSim: false },
      { botId: 20, balance: 100, score: 0, isSim: true },
      { botId: 30, balance: 100, score: 0, isSim: true },
    ],
    myRack: rack,
    history: [],
    nowMs: Date.now(),
  };
}

test("bids are integral and never exceed available balance", () => {
  const agent = new LbenderAgent();
  const v = view(["T", "O", "N", "E", "R"]);
  const bid = agent.quickBid(v, {
    auctionId: 1,
    letter: "S",
    opensAtMs: Date.now(),
    closesAtMs: Date.now() + 1000,
  });
  assert.ok(Number.isInteger(bid));
  assert.ok(bid >= 0 && bid <= 100);
});

test("first-price bids remain within balance", () => {
  const agent = new LbenderAgent();
  const v = view(["T", "O", "N", "E", "R"], "FirstPrice");
  const bid = agent.quickBid(v, {
    auctionId: 1,
    letter: "S",
    opensAtMs: Date.now(),
    closesAtMs: Date.now() + 1000,
  });
  assert.ok(bid >= 0 && bid <= 100);
});

test("endgame word selection returns only words spellable from the rack", () => {
  const agent = new LbenderAgent();
  const v = view(["R", "E", "T", "A", "I", "N", "S"]);
  v.bagTotal = 1;
  const selected = agent.chooseWords(v);
  const remaining = v.myRack.slice();
  for (const word of selected) {
    assert.ok(canSpell(word, remaining), `${word} must be spellable`);
    for (let i = 0; i < word.length; i++) remaining[idx(word[i]!)]!--;
  }
});
