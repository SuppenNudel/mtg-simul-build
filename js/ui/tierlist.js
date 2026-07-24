import { state } from '../state.js';
import { esc } from '../utils.js';
import { TIER_COLORS, TIER_ORDER, tierLabel, fetchTierList, fetchDeckById, deckDataToText } from '../importer.js';
import { renderDecklists } from './decks.js';

export function toggleTierlistPanel() {
  document.getElementById('tierlist-panel').classList.toggle('hidden');
}

export async function loadTierList() {
  const statusEl  = document.getElementById('tierlist-status');
  const listEl    = document.getElementById('tierlist-decks-list');
  const actionsEl = document.getElementById('tierlist-actions');
  const daysInput = document.getElementById('tierlist-days-input');
  const days      = parseInt(daysInput.value, 10) || 60;

  statusEl.textContent = `Fetching tier list from Pauperbrews (${days} days)…`;
  statusEl.style.color = '';
  listEl.innerHTML = '';
  actionsEl.classList.add('hidden');

  try {
    const raw   = await fetchTierList(days);
    const decks = raw.map(d => ({
      deckId: String(d.latest_deck_id),
      name:   d.deck_name,
      tier:   tierLabel(d.tier),
    }));

    if (decks.length === 0) {
      statusEl.textContent = '⚠ No decks found — the API may have changed.';
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

  const btn          = document.getElementById('import-selected-btn');
  const progressWrap = document.getElementById('import-progress-wrap');
  const progressBar  = document.getElementById('import-progress-bar');
  const progressLabel = document.getElementById('import-progress-label');
  const logEl        = document.getElementById('import-log');

  btn.disabled = true;
  progressWrap.classList.remove('hidden');
  logEl.innerHTML = '';

  // Pre-populate all log rows as pending
  const logItems = checked.map(cb => {
    const tier = state.tierDecks.find(d => d.deckId === cb.dataset.deckId)?.tier || '?';
    const div  = document.createElement('div');
    div.className = 'import-log-item pending';
    div.innerHTML = `<span class="log-icon">○</span><span>[${tier}] ${esc(cb.dataset.deckName)}</span>`;
    logEl.appendChild(div);
    return { el: div, tier };
  });

  let imported = 0, failed = 0;

  for (let i = 0; i < checked.length; i++) {
    const { deckId, deckName } = checked[i].dataset;
    const { el: logItem, tier } = logItems[i];

    logItem.className = 'import-log-item loading';
    logItem.innerHTML = `<span class="log-icon spin">↻</span><span>[${tier}] ${esc(deckName)}</span>`;
    logItem.scrollIntoView({ block: 'nearest' });

    progressLabel.textContent = `Fetching ${i + 1} / ${checked.length}…`;
    progressBar.style.width   = `${Math.round((i / checked.length) * 100)}%`;

    try {
      const deckData = await fetchDeckById(+deckId);
      const listText = deckDataToText(deckData);

      state.decks.push({ id: state.nextId++, name: `[${tier}] ${deckName}`, listText });
      imported++;

      logItem.className = 'import-log-item success';
      logItem.innerHTML = `<span class="log-icon">✓</span><span>[${tier}] ${esc(deckName)}</span>`;
    } catch (e) {
      failed++;
      logItem.className = 'import-log-item error';
      logItem.innerHTML = `<span class="log-icon">✗</span><span>[${tier}] ${esc(deckName)} — ${esc(e.message)}</span>`;
      console.warn(`Failed to import ${deckName}:`, e);
    }
  }

  progressBar.style.width   = '100%';
  progressLabel.textContent = `Done: ${imported} imported${
    failed > 0 ? `, ${failed} failed` : ''}.`;

  renderDecklists();
  btn.disabled = false;

  const statusEl = document.getElementById('tierlist-status');
  statusEl.style.color = failed > 0 ? 'var(--gold)' : 'var(--green)';
  statusEl.textContent = `Imported ${imported} deck${imported !== 1 ? 's' : ''}` +
    (failed > 0 ? `, ${failed} failed.` : '.') + ' Scroll down to see them.';

  document.getElementById('decklists-container')
    .scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
