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
      deckId:    String(d.latest_deck_id),
      name:      d.deck_name,
      tier:      tierLabel(d.tier),
      score:     d.tier_score,
      trophies:  d.trophy_count,
      weeks:     d.active_weeks,
      presence:  d.weekly_presence_pct,
    }));

    // Rename top 5 Rogues to "D-tier"
    const rogues = decks.filter(d => d.tier === '?').sort((a, b) => b.score - a.score);
    for (let i = 0; i < Math.min(5, rogues.length); i++) {
      rogues[i].tier = 'D';
    }

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
    const tierDecks = byTier[tier];
    const isCollapsed = tier === 'D' || tier === '?';
    const tierLabel = tier === '?' ? 'Rogue' : `Tier ${tier}`;
    
    html += `
      <div class="tier-section" data-tier="${tier}" data-collapsed="${isCollapsed}">
        <div class="tier-header">
          <div class="tier-badge-bar" style="background:${color}">
            <div class="tier-badge-label">${tier}</div>
          </div>
          <div class="tier-header-controls">
            <span class="tier-title">${tierLabel} (${tierDecks.length})</span>
            <button class="tier-toggle-btn" data-action="toggle-tier" data-tier="${tier}" title="Toggle section">
              ${isCollapsed ? '▶' : '▼'}
            </button>
          </div>
        </div>
        <div class="tier-content" style="display: ${isCollapsed ? 'none' : 'flex'}">
          <div class="tier-section-controls">
            <button class="select-tier-btn" data-action="select-tier" data-tier="${tier}" data-checked="true">Select all</button>
            <button class="select-tier-btn" data-action="select-tier" data-tier="${tier}" data-checked="false">Deselect all</button>
          </div>
          <div class="tier-decks">
            ${tierDecks.map(d => `
              <div class="deck-card">
                <div class="deck-card-header">
                  <input type="checkbox" class="tier-deck-check"
                         data-deck-id="${esc(d.deckId)}" data-deck-name="${esc(d.name)}" />
                  <span class="deck-name">${esc(d.name)}</span>
                </div>
                <div class="deck-stats">
                  <div class="stat">
                    <div class="stat-value">${d.trophies}</div>
                    <div class="stat-label">Trophies</div>
                  </div>
                  <div class="stat">
                    <div class="stat-value">${d.presence.toFixed(0)}%</div>
                    <div class="stat-label">Presence</div>
                  </div>
                  <div class="stat">
                    <div class="stat-value">${d.weeks}</div>
                    <div class="stat-label">Weeks</div>
                  </div>
                  <div class="stat">
                    <div class="stat-value">${d.score.toFixed(2)}</div>
                    <div class="stat-label">Score</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
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

  // Clear existing decklists
  state.decks = [];

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

export function toggleTierSection(tier) {
  const section = document.querySelector(`[data-tier="${tier}"]`);
  if (!section) return;
  
  const isCollapsed = section.dataset.collapsed === 'true';
  const content = section.querySelector('.tier-content');
  const btn = section.querySelector('.tier-toggle-btn');
  
  section.dataset.collapsed = !isCollapsed;
  content.style.display = isCollapsed ? 'flex' : 'none';
  btn.textContent = isCollapsed ? '▼' : '▶';
}
