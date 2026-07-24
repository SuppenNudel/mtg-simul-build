import { TIER_LIST_URL, CORS_PROXIES } from './constants.js';

export { TIER_LIST_URL };

export const TIER_COLORS = { S: '#b266ff', A: '#e8a020', B: '#4caf6e', C: '#4a9ede', D: '#aaa', '?': '#666' };
export const TIER_ORDER  = ['S', 'A', 'B', 'C', 'D', '?'];

/**
 * Fetch a URL via the configured CORS proxies, trying each in order.
 * @throws if all proxies fail
 */
export async function fetchWithProxy(url) {
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
