<!-- .github/copilot-instructions.md — guidance for AI coding agents in this repo -->

# Quick context
- This is a small static single-page app (SPA) that builds an interactive "Virtual Labor Assignment Board".
- Primary files: `index.html` (UI layout + file inputs), `app.js` (all app logic), `styles.css` (local styles). See `README.md` for a short summary.

# Big-picture architecture (what to know)
- Single-page front-end only; no server-side code. The app reads CSVs in-browser (via PapaParse) and renders an interactive board.
- Data flow: CSV files -> parsed rows (arrays of objects) -> filtered by site/shift -> normalized into a STATE.badges map -> DOM badges rendered into two kinds of containers (left unassigned stack, and per-tile badge layers).
- Key runtime concepts:
  - `STATE.badges`: object map of badge id -> { id, name, eid, scode, site, present, loc }
  - `TILES` array (in `app.js`) maps tile DOM ids to logical keys (e.g. `['tile-cb','cb']`) — tile keys become `loc` values on badges.
  - Drag-and-drop uses HTML5 `dataTransfer` with `text/plain` containing the badge id.

# Important files & anchors (use these when making changes)
- `app.js` — the canonical source of business rules (shift-code logic, site classification, CSV field mapping, rendering and DnD). Search for `STATE.badges`, `TILES`, `WEEK_ALLOWED`, and `classifySite` to find hotspots.
- `index.html` — input names/ids are used directly by `app.js` (e.g. inputs named `roster`, `swap`, `vetvto`, `laborshare`, `date`, `shift`, `site`) — keep IDs and names stable.
- `styles.css` — contains visual conventions for `.badge` classes and `.badge.<shiftcode>` color tokens; if you change badge classnames, update CSS here.

# Project-specific conventions (follow these exactly)
- CSV field names are read permissively but `app.js` expects common keys: `Employee Name`/`Name`, `Employee ID`/`ID`, `Employee Status`/`Status`, `Shift Pattern`/`ShiftCode` (see `shiftCodeOf`). Use those when authoring CSV fixtures.
- Badge ids are created with prefix `b_` (see `STATE.badges` creation). When referencing a badge DOM element look it up by `document.getElementById(badgeId)`.
- Shift codes are two-letter tokens (DA, DB, DC, DL, DN, DH, NA, NB, ...). The allowed codes per weekday are defined in `WEEK_ALLOWED` in `app.js` — edit there if business rules change.
- `parseInputDate` accepts both `yyyy-mm-dd` and `dd/mm/yyyy` inputs — keep that behavior.

# Quick developer workflows
- No build step. To run locally, serve the folder over a static HTTP server (browsers restrict file input/drag behavior on `file://`). Example quick servers (developer choice): `python -m http.server` or `npx http-server` run in the repo root.
- Browser devtools: open console to see runtime errors; `app.js` runs at DOMContentLoaded and expects elements with specific ids (see anchors above).

# Tests / changes guidance
- Small, focused edits: prefer to change `app.js` functions in-place and run the page in-browser rather than rewrite the whole file. This repo has no test harness; add tests only after discussing with repo owner.
- When changing data-shape (STATE.badges) or tile keys, update every reference: `TILES`, `tileBadgeLayers`, `setCounts`, `renderAllBadges`, and the corresponding DOM `id` in `index.html`.

# Troubleshooting gotchas (what trips people up)
- If badges don't appear or counts are wrong: ensure `STATE.badges` contains `loc` values matching one of the `TILES` keys or `'unassigned'`.
- Drag-and-drop ghost image code clones nodes into `document.body` briefly; keep CSS selectors (positioning, pointer-events) intact to avoid disappearing drags.
- CSV parsing: PapaParse is used with `header:true`. Missing headers cause `undefined` fields; prefer adding a small CSV fixture when debugging.

# Example edits (concrete snippets to search & update)
- To change tile labels or add a tile: edit `TILES` in `app.js` and add a matching `.board-card` in `index.html` with the id from the tuple (e.g. `tile-xyz`).
- To add a new shift-code color: add `.badge.XX { ... }` in `styles.css` and ensure `WEEK_ALLOWED`/`DAY_SET`/`NIGHT_SET` include that token in `app.js`.

# If unsure, ask the author
- If a change requires testing with real CSVs or changing business rules (site classification, shift allowances), ping the repo owner and include a small sample CSV showing the relevant fields.

---
If anything here is unclear or you want me to expand any section (for example, add quick run commands for Windows dev shells or include a sample CSV), tell me which part and I will iterate.

## Example prompts (how to ask the agent)
| Goal        | Example Prompt                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Generate UI | “Create a right panel for process paths (CB, Sort, Dock) using Tailwind grid, each with a title and count badge.” |
| Add logic   | “Add drag-and-drop logic between unassignedStack and process path panels.”                                        |
| Modify code | “Convert the current badge creation loop to use pastel background colors by shift code.”                          |
| Debug       | “Explain what this DOMContentLoaded callback does.”                                                               |
| Document    | “Generate inline JSDoc comments for app.js.”                                                                      |

How the agent should act on these prompts
- For UI changes: update `index.html` (add DOM structure) and `styles.css` (visual tokens). If adding new tiles, also update `TILES` in `app.js` so counts and tile layers keep working.
- For logic changes: edit `app.js`. Prefer small, single-purpose functions (e.g., `makeDropTarget`, `restack`) and run a quick static read to ensure IDs used in the JS match `index.html`.
- For visual/shift-code edits: change `createBadge` and/or `styles.css`. Shift-code CSS classes live in `styles.css` (e.g., `.badge.DA`).
- For debugging or docs: read `app.js` end-to-end. Provide stepwise explanations and, when asked to modify, add focused inline JSDoc above the affected functions.

Examples of minimal actionable responses
- "I'll add a new `<aside id=\"rightPanel\">` to `index.html`, create `.board-path` styles in `styles.css`, and append `['tile-xyz','xyz']` to `TILES` in `app.js`. I'll then wire `makeDropTarget` for the new card. Proceed?"
- "I'll add JSDoc for `renderAllBadges`, `createBadge`, and `parseInputDate` — one short description, param types, and return types. Apply patch now."
