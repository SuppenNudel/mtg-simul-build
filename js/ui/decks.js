import { state } from '../state.js';
import { esc } from '../utils.js';
import { parseCardList } from '../parser.js';
import { checkBuildability, findBestCombinations } from '../solver.js';
import { buildSubMap, buildEffectiveCollection } from '../substitutions.js';
import { renderIndividual, renderSimultaneous, renderInteractive } from './results.js';

export function addDeck() {
  state.decks.push({ id: state.nextId++, name: `Deck ${state.decks.length + 1}`, listText: '' });
  renderDecklists();
}

export function removeDeck(id) {
  state.decks = state.decks.filter(d => d.id !== id);
  renderDecklists();
}

export function renderDecklists() {
  const container = document.getElementById('decklists-container');
  container.innerHTML = '';

  if (state.decks.length === 0) {
    container.innerHTML = '<p class="hint" style="margin-top:4px">No decklists yet — click "+ Add Deck" above.</p>';
    return;
  }

  state.decks.forEach(deck => {
    const div = document.createElement('div');
    div.className = 'deck-input';
    div.innerHTML = `
      <div class="deck-header">
        <input type="text" class="deck-name-input" value="${esc(deck.name)}"
               placeholder="Deck name" data-id="${deck.id}" />
        <button class="btn btn-danger" data-action="remove-deck" data-id="${deck.id}">✕ Remove</button>
      </div>
      <textarea class="deck-list-input" rows="8"
        placeholder="4 Lightning Bolt&#10;4x Counterspell&#10;20 Mountain&#10;..."
        data-id="${deck.id}">${esc(deck.listText)}</textarea>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll('.deck-name-input').forEach(el => {
    el.addEventListener('input', e => {
      const d = state.decks.find(d => d.id === +e.target.dataset.id);
      if (d) d.name = e.target.value.trim() || `Deck ${state.decks.indexOf(d) + 1}`;
    });
  });

  container.querySelectorAll('.deck-list-input').forEach(el => {
    el.addEventListener('input', e => {
      const d = state.decks.find(d => d.id === +e.target.dataset.id);
      if (d) d.listText = e.target.value;
    });
  });
}

export function calculate() {
  const collectionText  = document.getElementById('collection-input').value;
  const collection      = parseCardList(collectionText);
  const unlimitedBasics = document.getElementById('unlimited-basics').checked;

  if (state.decks.length === 0) {
    alert('Add at least one decklist first.');
    return;
  }

  const parsedDecks = state.decks.map((d, i) => ({
    id:         d.id,
    name:       d.name || `Deck ${i + 1}`,
    cards:      parseCardList(d.listText || ''),
    totalCards: 0, // filled below
  }));
  parsedDecks.forEach(d => {
    d.totalCards = [...d.cards.values()].reduce((s, v) => s + v, 0);
  });

  const subFind           = buildSubMap(state.substitutions);
  const effectiveCollection = buildEffectiveCollection(collection, subFind);

  const deckResults = parsedDecks.map(d => ({
    ...d,
    ...checkBuildability(d.cards, effectiveCollection, unlimitedBasics, subFind),
  }));

  const comboResult = findBestCombinations(parsedDecks, effectiveCollection, unlimitedBasics, subFind);

  state.currentResult = { 
    parsedDecks, 
    collection: effectiveCollection, 
    unlimitedBasics, 
    subFind,
    deckResults,
    comboResult,
  };

  renderIndividual(deckResults);
  renderSimultaneous(comboResult, parsedDecks);
  renderInteractive(parsedDecks);

  const resultsSection = document.getElementById('results-section');
  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
