import { stripDiacritics } from './utils.js';

/**
 * Normalize a card name to the same key used by parseCardList:
 * lowercase, diacritics stripped, front-face only.
 */
export function normKey(name) {
  if (!name) return '';
  return stripDiacritics(name.toLowerCase().trim().split(' // ')[0].trim());
}

/**
 * Build a union-find substitution map from substitution pairs.
 * Returns a find(key) function: given a normalized card name,
 * returns the canonical representative of its equivalence class.
 */
export function buildSubMap(subs) {
  const parent = new Map();

  function find(x) {
    if (!parent.has(x)) return x;
    // Path compression
    let root = x;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root);
    let node = x;
    while (node !== root) {
      const next = parent.get(node) ?? node;
      parent.set(node, root);
      node = next === node ? root : next;
    }
    return root;
  }

  function union(x, y) {
    const px = find(x), py = find(y);
    if (px === py) return;
    if (px < py) parent.set(py, px); // alphabetically earlier → canonical
    else parent.set(px, py);
  }

  for (const sub of subs) {
    const a = normKey(sub.cardA);
    const b = normKey(sub.cardB);
    if (a && b && a !== b) union(a, b);
  }

  return find;
}

/**
 * Merge the raw collection so all cards in the same substitution group
 * share a single pool keyed by their canonical name.
 */
export function buildEffectiveCollection(collection, subFind) {
  const eff = new Map();
  for (const [name, count] of collection) {
    const key = subFind(name);
    eff.set(key, (eff.get(key) || 0) + count);
  }
  return eff;
}
