import assert from "node:assert/strict";
import test from "node:test";
import { emptyCounts } from "../core/rules.js";
import { evaluateLetterOptions } from "./valuation.js";

function rackOf(letters: string[]) {
  const rack = emptyCounts();
  for (const letter of letters) rack[letter.charCodeAt(0) - 65]!++;
  return rack;
}

test("values a letter that completes a playable word", () => {
  const rack = rackOf(["T", "O", "N"]);
  const values = evaluateLetterOptions(rack, ["TON", "TONE", "TONES"]);
  const e = "E".charCodeAt(0) - 65;
  const x = "X".charCodeAt(0) - 65;
  assert.ok(values[e]! > values[x]!);
});

test("near-word flexibility contributes value before a word is complete", () => {
  const rack = rackOf(["T", "O", "N"]);
  const values = evaluateLetterOptions(rack, ["TONES", "STONE", "NOTES"]);
  const e = "E".charCodeAt(0) - 65;
  const s = "S".charCodeAt(0) - 65;
  const x = "X".charCodeAt(0) - 65;
  assert.ok(values[e]! > values[x]!);
  assert.ok(values[s]! > values[x]!);
});

test("ignores malformed dictionary entries", () => {
  const rack = rackOf(["A", "T"]);
  const values = evaluateLetterOptions(rack, ["AT", "A1T", ""]);
  assert.equal(values["Z".charCodeAt(0) - 65], 0);
});
