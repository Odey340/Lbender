import assert from "node:assert/strict";
import test from "node:test";
import { emptyCounts, idx, canSpell } from "../core/rules.js";
import type { MatchView } from "../core/types.js";
import { LbenderAgent } from "./agent.js";

function view(letters: string[], auctionType: "Vickrey" | "FirstPrice" = "Vickrey"): MatchView {
  const rack = emptyCounts();
  for (const letter of letters) rack[idx(letter)]!++;
  return {
    matchId: 1, myBotId: 10, auctionType, round: 1, bagTotal: 67,
    startingRackSize: 5,
    participants: [
      { botId: 10, balance: 100, score: 0, isSim: false },
      { botId: 20, balance: 100, score: 0, isSim: true },
      { botId: 30, balance: 100, score: 0, isSim: true },
    ],
    myRack: rack, history: [], nowMs: Date.now(),
  };
}
const auction = { auctionId: 1, letter: "S", opensAtMs: Date.now(), closesAtMs: Date.now()+1000 };

test("bids are integral and never exceed balance", () => {
  const agent = new LbenderAgent();
  const bid = agent.quickBid(view(["T","O","N","E","R"]), auction);
  assert.ok(Number.isInteger(bid) && bid >= 0 && bid <= 100);
});
test("first-price bids are bounded by balance", () => {
  const bid = new LbenderAgent().quickBid(view(["T","O","N","E","R"],"FirstPrice"), auction);
  assert.ok(bid >= 0 && bid <= 100);
});
test("uses public auction outcomes as market observations", () => {
  const v = view(["T","O","N","E","R"]);
  for (let i=0;i<8;i++) v.history.push({kind:"auction",auctionId:i,letter:"A",winnerBotId:20,paid:3+i});
  const agent = new LbenderAgent();
  const quick = agent.quickBid(v, auction);
  const refined = agent.refineBid(v, auction, 10);
  assert.ok(quick >= 0 && quick <= 100);
  assert.ok(refined === null || (refined >= 0 && refined <= 100));
});
test("plays useful five-letter words before the endgame", () => {
  const agent = new LbenderAgent();
  const v = view(["S","T","O","N","E"]);
  const chosen = agent.chooseWords(v);
  assert.ok(chosen.some((w) => w.length >= 5));
  const remaining = v.myRack.slice();
  for (const word of chosen) {
    assert.ok(canSpell(word, remaining));
    for (let i=0;i<word.length;i++) remaining[idx(word[i]!)]!--;
  }
});
test("endgame selection returns a spellable partition", () => {
  const agent = new LbenderAgent();
  const v = view(["R","E","T","A","I","N","S"]); v.bagTotal=1;
  const chosen = agent.chooseWords(v);
  const remaining = v.myRack.slice();
  for (const word of chosen) {
    assert.ok(canSpell(word, remaining));
    for (let i=0;i<word.length;i++) remaining[idx(word[i]!)]!--;
  }
});
