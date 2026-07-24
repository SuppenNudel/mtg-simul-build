export const BASIC_LANDS = new Set([
  'forest', 'island', 'mountain', 'plains', 'swamp', 'wastes',
  'snow-covered forest', 'snow-covered island', 'snow-covered mountain',
  'snow-covered plains', 'snow-covered swamp',
]);

/** Section-header lines to skip when parsing decklists. */
export const SECTION_RE = /^(sideboard|mainboard|commander|companion|maybeboard|lands?|creatures?|spells?|instants?|sorceries|enchantments?|artifacts?|planeswalkers?)\s*:?\s*$/i;

/** Max decklists for exhaustive 2^n simultaneous-build search. */
export const MAX_EXHAUSTIVE = 20;

export const TIER_LIST_URL =
  'https://www.pauperbrews.com/p/pauper-mtgo-tier-list-leagues.html';

export const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.org/?${encodeURIComponent(url)}`,
];
