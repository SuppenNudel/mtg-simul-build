import { parseManaBoxCSV, totalsToText } from '../parser.js';

/** Wire up the ManaBox CSV file-import button. */
export function initCollectionImport() {
  const importBtn = document.getElementById('import-csv-btn');
  const fileInput = document.getElementById('csv-file-input');
  const statusEl  = document.getElementById('import-status');

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
    fileInput.value = ''; // allow re-importing the same file
  });
}
