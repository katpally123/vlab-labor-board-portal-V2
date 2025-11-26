# VLAB Migration Plan

## Phase 1: Setup & Structure (Completed)
- [x] Create `vlab-v2-backup` (Safe Copy)
- [x] Create `vlab-frontend-dev` structure
- [x] Move `index.html`, `styles.css`, `app.js` to new locations
- [x] Update `index.html` to point to `styles/main.css` and `js/app.js`

## Phase 2: Module Extraction (Next Steps)
We will now extract logic from `js/app.js` into separate modules one by one.

### Priority 1: Core Utilities
- [ ] Extract `STATE` and `DATABASE` to `js/core/state.js`
- [ ] Extract helper functions to `js/utils.js`

### Priority 2: Independent Features
- [ ] Extract `MANUAL_SCAN` to `js/scan/manualScan.js`
- [ ] Extract `ANALYTICS` to `js/analytics/analytics.js`

### Priority 3: UI Components
- [ ] Extract Drag & Drop logic
- [ ] Extract Roster rendering

## Phase 3: Backend Integration (Future)
- [ ] Set up Python Flask/FastAPI
- [ ] Connect Database
