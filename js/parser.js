import { BASIC_LANDS, SECTION_RE } from './constants.js';
import { stripDiacritics, titleCase } from './utils.js';

/**
 * Parse a decklist / collection text into a Map<normalizedName, count>.
 * Supports:
 *   "4 Lightning Bolt", "4x Lightning Bolt", "Lightning Bolt x4", "Lightning Bolt"
 *   Arena: "4 Lightning Bolt (M10) 145"
 *   MTGO foil: "4 Lightning Bolt *F*"
 *   Double-faced: "Delver of Secrets // Insectile Aberration" → keyed as "delver of secrets"
 */
export function parseCardList(text) {
  const cards = new Map();
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    if (SECTION_RE.test(line)) continue;

    let count = 1;
    let name = line;

    let m = line.match(/^(\d+)x?\s+(.+)$/i);
    if (m) {
      count = parseInt(m[1], 10);
      name = m[2];
    } else {
      m = line.match(/^(.+?)\s+x(\d+)$/i);
      if (m) { count = parseInt(m[2], 10); name = m[1]; }
    }

    name = name.replace(/\s*\([A-Z0-9]{2,6}\)\s*\d*\s*$/, '').trim(); // Arena set code
    name = name.replace(/\s*\*[Ff]\*\s*$/, '').trim();                 // MTGO foil
    name = name.replace(/\s*[★✦✧]+\s*$/, '').trim();                   // decorations
    name = name.split(' // ')[0].trim();                                // DFC front face

    if (!name || count < 1) continue;

    const key = stripDiacritics(name.toLowerCase());
    cards.set(key, (cards.get(key) || 0) + count);
  }
  return cards;
}

export function isBasicLand(normalizedName) {
  return BASIC_LANDS.has(normalizedName);
}

// ── ManaBox CSV ───────────────────────────────────────────────────────────────

/**
 * Parse a ManaBox CSV export → Map<normalizedName, totalQuantity>.
 * Finds the Name and Quantity columns by header name (position-independent).
 */
export function parseManaBoxCSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return null;

  const header  = parseCSVRow(lines[0]);
  const nameIdx = header.findIndex(h => h.trim().toLowerCase() === 'name');
  const qtyIdx  = header.findIndex(h => h.trim().toLowerCase() === 'quantity');
  if (nameIdx === -1 || qtyIdx === -1) return null;

  const totals = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVRow(line);
    const name = (cols[nameIdx] || '').trim();
    const qty  = parseInt(cols[qtyIdx] || '0', 10);
    if (!name || qty < 1) continue;
    const key = name.toLowerCase();
    totals.set(key, (totals.get(key) || 0) + qty);
  }
  return totals;
}

/** Minimal RFC-4180-compatible single-row CSV parser. */
export function parseCSVRow(line) {
  const cols = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { cols.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  cols.push(cur);
  return cols;
}

/** Convert a card-count Map back to sorted "N Card Name" lines. */
export function totalsToText(totals) {
  return [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, qty]) => `${qty} ${titleCase(name)}`)
    .join('\n');
}
