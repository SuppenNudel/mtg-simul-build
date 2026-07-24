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
const METACONFLUENCE_BASE = 'https://metaconfluence.com';
const METACONFLUENCE_FORMATS = new Set(['pauper', 'pioneer', 'modern']);

/** Map Pauperbrews tier strings to single-letter labels. */
export function tierLabel(tier) {
  const MAP = { 'Tier 1': 'A', 'Tier 2': 'B', 'Tier 3': 'C', 'Rogue': '?' };
  return MAP[tier] || '?';
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

function normalizeMetaconfluenceFormat(format) {
  const f = String(format || '').trim().toLowerCase();
  if (!METACONFLUENCE_FORMATS.has(f)) {
    throw new Error(`Unsupported format "${format}". Use pauper, pioneer, or modern.`);
  }
  return f;
}

function slugToName(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Fetch and parse Metaconfluence tier list pages for paper formats.
 * @param {'pauper'|'pioneer'|'modern'} format
 */
export async function fetchMetaconfluenceTierList(format = 'pauper') {
  const f = normalizeMetaconfluenceFormat(format);
  const resp = await fetch(
    `${METACONFLUENCE_BASE}/wp-json/wp/v2/pages?slug=${f}-tier-list&_fields=slug,link,title.rendered,content.rendered&per_page=1`,
    { signal: AbortSignal.timeout(20000) }
  );
  if (!resp.ok) {
    const msg = await resp.text().catch(() => String(resp.status));
    throw new Error(`Metaconfluence API error ${resp.status}: ${msg}`);
  }

  const pages = await resp.json();
  if (!Array.isArray(pages) || !pages[0]?.content?.rendered) {
    throw new Error(`Could not find ${f} tier list page`);
  }

  const html = pages[0].content.rendered;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const elements = doc.querySelectorAll('h1,h2,h3,h4,a');
  const deckPathRe = new RegExp(`/${f}-deck-list/([^/?#]+)/?`, 'i');
  const tierHeadingRe = /\b([SABCD])\s*-\s*Tier\b/i;

  const out = [];
  const seen = new Set();
  let currentTier = null;

  for (const el of elements) {
    if (/^H[1-4]$/.test(el.tagName)) {
      const m = el.textContent.match(tierHeadingRe);
      if (m) currentTier = m[1].toUpperCase();
      continue;
    }

    if (el.tagName !== 'A' || !currentTier) continue;
    const href = el.getAttribute('href') || '';
    const pathMatch = href.match(deckPathRe);
    if (!pathMatch) continue;

    const deckUrl = href.startsWith('http') ? href : `${METACONFLUENCE_BASE}${href}`;
    if (seen.has(deckUrl)) continue;
    seen.add(deckUrl);

    const rawName = (el.textContent || '').trim();
    const name = rawName || slugToName(pathMatch[1]);
    out.push({
      source: 'metaconfluence',
      format: f,
      deckId: deckUrl,
      name,
      tier: currentTier,
      score: null,
      trophies: null,
      weeks: null,
      presence: null,
    });
  }

  return out;
}

function parseMoxfieldEmbedMarkdown(deckText) {
  const lines = String(deckText || '').split(/\r?\n/);
  const main = [];
  const side = [];
  let inSideboard = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^\|\s*Sideboard\s*\(\d+\)\s*\|/i.test(line)) {
      inSideboard = true;
      continue;
    }

    const m = line.match(/^\|\s*(\d+)\s*\|\s*\[([^\]]+)\]\([^)]*\)\s*\|?$/);
    if (!m) continue;

    const qty = Number(m[1]);
    const card = m[2].trim();
    if (!qty || !card) continue;

    const row = `${qty} ${card}`;
    if (inSideboard) side.push(row);
    else main.push(row);
  }

  if (main.length === 0) throw new Error('Could not parse card rows from Moxfield embed');
  if (side.length === 0) return main.join('\n');
  return `${main.join('\n')}\nSideboard\n${side.join('\n')}`;
}

/**
 * Fetch a decklist text from a Metaconfluence deck URL.
 * @param {string} deckUrl
 */
export async function fetchMetaconfluenceDeckText(deckUrl) {
  const m = String(deckUrl || '').match(/metaconfluence\.com\/(pauper|pioneer|modern)-deck-list\/([^/?#]+)\/?/i);
  if (!m) throw new Error('Invalid Metaconfluence deck URL');

  const format = m[1].toLowerCase();
  const slug = m[2];
  const type = `${format}-deck-list`;

  const postResp = await fetch(
    `${METACONFLUENCE_BASE}/wp-json/wp/v2/${type}?slug=${slug}&_fields=content.rendered,title.rendered,link&per_page=1`,
    { signal: AbortSignal.timeout(20000) }
  );
  if (!postResp.ok) {
    const msg = await postResp.text().catch(() => String(postResp.status));
    throw new Error(`Metaconfluence deck API error ${postResp.status}: ${msg}`);
  }

  const posts = await postResp.json();
  const rendered = posts?.[0]?.content?.rendered;
  if (!rendered) throw new Error('Deck page content not found');

  const iframeMatch = rendered.match(/moxfield\.com\/embed\/([A-Za-z0-9_-]+)/i);
  if (!iframeMatch) throw new Error('Could not locate Moxfield embed on deck page');

  const moxId = iframeMatch[1];
  const moxResp = await fetch(`https://r.jina.ai/http://moxfield.com/embed/${moxId}`, {
    signal: AbortSignal.timeout(25000),
  });
  if (!moxResp.ok) {
    const msg = await moxResp.text().catch(() => String(moxResp.status));
    throw new Error(`Moxfield conversion error ${moxResp.status}: ${msg}`);
  }

  const md = await moxResp.text();
  return parseMoxfieldEmbedMarkdown(md);
}
