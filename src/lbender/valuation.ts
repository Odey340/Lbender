import { wordReward } from "../core/rules.js";

/**
 * Estimate the option value of acquiring each letter.
 *
 * This is a deterministic, dictionary-driven heuristic. It does not use
 * K-13's sampled-future partitioner, opponent model, or bidding optimizer.
 *
 * For each word, count how many additional tiles the current rack needs:
 *   0 missing: already playable (baseline)
 *   1 missing: the missing letter completes a word immediately
 *   2 missing: the letter moves the word one tile closer
 *   3 missing: a smaller long-horizon flexibility signal
 *
 * The score combines immediate marginal reward with discounted near-word
 * opportunities. It is intentionally simple enough to audit and benchmark.
 */
export function evaluateLetterOptions(rack: readonly number[], words: readonly string[]): number[] {
  const needed = new Uint8Array(26);
  const immediateBest = new Float64Array(26);
  const nearBest = new Float64Array(26);
  const farBest = new Float64Array(26);
  const immediateCount = new Uint32Array(26);
  const nearCount = new Uint32Array(26);
  const farCount = new Uint32Array(26);

  let rackSize = 0;
  for (let i = 0; i < 26; i++) rackSize += rack[i] ?? 0;

  let currentBest = 0;
  for (const word of words) {
    if (word.length < 2 || word.length > rackSize + 3) continue;

    needed.fill(0);
    for (let j = 0; j < word.length; j++) {
      const letter = word.charCodeAt(j) - 65;
      if (letter < 0 || letter >= 26) {
        needed.fill(0);
        break;
      }
      needed[letter]!++;
    }

    let missing = 0;
    let soleMissing = -1;
    for (let i = 0; i < 26; i++) {
      const deficit = needed[i]! - (rack[i] ?? 0);
      if (deficit <= 0) continue;
      missing += deficit;
      soleMissing = i;
      if (missing > 3) break;
    }
    if (missing > 3) continue;

    const reward = wordReward(word);
    if (missing === 0) {
      if (reward > currentBest) currentBest = reward;
      continue;
    }

    for (let i = 0; i < 26; i++) {
      if (needed[i]! <= (rack[i] ?? 0)) continue;
      if (missing === 1) {
        immediateCount[i]!++;
        if (reward > immediateBest[i]!) immediateBest[i] = reward;
      } else if (missing === 2) {
        nearCount[i]!++;
        if (reward > nearBest[i]!) nearBest[i] = reward;
      } else {
        farCount[i]!++;
        if (reward > farBest[i]!) farBest[i] = reward;
      }
    }
    void soleMissing;
  }

  const values = new Array<number>(26);
  for (let i = 0; i < 26; i++) {
    const immediate = Math.max(0, immediateBest[i]! - currentBest);
    const near = nearBest[i]! * 0.16;
    const far = farBest[i]! * 0.05;
    const flexibility =
      0.2 * Math.log1p(immediateCount[i]!) +
      0.1 * Math.log1p(nearCount[i]!) +
      0.04 * Math.log1p(farCount[i]!);
    values[i] = immediate + near + far + flexibility;
  }
  return values;
}
