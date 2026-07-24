'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

const BASIC_LANDS = new Set([
  'forest', 'island', 'mountain', 'plains', 'swamp', 'wastes',
  'snow-covered forest', 'snow-covered island', 'snow-covered mountain',
  'snow-covered plains', 'snow-covered swamp',
]);

// Section header lines to skip when parsing decklists
const SECTION_RE = /^(sideboard|mainboard|commander|companion|maybeboard|lands?|creatures?|spells?|instants?|sorceries|enchantments?|artifacts?|planeswalkers?)\s*:?\s*$/i;

// Maximum number of decklists for exhaustive 2^n search
const MAX_EXHAUSTIVE = 20;

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Parse a decklist / collection text into a Map<normalizedName, count>.
 * Supports:
 *   "4 Lightning Bolt"
 *   "4x Lightning Bolt"
 *   "Lightning Bolt x4"
 *   "Lightning Bolt" (count = 1)
 *   Arena: "4 Lightning Bolt (M10) 145"
 *   MTGO foil marker: "4 Lightning Bolt *F*"
 */
function parseCardList(text) {
  const cards = new Map();
  for (let line of text.split('\n')) {
    line = line.trim();

    // Skip blanks, comments, section headers
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    if (SECTION_RE.test(line)) continue;

    let count = 1;
    let name = line;

    // "4 Card Name" or "4x Card Name"
    let m = line.match(/^(\d+)x?\s+(.+)$/i);
    if (m) {
      count = parseInt(m[1], 10);
      name = m[2];
    } else {
      // "Card Name x4"
      m = line.match(/^(.+?)\s+x(\d+)$/i);
      if (m) {
        count = parseInt(m[2], 10);
        name = m[1];
      }
    }

    // Strip Arena-style "(SET) 123" suffix
    name = name.replace(/\s*\([A-Z0-9]{2,6}\)\s*\d*\s*$/, '').trim();
    // Strip MTGO foil marker
    name = name.replace(/\s*\*[Ff]\*\s*$/, '').trim();
    // Strip trailing ★ or other decoration
    name = name.replace(/\s*[★✦✧]+\s*$/, '').trim();
    // Normalize double-faced cards: keep only the front face name
    // e.g. "Delver of Secrets // Insectile Aberration" → "Delver of Secrets"
    name = name.split(' // ')[0].trim();

    if (!name || count < 1) continue;

    const key = stripDiacritics(name.toLowerCase());
    cards.set(key, (cards.get(key) || 0) + count);
  }
  return cards;
}

function isBasicLand(normalizedName) {
  return BASIC_LANDS.has(normalizedName);
}

// ── Buildability checks ───────────────────────────────────────────────────────

/**
 * Check if a single deck can be built from collection.
 * Returns { canBuild: bool, missing: [{name, have, need, short}] }
 */
function checkBuildability(deckCards, collection, unlimitedBasics, subFind) {
  const missing = [];
  for (const [card, needed] of deckCards) {
    if (unlimitedBasics && isBasicLand(card)) continue;
    const lookupKey = subFind ? subFind(card) : card;
    const have = collection.get(lookupKey) || 0;
    if (have < needed) {
      missing.push({ name: card, have, need: needed, short: needed - have });
    }
  }
  missing.sort((a, b) => b.short - a.short);
  return { canBuild: missing.length === 0, missing };
}

/**
 * Check if ALL decks in deckIndices can be built simultaneously.
 * Returns { canBuild: bool, missing: [{name, have, need, short}] }
 */
function checkSimultaneous(deckIndices, parsedDecks, collection, unlimitedBasics, subFind) {
  const combined = new Map();
  for (const idx of deckIndices) {
    for (const [card, count] of parsedDecks[idx].cards) {
      const key = subFind ? subFind(card) : card;
      combined.set(key, (combined.get(key) || 0) + count);
    }
  }
  const missing = [];
  for (const [card, needed] of combined) {
    if (unlimitedBasics && isBasicLand(card)) continue;
    const have = collection.get(card) || 0; // collection is already keyed by canonical
    if (have < needed) {
      missing.push({ name: card, have, need: needed, short: needed - have });
    }
  }
  missing.sort((a, b) => b.short - a.short);
  return { canBuild: missing.length === 0, missing };
}

// ── Combination finder ────────────────────────────────────────────────────────

/**
 * Find the largest set(s) of decklists that can all be built simultaneously.
 * For n <= MAX_EXHAUSTIVE: exhaustive O(2^n) search.
 * For n >  MAX_EXHAUSTIVE: greedy heuristic.
 *
 * Returns { maxSize, combinations: number[][], totalFound, greedy }
 */
function findBestCombinations(parsedDecks, collection, unlimitedBasics, subFind) {
  const n = parsedDecks.length;
  if (n === 0) return { maxSize: 0, combinations: [], totalFound: 0, greedy: false };

  if (n > MAX_EXHAUSTIVE) {
    return greedyCombinations(parsedDecks, collection, unlimitedBasics, subFind);
  }

  // Build a quick lookup: can each individual deck be built?
  // (subsets containing an unbuildable deck are never useful as maximal solutions
  //  but can still contribute to the max — we search all anyway)

  let bestSize = 0;
  const bestCombos = [];

  for (let mask = 1; mask < (1 << n); mask++) {
    const bits = bitCount(mask);
    if (bits < bestSize) continue; // Can't beat current best

    const indices = maskToIndices(mask, n);
    const result = checkSimultaneous(indices, parsedDecks, collection, unlimitedBasics, subFind);

    if (result.canBuild) {
      if (bits > bestSize) {
        bestSize = bits;
        bestCombos.length = 0;
      }
      bestCombos.push(indices);
      if (bestCombos.length > 500) break; // Safety cap
    }
  }

  return { maxSize: bestSize, combinations: bestCombos.slice(0, 20), totalFound: bestCombos.length, greedy: false };
}

function bitCount(n) {
  let c = 0;
  while (n) { c += n & 1; n >>>= 1; }
  return c;
}

function maskToIndices(mask, n) {
  const indices = [];
  for (let i = 0; i < n; i++) {
    if (mask & (1 << i)) indices.push(i);
  }
  return indices;
}

function greedyCombinations(parsedDecks, collection, unlimitedBasics, subFind) {
  // Sort by fewest unique non-basic cards (smaller footprint = easier to combine)
  const order = parsedDecks
    .map((d, i) => {
      let footprint = 0;
      for (const [card, count] of d.cards) {
        if (!isBasicLand(card)) footprint += count;
      }
      return { i, footprint };
    })
    .sort((a, b) => a.footprint - b.footprint)
    .map(x => x.i);

  const selected = [];
  for (const idx of order) {
    const candidate = [...selected, idx];
    if (checkSimultaneous(candidate, parsedDecks, collection, unlimitedBasics, subFind).canBuild) {
      selected.push(idx);
    }
  }
  return { maxSize: selected.length, combinations: [selected], totalFound: 1, greedy: true };
}

// ── State ─────────────────────────────────────────────────────────────────────

let decks = [];
let nextId = 0;

let substitutions = [];   // [{ id, cardA, cardB }]
let nextSubId = 0;

// Stored after calculate() for the interactive checker
let _state = null;

// ── Deck management ───────────────────────────────────────────────────────────

function addDeck() {
  const id = nextId++;
  decks.push({ id, name: `Deck ${decks.length + 1}`, listText: '' });
  renderDecklists();
}

function removeDeck(id) {
  decks = decks.filter(d => d.id !== id);
  renderDecklists();
}

function renderDecklists() {
  const container = document.getElementById('decklists-container');
  container.innerHTML = '';

  if (decks.length === 0) {
    container.innerHTML = '<p class="hint" style="margin-top:4px">No decklists yet — click "+ Add Deck" above.</p>';
    return;
  }

  decks.forEach(deck => {
    const div = document.createElement('div');
    div.className = 'deck-input';
    div.innerHTML = `
      <div class="deck-header">
        <input type="text" class="deck-name-input" value="${esc(deck.name)}"
               placeholder="Deck name" data-id="${deck.id}" />
        <button class="btn btn-danger" onclick="removeDeck(${deck.id})">✕ Remove</button>
      </div>
      <textarea class="deck-list-input" rows="8"
        placeholder="4 Lightning Bolt&#10;4x Counterspell&#10;20 Mountain&#10;..."
        data-id="${deck.id}">${esc(deck.listText)}</textarea>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll('.deck-name-input').forEach(el => {
    el.addEventListener('input', e => {
      const d = decks.find(d => d.id === +e.target.dataset.id);
      if (d) d.name = e.target.value.trim() || `Deck ${decks.indexOf(d) + 1}`;
    });
  });

  container.querySelectorAll('.deck-list-input').forEach(el => {
    el.addEventListener('input', e => {
      const d = decks.find(d => d.id === +e.target.dataset.id);
      if (d) d.listText = e.target.value;
    });
  });
}

// ── Calculate ─────────────────────────────────────────────────────────────────

function calculate() {
  const collectionText = document.getElementById('collection-input').value;
  const collection = parseCardList(collectionText);
  const unlimitedBasics = document.getElementById('unlimited-basics').checked;

  if (decks.length === 0) {
    alert('Add at least one decklist first.');
    return;
  }

  // Parse all decks
  const parsedDecks = decks.map(d => ({
    id: d.id,
    name: d.name || `Deck ${decks.indexOf(d) + 1}`,
    cards: parseCardList(d.listText || ''),
    listText: d.listText || '',
  }));

  // Build substitution map and effective collection (substituted cards share a pool)
  const subFind = buildSubMap(substitutions);
  const effectiveCollection = buildEffectiveCollection(collection, subFind);

  // Individual results
  const deckResults = parsedDecks.map(d => ({
    ...d,
    ...checkBuildability(d.cards, effectiveCollection, unlimitedBasics, subFind),
    totalCards: [...d.cards.values()].reduce((s, v) => s + v, 0),
  }));

  // Simultaneous combos
  const comboResult = findBestCombinations(parsedDecks, effectiveCollection, unlimitedBasics, subFind);

  // Store for interactive checker
  _state = { parsedDecks, collection: effectiveCollection, unlimitedBasics, subFind };

  // Render everything
  renderIndividual(deckResults);
  renderSimultaneous(comboResult, parsedDecks);
  renderInteractive(parsedDecks);

  const resultsSection = document.getElementById('results-section');
  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Render: individual results ────────────────────────────────────────────────

function renderIndividual(deckResults) {
  const canCount = deckResults.filter(d => d.canBuild).length;
  const total = deckResults.length;

  let html = `
    <p class="results-summary">
      <strong>${canCount}</strong> of <strong>${total}</strong> deck${total !== 1 ? 's' : ''} can be built individually.
    </p>
    <div class="deck-results-grid">
  `;

  for (const d of deckResults) {
    const cls = d.canBuild ? 'ok' : 'fail';
    const badge = d.canBuild
      ? `<span class="status-badge ok">✓ Can Build</span>`
      : `<span class="status-badge fail">✗ Missing ${d.missing.length} type${d.missing.length !== 1 ? 's' : ''}</span>`;

    const missingBlock = d.missing.length > 0 ? `
      <details>
        <summary>Missing cards — ${d.missing.length} type${d.missing.length !== 1 ? 's' : ''}, ${d.missing.reduce((s, c) => s + c.short, 0)} total copies</summary>
        <ul class="missing-list">
          ${d.missing.map(c => `
            <li>
              <span class="card-name">${esc(titleCase(c.name))}</span>
              <span class="card-counts">need ${c.need} · have ${c.have} · short <strong>${c.short}</strong></span>
            </li>
          `).join('')}
        </ul>
      </details>
    ` : '';

    html += `
      <div class="deck-result-card ${cls}">
        <div class="deck-result-header">
          <span class="deck-result-name">${esc(d.name)}</span>
          ${badge}
        </div>
        <div class="deck-stats">${d.totalCards} cards</div>
        ${missingBlock}
      </div>
    `;
  }

  html += '</div>';
  document.getElementById('individual-results').innerHTML = html;
}

// ── Render: simultaneous analysis ─────────────────────────────────────────────

function renderSimultaneous(comboResult, parsedDecks) {
  const { maxSize, combinations, totalFound, greedy } = comboResult;
  const container = document.getElementById('simultaneous-results');

  if (parsedDecks.length < 2) {
    container.innerHTML = '<p class="hint">Add at least 2 decklists to see simultaneous build analysis.</p>';
    return;
  }

  if (maxSize === 0) {
    container.innerHTML = '<p style="color:var(--red)">No decks can be built from your current collection.</p>';
    return;
  }

  if (maxSize === 1) {
    container.innerHTML = `
      <div class="highlight-box">
        <p class="highlight-text">You can build 1 deck at a time.</p>
        <p style="color:var(--text-muted);margin-top:6px;font-size:.9rem">
          No two decks share enough cards to be built simultaneously with your current collection.
        </p>
      </div>
    `;
    return;
  }

  const note = greedy
    ? `<p class="hint" style="margin-top:8px">(Heuristic result — with ${parsedDecks.length} decklists an exhaustive search is skipped. The true maximum may be higher.)</p>`
    : totalFound > 20
    ? `<p class="hint" style="margin-top:8px">Showing 20 of ${totalFound} optimal combinations.</p>`
    : '';

  let combosHtml = '';
  for (let i = 0; i < combinations.length; i++) {
    const combo = combinations[i];
    const tags = combo.map(idx => `<span class="deck-tag">${esc(parsedDecks[idx].name)}</span>`).join('');
    const indices = JSON.stringify(combo);
    combosHtml += `
      <div class="combo-item">
        <span class="combo-number">${i + 1}.</span>
        ${tags}
        <button class="try-combo-btn" onclick="tryCombo(${esc(indices)})">Try in checker ↓</button>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="highlight-box">
      <p class="highlight-text">🏆 You can build up to <strong>${maxSize}</strong> decks simultaneously!</p>
    </div>
    ${note}
    <div class="combo-list" style="margin-top:14px">${combosHtml}</div>
  `;
}

// ── Render: interactive checker ───────────────────────────────────────────────

function renderInteractive(parsedDecks) {
  const grid = document.getElementById('combo-checkboxes');
  grid.innerHTML = parsedDecks.map((d, i) => `
    <label class="combo-check-label" id="clabel-${i}">
      <input type="checkbox" class="combo-check" data-index="${i}" onchange="onComboChange()" />
      ${esc(d.name)}
    </label>
  `).join('');

  const resultBox = document.getElementById('combo-result');
  resultBox.className = 'combo-result-box';
  resultBox.innerHTML = '';
}

function tryCombo(indices) {
  // Uncheck all, then check the given indices
  document.querySelectorAll('.combo-check').forEach(cb => {
    const checked = indices.includes(+cb.dataset.index);
    cb.checked = checked;
    const label = document.getElementById(`clabel-${cb.dataset.index}`);
    if (label) label.classList.toggle('selected', checked);
  });
  onComboChange();
  document.getElementById('interactive-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function onComboChange() {
  if (!_state) return;
  const { parsedDecks, collection, unlimitedBasics, subFind } = _state;

  // Sync label styles
  document.querySelectorAll('.combo-check').forEach(cb => {
    const label = document.getElementById(`clabel-${cb.dataset.index}`);
    if (label) label.classList.toggle('selected', cb.checked);
  });

  const selected = [...document.querySelectorAll('.combo-check:checked')]
    .map(cb => +cb.dataset.index);

  const box = document.getElementById('combo-result');

  if (selected.length === 0) {
    box.className = 'combo-result-box';
    box.innerHTML = '';
    return;
  }

  const result = checkSimultaneous(selected, parsedDecks, collection, unlimitedBasics, subFind);
  const names = selected.map(i => parsedDecks[i].name);

  if (result.canBuild) {
    box.className = 'combo-result-box show ok';
    box.innerHTML = `
      <div class="result-title">✓ These ${selected.length} deck${selected.length !== 1 ? 's' : ''} can all be built simultaneously!</div>
      <div>${names.map(n => `<span class="deck-tag" style="margin:2px">${esc(n)}</span>`).join(' ')}</div>
    `;
  } else {
    const shown = result.missing.slice(0, 25);
    const extra = result.missing.length - shown.length;
    box.className = 'combo-result-box show fail';
    box.innerHTML = `
      <div class="result-title" style="color:var(--red)">✗ Cannot build all ${selected.length} selected decks simultaneously.</div>
      <details open style="margin-top:10px">
        <summary style="color:var(--red)">Missing ${result.missing.length} card type${result.missing.length !== 1 ? 's' : ''} across the combination</summary>
        <ul class="missing-list" style="margin-top:8px">
          ${shown.map(c => `
            <li>
              <span class="card-name">${esc(titleCase(c.name))}</span>
              <span class="card-counts">need ${c.need} · have ${c.have} · short <strong>${c.short}</strong></span>
            </li>
          `).join('')}
          ${extra > 0 ? `<li style="color:var(--text-muted)">…and ${extra} more</li>` : ''}
        </ul>
      </details>
    `;
  }
}

// ── Substitution system ─────────────────────────────────────────────────────

/**
 * Normalize a card name to the lookup key used in collections/decklists.
 * Must match the normalization in parseCardList.
 */
function normKey(name) {
  if (!name) return '';
  return stripDiacritics(name.toLowerCase().trim().split(' // ')[0].trim());
}

/**
 * Build a union-find based substitution map from the substitution pairs.
 * Returns a `find(key)` function: given a normalized card name, returns
 * the canonical representative for its equivalence class.
 */
function buildSubMap(subs) {
  const parent = new Map();

  function find(x) {
    if (!parent.has(x)) return x;
    let root = x;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root);
    // Path compression
    let node = x;
    while (node !== root) {
      const next = parent.get(node) !== undefined ? parent.get(node) : node;
      parent.set(node, root);
      node = next === node ? root : next;
    }
    return root;
  }

  function union(x, y) {
    const px = find(x), py = find(y);
    if (px === py) return;
    // Keep alphabetically earlier name as canonical so it's predictable
    if (px < py) parent.set(py, px);
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
 * Merge the raw collection into an effective collection where all cards
 * in the same substitution group share a single pool keyed by canonical name.
 */
function buildEffectiveCollection(collection, subFind) {
  const eff = new Map();
  for (const [name, count] of collection) {
    const key = subFind(name);
    eff.set(key, (eff.get(key) || 0) + count);
  }
  return eff;
}

// ── Substitution UI ───────────────────────────────────────────────────────────

function addSubstitution() {
  substitutions.push({ id: nextSubId++, cardA: '', cardB: '' });
  renderSubstitutions();
}

function removeSubstitution(id) {
  substitutions = substitutions.filter(s => s.id !== id);
  renderSubstitutions();
}

function renderSubstitutions() {
  const container = document.getElementById('substitutions-container');
  const empty = document.getElementById('subs-empty');

  if (substitutions.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = substitutions.map(sub => `
    <div class="sub-pair">
      <input type="text" class="sub-input" placeholder="Card you have"
             value="${esc(sub.cardA)}" data-id="${sub.id}" data-field="cardA" />
      <span class="sub-arrow">↔</span>
      <input type="text" class="sub-input" placeholder="Card in decklists"
             value="${esc(sub.cardB)}" data-id="${sub.id}" data-field="cardB" />
      <button class="btn btn-danger" onclick="removeSubstitution(${sub.id})">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.sub-input').forEach(el => {
    el.addEventListener('input', e => {
      const s = substitutions.find(s => s.id === +e.target.dataset.id);
      if (s) s[e.target.dataset.field] = e.target.value;
    });
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Decompose accented characters and strip combining marks. */
function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function esc(str) {
  // If str is an array (from JSON.stringify usage), handle it
  if (typeof str !== 'string') str = JSON.stringify(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function titleCase(str) {
  // Preserve common lowercase MTG words, capitalise the rest
  const LOWER = new Set(['a','an','the','of','in','on','at','to','and','or','but','for','nor','with','by','as']);
  return str.replace(/\S+/g, (word, offset) =>
    (offset > 0 && LOWER.has(word)) ? word : word.charAt(0).toUpperCase() + word.slice(1)
  );
}

// ── ManaBox CSV import ───────────────────────────────────────────────────────

/**
 * Parse a ManaBox CSV export and return a Map<normalizedName, totalQuantity>.
 * Handles quoted fields so card names with commas are safe.
 */
function parseManaBoxCSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return null;

  // Parse header to find column indices by name
  const header = parseCSVRow(lines[0]);
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
function parseCSVRow(line) {
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

/** Convert a totals Map back to readable "N Card Name" lines. */
function totalsToText(totals) {
  return [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, qty]) => `${qty} ${titleCase(name)}`)
    .join('\n');
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('add-deck-btn').addEventListener('click', addDeck);
  document.getElementById('add-sub-btn').addEventListener('click', addSubstitution);
  document.getElementById('calculate-btn').addEventListener('click', calculate);
  renderSubstitutions();

  // ManaBox CSV import
  const importBtn  = document.getElementById('import-csv-btn');
  const fileInput  = document.getElementById('csv-file-input');
  const statusEl   = document.getElementById('import-status');

  importBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const totals = parseManaBoxCSV(e.target.result);
      if (!totals || totals.size === 0) {
        statusEl.textContent = '⚠ Could not parse CSV — is it a ManaBox export?';
        statusEl.style.color = 'var(--red)';
        return;
      }
      document.getElementById('collection-input').value = totalsToText(totals);
      statusEl.textContent = `✓ Imported ${totals.size} unique cards from "${file.name}"`;
      statusEl.style.color = 'var(--green)';
    };
    reader.readAsText(file, 'UTF-8');
    // Reset so re-importing the same file triggers change again
    fileInput.value = '';
  });

  // Start with two blank decklists
  addDeck();
  addDeck();
});
