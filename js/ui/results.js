import { state } from '../state.js';
import { esc, titleCase } from '../utils.js';
import { checkSimultaneous } from '../solver.js';

// ── Individual deck results ───────────────────────────────────────────────────

export function renderIndividual(deckResults) {
  const canCount = deckResults.filter(d => d.canBuild).length;
  const total    = deckResults.length;

  let html = `
    <p class="results-summary">
      <strong>${canCount}</strong> of <strong>${total}</strong>
      deck${total !== 1 ? 's' : ''} can be built individually.
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
    `;
  }
}
