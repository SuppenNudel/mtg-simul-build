// ── Pauperbrews Supabase API ──────────────────────────────────────────────────
// The Pauperbrews tier list and deck data are served via a public Supabase
// instance with Access-Control-Allow-Origin: * — no CORS proxy required.

const SUPABASE_URL      = 'https://luyiwppfgsoyzkeygmeg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1eWl3cHBmZ3NveXprZXlnbWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NDQ3ODAsImV4cCI6MjA4MDQyMDc4MH0.22w892ixtjElwaHE5eQyskBuKhrmP1WBGlkE7_fneCI';

const SUPABASE_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
};

export const TIER_COLORS = { S: '#b266ff', A: '#e8a020', B: '#4caf6e', C: '#4a9ede', D: '#aaa', '?': '#666' };
export const TIER_ORDER  = ['S', 'A', 'B', 'C', 'D', '?'];

/** Map Pauperbrews tier strings to single-letter labels. */
export function tierLabel(tier) {
  const MAP = { 'Tier 1': 'A', 'Tier 2': 'B', 'Tier 3': 'C' };
  return MAP[tier] || 'D';
}

/**
 * Fetch the Pauperbrews league tier list.
 * @param {number} days  Lookback window in days (default 60).
 * @returns {Promise<Array>}
 */
export async function fetchTierList(days = 60) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_pauper_tiers`, {
    method: 'POST',
    headers: SUPABASE_HEADERS,
    body: JSON.stringify({ p_days: days }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => String(resp.status));
    throw new Error(`API error ${resp.status}: ${msg}`);
  }
  return resp.json();
}

/**
 * Fetch a single deck's card list by its MTGO deck_id.
 * @returns {Promise<{id, json_decklist: {mainboard: Array, sideboard: Array}}>}
 */
export async function fetchDeckById(deckId) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_deck_and_result`, {
    method: 'POST',
    headers: SUPABASE_HEADERS,
    body: JSON.stringify({ deck_id_input: Number(deckId) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => String(resp.status));
    throw new Error(`API error ${resp.status}: ${msg}`);
  }
  const data = await resp.json();
  if (!data?.[0]) throw new Error('No deck data returned');
  return data[0];
}

/**
 * Convert an API deck record to plain "N Card Name\n..." text.
 * Mainboard first; sideboard appended with a "Sideboard" separator if present.
 */
export function deckDataToText(deckData) {
  const jd = deckData.json_decklist;
  if (!jd) throw new Error('Missing json_decklist in API response');

  const lines = (jd.mainboard || []).map(c => `${c.count} ${c.name}`);

  if (jd.sideboard?.length) {
    lines.push('Sideboard');
    for (const c of jd.sideboard) lines.push(`${c.count} ${c.name}`);
  }

  if (lines.length === 0) throw new Error('Deck has no cards');
  return lines.join('\n');
}
