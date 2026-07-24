/** Decompose accented characters and strip combining marks. */
export function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** HTML-escape a value for safe insertion into attributes or text. */
export function esc(str) {
  if (typeof str !== 'string') str = JSON.stringify(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Title-case a string, preserving common lowercase MTG prepositions. */
export function titleCase(str) {
  const LOWER = new Set(['a','an','the','of','in','on','at','to','and','or','but','for','nor','with','by','as']);
  return str.replace(/\S+/g, (word, offset) =>
    (offset > 0 && LOWER.has(word)) ? word : word.charAt(0).toUpperCase() + word.slice(1),
  );
}
