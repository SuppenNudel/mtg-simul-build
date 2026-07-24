import { BASIC_LANDS, MAX_EXHAUSTIVE } from './constants.js';

/**
 * Check if a single deck can be built from collection.
 * @param {Map} deckCards
 * @param {Map} collection  Already-effective (substitutions merged).
 * @param {boolean} unlimitedBasics
 * @param {Function} [subFind]  Canonical-name resolver; identity if omitted.
 * @returns {{ canBuild: boolean, missing: Array }}
 */
export function checkBuildability(deckCards, collection, unlimitedBasics, subFind) {
  const missing = [];
  for (const [card, needed] of deckCards) {
    if (unlimitedBasics && BASIC_LANDS.has(card)) continue;
    const lookupKey = subFind ? subFind(card) : card;
    const have = collection.get(lookupKey) || 0;
    if (have < needed) missing.push({ name: card, have, need: needed, short: needed - have });
  }
  missing.sort((a, b) => b.short - a.short);
  return { canBuild: missing.length === 0, missing };
}

/**
 * Check if ALL decks in deckIndices can be built simultaneously.
 * @returns {{ canBuild: boolean, missing: Array }}
 */
export function checkSimultaneous(deckIndices, parsedDecks, collection, unlimitedBasics, subFind) {
  const combined = new Map();
  for (const idx of deckIndices) {
    for (const [card, count] of parsedDecks[idx].cards) {
      const key = subFind ? subFind(card) : card;
      combined.set(key, (combined.get(key) || 0) + count);
    }
  }
  const missing = [];
  for (const [card, needed] of combined) {
    if (unlimitedBasics && BASIC_LANDS.has(card)) continue;
    const have = collection.get(card) || 0; // collection keyed by canonical
    if (have < needed) missing.push({ name: card, have, need: needed, short: needed - have });
  }
  missing.sort((a, b) => b.short - a.short);
  return { canBuild: missing.length === 0, missing };
}

/**
 * Find the largest set(s) of decklists buildable simultaneously.
 * Exhaustive for n ≤ MAX_EXHAUSTIVE; greedy heuristic otherwise.
 * @returns {{ maxSize: number, combinations: number[][], totalFound: number, greedy: boolean }}
 */
export function findBestCombinations(parsedDecks, collection, unlimitedBasics, subFind) {
  const n = parsedDecks.length;
  if (n === 0) return { maxSize: 0, combinations: [], totalFound: 0, greedy: false };
  if (n > MAX_EXHAUSTIVE) return _greedy(parsedDecks, collection, unlimitedBasics, subFind);

  let bestSize = 0;
  const bestCombos = [];

  for (let mask = 1; mask < (1 << n); mask++) {
    const bits = _bitCount(mask);
    if (bits < bestSize) continue;

    const indices = _maskToIndices(mask, n);
    if (checkSimultaneous(indices, parsedDecks, collection, unlimitedBasics, subFind).canBuild) {
      if (bits > bestSize) { bestSize = bits; bestCombos.length = 0; }
      bestCombos.push(indices);
      if (bestCombos.length > 500) break;
    }
  }

  return { maxSize: bestSize, combinations: bestCombos.slice(0, 20), totalFound: bestCombos.length, greedy: false };
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _greedy(parsedDecks, collection, unlimitedBasics, subFind) {
  const order = parsedDecks
    .map((d, i) => {
      let footprint = 0;
      for (const [card, count] of d.cards) {
        if (!BASIC_LANDS.has(card)) footprint += count;
      }
      return { i, footprint };
    })
    .sort((a, b) => a.footprint - b.footprint)
    .map(x => x.i);

  const selected = [];
  for (const idx of order) {
    if (checkSimultaneous([...selected, idx], parsedDecks, collection, unlimitedBasics, subFind).canBuild) {
      selected.push(idx);
    }
  }
  return { maxSize: selected.length, combinations: [selected], totalFound: 1, greedy: true };
}

function _bitCount(n) {
  let c = 0;
  while (n) { c += n & 1; n >>>= 1; }
  return c;
}

function _maskToIndices(mask, n) {
  const indices = [];
  for (let i = 0; i < n; i++) { if (mask & (1 << i)) indices.push(i); }
  return indices;
}
