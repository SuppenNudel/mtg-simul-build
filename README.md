# MTG Simultaneous Build Checker

A modular web app to check which Magic: The Gathering decklists you can build simultaneously from your collection.

## Features

- **Import your collection** from ManaBox CSV or manual entry
- **Add decklists** by pasting card lists in any format
- **Card substitutions** — link cards that are functionally equivalent (e.g. Lightning Greaves ↔ Swiftfoot Boots)
- **Import from Pauperbrews** — fetch the tier list and import individual decklists with live progress
- **Find optimal combinations** — exhaustive search (up to 20 decks) or greedy heuristic for larger sets
- **Interactive checker** — manually select decks to see if they can all be built together
- **Modular codebase** — 13 ES modules organized by concern (logic, UI, import)

## Local Development

You need to serve the files over HTTP (ES modules cannot be loaded from `file://` URLs).

### Option 1: Python (built-in)
```bash
python3 server.py
```

### Option 2: Node.js
```bash
node server.js
```

Then open **http://localhost:8000** in your browser.

## Deployment

This is a static site — push to GitHub and enable Pages:

1. Create a new repo on GitHub
2. Add this repo as a remote and push:
   ```bash
   git remote add origin https://github.com/YOU/your-repo.git
   git push -u origin main
   ```
3. In repo **Settings → Pages**: enable Pages for `main` branch, root folder
4. Your app will be live at `https://YOU.github.io/your-repo`

## Architecture

**Pure logic modules** (no DOM, reusable, testable):
- `constants.js` — Constants and config
- `utils.js` — String utilities (stripDiacritics, esc, titleCase)
- `state.js` — Shared mutable state object
- `parser.js` — Card list parsing (plain text, Arena, ManaBox CSV)
- `solver.js` — Buildability checks and combination finder (exhaustive/greedy)
- `substitutions.js` — Union-find substitution system
- `importer.js` — Pauperbrews Supabase API calls

**UI modules** (handle DOM, call logic):
- `ui/collection.js` — ManaBox CSV import
- `ui/decks.js` — Deck CRUD and calculate
- `ui/substitutions.js` — Substitution pair UI
- `ui/results.js` — Render individual/simultaneous/interactive results
- `ui/tierlist.js` — Pauperbrews tier list with live import progress
- `ui/main.js` — Boot and event delegation

## Browser Support

Modern browsers (Chrome, Firefox, Safari, Edge) with:
- ES2020 module support
- Fetch API
- AbortSignal.timeout (or similar timeout pattern)

## Data & Privacy

- Your collection is stored **locally only** (never sent to any server)
- Deck imports fetch from Pauperbrews' public Supabase instance
- No tracking, no cookies
