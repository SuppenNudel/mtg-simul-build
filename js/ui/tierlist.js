import { state } from '../state.js';
import { esc } from '../utils.js';
import { TIER_LIST_URL, TIER_COLORS, TIER_ORDER, fetchWithProxy, parseTierListHTML, parseDeckPageHTML } from '../importer.js';
import { renderDecklists } from './decks.js';

export function toggleTierlistPanel() {
  document.getElementById('tierlist-panel').classList.toggle('hidden');
}

export async function loadTierList() {
  const statusEl  = document.getElementById('tierlist-status');
  const listEl    = document.getElementById('tierlist-decks-list');
  const actionsEl = document.getElementById('tierlist-actions');

  statusEl.textContent = 'Fetching tier list…';
  statusEl.style.color = '';
  listEl.innerHTML = '';
  actionsEl.classList.add('hidden');

  try {
    const html  = await fetchWithProxy(TIER_LIST_URL);
    const decks = parseTierListHTML(html);

    if (decks.length === 0) {
      statusEl.textContent = '⚠ No decks found — the page structure may have changed.';
      statusEl.style.color = 'var(--red)';
      return;
    }

    state.tierDecks = decks;
    statusEl.textContent = `Found ${decks.length} decks across ${new Set(decks.map(d => d.tier)).size} tiers.`;
    statusEl.style.color = 'var(--green)';
    renderTierListDecks(decks);
    actionsEl.classList.remove('hidden');
  } catch (e) {
    statusEl.textContent = `⚠ Fetch failed: ${e.message}`;
    statusEl.style.color = 'var(--red)';
  }
}

export function renderTierListDecks(decks) {
  const byTier = {};
  for (const d of decks) (byTier[d.tier] = byTier[d.tier] || []).push(d);

  let html = '';
  for (const tier of TIER_ORDER) {
    if (!byTier[tier]) continue;
    const color = TIER_COLORS[tier];
    html += `
      <div class="tier-group">
        <div class="tier-group-header">
          <span class="tier-badge" style="background:${color}">${tier === '?' ? 'Unknown' : 'Tier ' + tier}</span>
          <button class="select-tier-btn" data-action="select-tier" data-tier="${tier}" data-checked="true">Select all</button>
          <button class="select-tier-btn" data-action="select-tier" data-tier="${tier}" data-checked="false">Deselect all</button>
        </div>
        <div class="tier-deck-list">
          ${byTier[tier].map(d => `
            <label class="tier-deck-item">
              <input type="checkbox" class="tier-deck-check"
                     data-deck-id="${esc(d.deckId)}" data-deck-name="${esc(d.name)}" />
              ${esc(d.name)}
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }
  document.getElementById('tierlist-decks-list').innerHTML = html;
}

export function selectTierDecks(tier, checked) {
  document.querySelectorAll('.tier-deck-check').forEach(cb => {
    if (state.tierDecks.find(d => d.deckId === cb.dataset.deckId)?.tier === tier) {
      cb.checked = checked;
    }
  });
}

export async function importSelected() {
  const checked = [...document.querySelectorAll('.tier-deck-check:checked')];
  if (checked.length === 0) { alert('Select at least one deck first.'); return; }

  const progressEl = document.getElementById('import-progress');
  const btn        = document.getElementById('import-selected-btn');
  btn.disabled = true;

  let imported = 0, failed = 0;

  for (let i = 0; i < checked.length; i++) {
    const { deckId, deckName } = checked[i].dataset;
    progressEl.textContent = `Fetching ${deckName} (${i + 1}/${checked.length})…`;

    try {
      const url      = `https://www.pauperbrews.com/p/decklist-visual-view.html?deck_id=${deckId}`;
      const html     = await fetchWithProxy(url);
      const listText = parseDeckPageHTML(html);
      if (!listText.trim()) throw new Error('empty decklist');

      const tier = state.tierDecks.find(d => d.deckId === deckId)?.tier || '?';
      state.decks.push({ id: state.nextId++, name: `[${tier}] ${deckName}`, listText });
      imported++;
    } catch (e) {
      console.warn(`Failed to import ${deckName}:`, e);
      failed++;
    }
  }

  renderDecklists();
  btn.disabled = false;
  progressEl.textContent = '';

  const statusEl = document.getElementById('tierlist-status');
  statusEl.style.color = failed > 0 ? 'var(--gold)' : 'var(--green)';
  statusEl.textContent =
    `Imported ${imported} deck${imported !== 1 ? 's' : ''}` +
    (failed > 0 ? `, ${failed} failed (check console)` : '.') +
    ' Scroll down to see them.';

  document.getElementById('decklists-container')
    .scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
