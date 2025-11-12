# VLAB Labor Board Portal - AI Coding Agent Instructions

## Quick Context
This is a single-page React-like app for Amazon's Virtual Labor Assignment Board. It manages employee roster data, handles CSV uploads, and provides an interactive drag-and-drop interface for assigning workers to different processes (Pick, Sort, Dock operations).

**Core files**: `index.html` (UI structure), `app.js` (8K+ lines of business logic), `styles.css` (visual tokens)

## Architecture Overview
- **Data Flow**: CSV files → PapaParse → `STATE.badges` object map → multi-site filtering → DOM rendering with drag-and-drop
- **Multi-Site System**: YDD2/YDD4 share employee pools; YHM2 is independent. `STATE.sites` tracks per-site assignments
- **Assignment Logic**: Badges move between `'unassigned'` and tile locations (e.g., `'cb'`, `'dm'`) via drag-and-drop or bulk operations
- **Analytics Tracking**: All assignments logged to `STATE.analytics.history` with timestamps and quarter tracking

### Key Runtime Objects
- **`STATE.badges`**: `{ badgeId: { id, name, eid, scode, site, present, loc, isUploaded } }`
- **`STATE.sites`**: `{ YDD2: { assignments: {} }, YDD4: { assignments: {} }, YHM2: { assignments: {} } }`  
- **`TILES`**: Array mapping DOM IDs to logical keys: `[['tile-cb','cb'], ['tile-dm','dm'], ...]`
- **`DATABASE`**: Persistent storage system with `getAllEmployees()`, `loadFromDatabase()` methods

## Critical Business Rules
- **Shift Code Filtering**: `DAY_SET` (DA,DB,DC,DL,DN,DH) vs `NIGHT_SET` (NA,NB,NC,NL,NN,NH)
- **Weekday Restrictions**: `WEEK_ALLOWED` object gates shift codes by calendar day when `STRICT_WEEK=true`
- **Site Eligibility**: YDD badges can work YDD2/YDD4; YHM2 badges only work YHM2
- **Cross-Site Prevention**: One employee can only be assigned to one site at a time

## Essential Patterns

### Drag-and-Drop Implementation
- Payload uses `badge.eid` (employee ID) when possible, fallback to `badge.id`
- `makeDropTarget(container, tileKey)` handles all drop logic with conflict detection
- Assignment changes trigger: badge location update → site assignment update → analytics logging → UI re-render

### Multi-Site Badge Management
```javascript
// Remove from ALL sites before reassigning
Object.keys(STATE.sites).forEach(siteCode => {
  delete STATE.sites[siteCode].assignments[badgeId];
});
// Add to current site
STATE.sites[currentSite].assignments[badgeId] = newLocation;
```

### CSV Field Mapping Convention
**Expected field names** (case-insensitive): `Employee Name`/`Name`, `Employee ID`/`ID`, `Employee Status`/`Status`, `Shift Pattern`/`ShiftCode`

### Smart Assignment Classes
- `SmartAssignmentManager`: Auto-assignment, rapid assignment, capacity filling
- `BulkAssignmentManager`: Multi-select operations with checkboxes
- Both use `dragDrop(null, processKey, badgeId)` to simulate drag-and-drop

## Developer Workflows

### Local Development
- **No build step required** - serve directory over HTTP (not `file://`)
- **Quick servers**: `python -m http.server` or `npx http-server`
- **Browser devtools**: Check console for `[DEBUG]` logs and runtime errors

### File Input Dependencies
- Input names/IDs are referenced directly: `#roster`, `#adjustments`, `#date`, `#shift_roster`, `#site_roster`
- **Keep input `name` and `id` attributes stable** - changing breaks `app.js` selectors

## Common Change Patterns

### Adding New Process Tiles
1. Add `<div class="board-card" id="tile-newprocess">` to `index.html`
2. Add `['tile-newprocess','newprocess']` to `TILES` array in `app.js` 
3. Add `.badge.newprocess { background: [color]; }` to `styles.css` if needed
4. Tile layers and drop targets auto-wire via existing code

### Shift Code Colors  
Add/modify in `styles.css`: `.badge.XX { background: [color]; }` and ensure `WEEK_ALLOWED` includes the code

### Business Rule Changes
- **Site classification**: Update `classifySite()` function
- **Shift filtering**: Modify `DAY_SET`/`NIGHT_SET` or `WEEK_ALLOWED` 
- **CSV parsing**: Update field mapping in `shiftCodeOf()` and related functions

### Analytics Features
Use `STATE.analytics.history` for assignment logs. Add entries via:
```javascript
STATE.analytics.history.push({
  badgeId, action: 'assign', fromLocation: 'unassigned', 
  toLocation: 'cb', timestamp: Date.now(), quarter: STATE.currentQuarter
});
```

## Troubleshooting Patterns
- **Missing badges**: Check `STATE.badges` contains `loc` values matching `TILES` keys or `'unassigned'`
- **Drag fails**: Verify payload uses correct employee ID format and `makeDropTarget` is wired
- **Site switching issues**: Check `STATE.currentSite` sync and `MULTISITE.ensureCurrentSiteSync()`
- **CSV parsing errors**: PapaParse expects headers; missing headers cause `undefined` fields

## Testing Strategy
- **Manual testing**: Upload sample CSVs, test drag-and-drop between tiles, verify site switching
- **Browser console**: Monitor `[DEBUG]` logs during operations
- **Local storage**: Check `vlab:lastRoster` for persistence issues

## Integration Points
- **Database**: `window.DATABASE` provides employee persistence
- **Analytics**: `ANALYTICS.logAssignment()` for external tracking
- **Multi-site**: `MULTISITE.badgeBelongsToSite()` for site filtering logic

---

## AI Agent Interaction Examples
| Goal        | Example Prompt                                                    |
| ----------- | ----------------------------------------------------------------- |
| Add Feature | "Add a new sort process tile with capacity input and drag target" |
| Debug Issue | "Why aren't YHM2 badges showing in YDD2 site view?"             |
| Modify Data | "Change shift code DA to use blue background instead of green"    |
| Analytics   | "Add rotation fairness tracking to assignment history"           |

**Always check existing patterns before implementing new features. Most functionality can be achieved by extending existing classes like `SmartAssignmentManager` or modifying the `TILES` configuration.**