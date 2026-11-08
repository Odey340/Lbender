import { getWordEngine } from "../core/words.js";
import type { Counts } from "../core/rules.js";

/**
 * Fast rack-option value. For each possible incoming letter, query the
 * repository's indexed anagram trie rather than scanning the 172k-word
 * dictionary. Marginal best-word reward is the primary signal; playable-word
 * breadth is a small tie-breaker for flexible racks.
 */
export function evaluateLetterOptions(rack: readonly number[]): number[] {
  const engine = getWordEngine();
  const base = engine.bestReward(rack as number[]);
  const baseCount = engine.countPlayable(rack as number[]);
  const values = new Array<number>(26).fill(0);
  const next = Array.from(rack);
  for (let i = 0; i < 26; i++) {
    next[i] = (rack[i] ?? 0) + 1;
    const reward = engine.bestReward(next);
    const breadth = engine.countPlayable(next);
    const marginal = Math.max(0, reward - base);
    const flexibility = Math.log1p(Math.max(0, breadth - baseCount));
    // Small breadth bonus prevents a single narrow word from dominating.
    values[i] = marginal + 0.35 * flexibility;
    next[i] = rack[i] ?? 0;
  }
  return values;
}
