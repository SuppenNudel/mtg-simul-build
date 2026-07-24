import { initCollectionImport }                       from './ui/collection.js';
import { renderSubstitutions, addSubstitution, removeSubstitution } from './ui/substitutions.js';
import { addDeck, removeDeck, renderDecklists, calculate }          from './ui/decks.js';
import { renderIndividual, renderSimultaneous, renderInteractive,
         tryCombo, onComboChange }                                  from './ui/results.js';
import { toggleTierlistPanel, loadTierList,
         selectTierDecks, importSelected }                          from './ui/tierlist.js';

document.addEventListener('DOMContentLoaded', () => {

  // ── Static button wiring ──────────────────────────────────────────────────
  initCollectionImport();
  renderSubstitutions();

  document.getElementById('add-deck-btn')       .addEventListener('click', addDeck);
  document.getElementById('add-sub-btn')        .addEventListener('click', addSubstitution);
  document.getElementById('import-tierlist-btn').addEventListener('click', toggleTierlistPanel);
  document.getElementById('load-tierlist-btn')  .addEventListener('click', loadTierList);
  document.getElementById('import-selected-btn').addEventListener('click', importSelected);
  document.getElementById('calculate-btn')      .addEventListener('click', calculate);

  // ── Event delegation for dynamically generated elements ───────────────────

  // Deck remove buttons
  document.getElementById('decklists-container').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="remove-deck"]');
    if (btn) removeDeck(+btn.dataset.id);
  });

  // Substitution remove buttons
  document.getElementById('substitutions-container').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="remove-sub"]');
    if (btn) removeSubstitution(+btn.dataset.id);
  });

  // "Try in checker" buttons in simultaneous results
  document.getElementById('simultaneous-results').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="try-combo"]');
    if (btn) tryCombo(JSON.parse(btn.dataset.indices));
  });

  // Combo-check checkboxes in interactive checker
  document.getElementById('combo-checkboxes').addEventListener('change', e => {
    if (e.target.classList.contains('combo-check')) onComboChange();
  });

  // Tier "Select all / Deselect all" buttons
  document.getElementById('tierlist-decks-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="select-tier"]');
    if (btn) selectTierDecks(btn.dataset.tier, btn.dataset.checked === 'true');
  });

  // ── Default decklists ─────────────────────────────────────────────────────
  addDeck();
  addDeck();
});
