import { state } from '../state.js';
import { esc } from '../utils.js';

export function addSubstitution() {
  state.substitutions.push({ id: state.nextSubId++, cardA: '', cardB: '' });
  renderSubstitutions();
}

export function removeSubstitution(id) {
  state.substitutions = state.substitutions.filter(s => s.id !== id);
  renderSubstitutions();
}

export function renderSubstitutions() {
  const container = document.getElementById('substitutions-container');
  const empty     = document.getElementById('subs-empty');

  if (state.substitutions.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = state.substitutions.map(sub => `
    <div class="sub-pair">
      <input type="text" class="sub-input" placeholder="Card you have"
             value="${esc(sub.cardA)}" data-id="${sub.id}" data-field="cardA" />
      <span class="sub-arrow">↔</span>
      <input type="text" class="sub-input" placeholder="Card in decklists"
             value="${esc(sub.cardB)}" data-id="${sub.id}" data-field="cardB" />
      <button class="btn btn-danger" data-action="remove-sub" data-id="${sub.id}">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.sub-input').forEach(el => {
    el.addEventListener('input', e => {
      const s = state.substitutions.find(s => s.id === +e.target.dataset.id);
      if (s) s[e.target.dataset.field] = e.target.value;
    });
  });
}
