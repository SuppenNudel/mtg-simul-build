import { state } from '../state.js';
import { esc, titleCase } from '../utils.js';
import { checkSimultaneous } from '../solver.js';

// ── Export utilities ──────────────────────────────────────────────────────

function downloadCsv(filename, headers, rows) {
  const csvContent = [
    headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

export function exportIndividualMissing() {
  const deckResults = state.currentResult?.deckResults;
  if (!deckResults) {
    alert('Run Check Buildability first.');
    return;
  }
  
  const rows = [];
  for (const d of deckResults) {
    if (d.missing.length === 0) continue;
    for (const card of d.missing) {
      rows.push([
        d.name,
        titleCase(card.name),
        card.need,
        card.have,
        card.short
      ]);
    }
  }
  
  if (rows.length === 0) {
    alert('No missing cards to export.');
    return;
  }
  
  downloadCsv(
    `missing-cards-individual-${new Date().toISOString().slice(0,10)}.csv`,
    ['Deck', 'Card Name', 'Need', 'Have', 'Short'],
    rows
  );
}

export function exportSimultaneousMissing() {
  const result = state.currentResult;
  if (!result) {
    alert('Run Check Buildability first.');
    return;
  }
  
  const selected = [...document.querySelectorAll('.combo-check:checked')]
    .map(cb => +cb.dataset.index);
  
  if (selected.length === 0) {
    alert('Select at least one deck in the interactive checker.');
    return;
  }
  
  const comboResult = checkSimultaneous(selected, result.parsedDecks, result.collection, result.unlimitedBasics, result.subFind);
  
  if (comboResult.canBuild) {
    alert('These decks can be built simultaneously—no missing cards!');
    return;
  }
  
  const rows = comboResult.missing.map(card => [
    selected.map(i => result.parsedDecks[i].name).join(' + '),
    titleCase(card.name),
    card.need,
    card.have,
    card.short
  ]);
  
  if (rows.length === 0) {
    alert('No missing cards to export.');
    return;
  }
  
  downloadCsv(
    `missing-cards-simultaneous-${new Date().toISOString().slice(0,10)}.csv`,
    ['Combo', 'Card Name', 'Need', 'Have', 'Short'],
    rows
  );
}

// ── Individual deck results ───────────────────────────────────────────────────

export function renderIndividual(deckResults) {
  const canCount = deckResults.filter(d => d.canBuild).length;
  const total    = deckResults.length;
  const hasMissing = deckResults.some(d => d.missing.length > 0);

  let html = `
    <p class="results-summary">
      <strong>${canCount}</strong> of <strong>${total}</strong>
      deck${total !== 1 ? 's' : ''} can be built individually.
      ${hasMissing ? '<button id="export-individual-missing" class="export-btn" style="margin-left:auto">📥 Export Missing Cards</button>' : ''}
    </p>
    <div class="deck-results-grid">
  `;

  for (const d of deckResults) {
    const cls   = d.canBuild ? 'ok' : 'fail';
    const badge = d.canBuild
      ? `<span class="status-badge ok">✓ Can Build</span>`
      : `<span class="status-badge fail">✗ Missing ${d.missing.length} type${d.missing.length !== 1 ? 's' : ''}</span>`;

    const missingBlock = d.missing.length > 0 ? `
      <details>
        <summary>Missing cards — ${d.missing.length} type${d.missing.length !== 1 ? 's' : ''},
          ${d.missing.reduce((s, c) => s + c.short, 0)} total copies</summary>
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
  
  if (hasMissing) {
    document.getElementById('export-individual-missing')?.addEventListener('click', exportIndividualMissing);
  }
}

// ── Simultaneous analysis ─────────────────────────────────────────────────────

export function renderSimultaneous(comboResult, parsedDecks) {
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
          No two decks can be built simultaneously with your current collection.
        </p>
      </div>
    `;
    return;
  }

  const note = greedy
    ? `<p class="hint" style="margin-top:8px">(Heuristic — exhaustive search skipped for ${parsedDecks.length} decklists.)</p>`
    : totalFound > 20
    ? `<p class="hint" style="margin-top:8px">Showing 20 of ${totalFound} optimal combinations.</p>`
    : '';

  let combosHtml = '';
  for (let i = 0; i < combinations.length; i++) {
    const combo = combinations[i];
    const tags  = combo.map(idx => `<span class="deck-tag">${esc(parsedDecks[idx].name)}</span>`).join('');
    combosHtml += `
      <div class="combo-item">
        <span class="combo-number">${i + 1}.</span>
        ${tags}
        <button class="try-combo-btn"
                data-action="try-combo"
                data-indices="${esc(JSON.stringify(combo))}">Try in checker ↓</button>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="highlight-box">
      <p class="highlight-text">🏆 You can build up to <strong>${maxSize}</strong> decks simultaneously!</p>
    </div>
    ${note}
    <div class="combo-list" style="margin-top:14px">${combosHtml}</div>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
      <button id="export-simultaneous-missing" class="export-btn">📥 Export Missing Cards for Selected Combo</button>
    </div>
  `;
}

// ── Interactive checker ───────────────────────────────────────────────────────

export function renderInteractive(parsedDecks) {
  const grid = document.getElementById('combo-checkboxes');
  grid.innerHTML = parsedDecks.map((d, i) => `
    <label class="combo-check-label" id="clabel-${i}">
      <input type="checkbox" class="combo-check" data-index="${i}" />
      ${esc(d.name)}
    </label>
  `).join('');

  const box = document.getElementById('combo-result');
  box.className = 'combo-result-box';
  box.innerHTML = '';
}

export function tryCombo(indices) {
  document.querySelectorAll('.combo-check').forEach(cb => {
    const checked = indices.includes(+cb.dataset.index);
    cb.checked = checked;
    document.getElementById(`clabel-${cb.dataset.index}`)
      ?.classList.toggle('selected', checked);
  });
  onComboChange();
  document.getElementById('interactive-panel')
    .scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function onComboChange() {
  if (!state.currentResult) return;
  const { parsedDecks, collection, unlimitedBasics, subFind } = state.currentResult;

  document.querySelectorAll('.combo-check').forEach(cb => {
    document.getElementById(`clabel-${cb.dataset.index}`)
      ?.classList.toggle('selected', cb.checked);
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
  const names  = selected.map(i => parsedDecks[i].name);

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
      <div class="result-title" style="color:var(--red)">
        ✗ Cannot build all ${selected.length} selected decks simultaneously.
      </div>
      <details open style="margin-top:10px">
        <summary style="color:var(--red)">
          Missing ${result.missing.length} card type${result.missing.length !== 1 ? 's' : ''} across the combination
        </summary>
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
      <button id="export-combo-missing" class="export-btn" style="margin-top:10px">📥 Export Missing Cards for This Combo</button>
    `;
  }
  
  document.getElementById('export-simultaneous-missing')?.addEventListener('click', exportSimultaneousMissing);
  document.getElementById('export-combo-missing')?.addEventListener('click', exportSimultaneousMissing);
