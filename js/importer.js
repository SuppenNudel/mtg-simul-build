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

  let lastErr;
  for (const makeProxy of CORS_PROXIES) {
    try {
      const resp = await fetch(makeProxy(url), { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.text();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All proxies failed');
}

/**
 * Parse the Pauperbrews tier list HTML.
 * Walks the DOM tracking single-letter tier nodes (S/A/B/C/D)
 * and collecting deck links with deck_id= in their href.
 * @returns {Array<{deckId: string, name: string, tier: string}>}
 */
export function parseTierListHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const TIERS = new Set(['S', 'A', 'B', 'C', 'D']);
  const results = [];
  const seen = new Set();
  let currentTier = '?';

  function walk(node) {
    if (node.nodeType === 3) {
      const t = node.textContent.trim();
      if (t.length === 1 && TIERS.has(t)) currentTier = t;
    } else if (node.nodeType === 1) {
      if (node.tagName === 'A') {
        const href = node.getAttribute('href') || '';
        const m = href.match(/deck_id=(\d+)/);
        if (m) {
          const deckId = m[1];
          const name = node.textContent.trim();
          if (!seen.has(deckId) && name.length > 1 && !/^\p{Emoji}/u.test(name)) {
            seen.add(deckId);
            results.push({ deckId, name, tier: currentTier });
          }
        }
      }
      for (const child of node.childNodes) walk(child);
    }
  }

  if (doc.body) walk(doc.body);
  return results;
}

/**
 * Parse a Pauperbrews deck page HTML → "N Card Name\n..." text.
 * Tries the TCGPlayer affiliate link first (main deck, cleanest),
 * then falls back to Scryfall image tags (includes sideboard).
 */
export function parseDeckPageHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Method 1: TCGPlayer affiliate link
  for (const a of doc.querySelectorAll('a[href*="tcgplayer.com"]')) {
    let href = a.getAttribute('href') || '';
    const uM = href.match(/[?&]u=([^&]+)/);
    if (uM) href = decodeURIComponent(uM[1]);
    const cM = href.match(/[?&]c=([^&]+)/i);
    if (!cM) continue;
    const decoded = decodeURIComponent(cM[1]).replace(/\+/g, ' ');
    const lines = decoded.split('||').map(e => {
      e = e.trim();
      const sp = e.search(/\s/);
      if (sp < 0) return null;
      const count = parseInt(e.slice(0, sp), 10);
      const name  = e.slice(sp + 1).trim();
      return (name && count > 0) ? `${count} ${name}` : null;
    }).filter(Boolean);
    if (lines.length >= 10) return lines.join('\n');
  }

  // Method 2: Scryfall image tags (fallback, includes sideboard)
  const lines = [];
  let addedSideboardHeader = false;

  function collectCards(node) {
    if (node.nodeType === 3) {
      const t = node.textContent.trim();
      if (t === 'Sideboard' && !addedSideboardHeader && lines.length > 0) {
        lines.push('Sideboard');
        addedSideboardHeader = true;
      }
    } else if (node.nodeType === 1) {
      if (node.tagName === 'IMG') {
        const src = node.getAttribute('src') || '';
        const nameM = src.match(/fuzzy=([^&]+)/);
        if (nameM) {
          const cardName = decodeURIComponent(nameM[1].replace(/\+/g, ' '));
          const parentText = node.parentElement?.textContent || '';
          const countM = parentText.match(/[×x](\d+)/);
          lines.push(`${countM ? parseInt(countM[1], 10) : 1} ${cardName}`);
        }
      }
      for (const child of node.childNodes) collectCards(child);
    }
  }

  if (doc.body) collectCards(doc.body);
  return lines.join('\n');
}
