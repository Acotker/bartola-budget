/**
 * Token-set style similarity, in the spirit of fuzzywuzzy's `token_set_ratio`:
 * word order and a few extra noise tokens shouldn't tank the score, which is
 * why this is token-based rather than raw Levenshtein.
 *
 * Blend rationale:
 *  - `containment` (shared tokens / smaller set) rewards "SPOTIFY" vs
 *    "SPOTIFY USA" — the same merchant with an extra qualifier.
 *  - `jaccard` (shared / union) penalises a small shared core buried in a lot
 *    of unrelated tokens, so "AMAZON" vs "AMAZON WEB SERVICES" stays apart.
 * Weighted 0.7/0.3, these land the intended cases either side of the 0.85 bar.
 */
export function tokenSetSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared += 1;
  if (shared === 0) return 0;

  const containment = shared / Math.min(setA.size, setB.size);
  const union = new Set([...setA, ...setB]).size;
  const jaccard = shared / union;

  return 0.7 * containment + 0.3 * jaccard;
}

export const MERGE_SIMILARITY_THRESHOLD = 0.85;
