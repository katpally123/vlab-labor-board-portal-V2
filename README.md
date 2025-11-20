# vlab-labor-board-portal
Next-gen VLAB Labor Board portal with new design specs, interactive headcount tools, and compact operational UI. Implements requirements from October 2025.

## Features

### 📱 Manual Scan Assignment Mode (NEW!)
Real-time barcode scanning interface for floor managers:
- **Scanner-First Workflow**: Scan process path → scan associate badge → instant assignment
- **Works After Lock**: Continue making assignments even when board is locked
- **Barcode Reference Guide**: Printable path codes for all process stations
- **Real-time Validation**: Site eligibility, shift code, and roster checks
- **Rotation Integration**: All scans feed into fairness analytics automatically
- **Session Context**: Date, shift, site, and shift code tracking per scan session
- **Recent Scans History**: Visual log of last 20 assignments with timestamps

See [MANUAL-SCAN-GUIDE.md](MANUAL-SCAN-GUIDE.md) for complete usage instructions.

### Multi-Site Assignment Management
- Switch between sites (YDD2, YDD4, YHM2) with preserved assignments
- Cross-site assignment prevention
- Site-specific analytics and tracking

### CSV File Upload Support
- **Roster**: Main employee roster with Employee ID, Name, Status, Shift Pattern
- **Swaps**: Employee shift swaps (IN/OUT directions)
- **VET/VTO**: Voluntary Extra Time and Voluntary Time Off
- **Labor Share**: Inter-site labor sharing agreements
- **Missing Associates**: Supplemental employee data for associates not in main roster

### Upload Feature
Upload a CSV file with additional associates using the same format as the main roster. The system will:
- Process uploaded associates independently or with main roster
- Prevent duplicate entries (checks by Employee ID)
- Apply same site filtering and shift validation
- Add to unassigned pool with blue highlighting
- Dedicated "Process Upload" button for standalone processing

Expected file format (same as roster):
```
Employee ID,Employee Name,Employee Status,Shift Pattern,Department ID,Management Area ID
98765,Mike Wilson,Active,DA,1299020,21
54321,Sarah Johnson,Active,DB,1211010,22
```

### Analytics System
The Analytics tab provides four focused dashboards:

- Overview: Session summary (total associates, active assignments, current site), assignment activity (assigned/unassigned/swapped), process distribution across Pick/Sort/Dock, and efficiency placeholders (UPH/CPLH, utilization).
- Performance: Planned vs Actual headcount, attendance rate, VET/VTO placeholders, and grouped process-level performance. Filters by shift, date, and process are available.
- Assignments: Log table with Associate ID/Name, Process Path (Pick/Sort/Dock), Action, Timestamp, and Quarter. Includes a local filter and a global Export CSV button in the page header.
- Rotation: Rotation summary across Pick/Sort/Dock per associate with a Fairness Index (0–100) and quarter toggle (Q1–Q3).

UI details:
- Pill-style tabs with soft shadows and smooth hover states to match modern Amazon internal dashboards.
- Card components with rounded corners and subtle hover effects.
- Responsive grid: 4 cards per row on wide screens, 2 columns on mid-size, and 1 column on very small screens.
 
Data notes:
- Charts are placeholders and can be bound to real metrics later (e.g., ANALYTICS.logAssignment, VET/VTO).
- Export CSV includes assignment history with Quarter.

### Adjustments Upload (Swap & Time-Off Actions)
To reflect real-time staffing changes without manual edits, you can upload an optional Adjustments CSV with columns:

```
User ID,Action,Date
qruchikr,SWAPIN,2025-11-11
ipanidhi,VET,2025-11-11
sgrupind,SWAPOUT,2025-11-11
manachha,VTO,2025-11-11
```

Supported actions:
- SWAPIN / VET: Adds (or reactivates) the associate for the current Date; creates a synthetic row if missing in roster.
- SWAPOUT / VTO: Removes the associate (status marked so filtered out).

Processing rules:
- Only rows matching the selected Date are applied.
- Unknown IDs on SWAPOUT/VTO are logged as warnings.
- Adjustment net (+adds / -removals) shown in success banner.
- Runs prior to site/shift filtering so planned HC reflects net changes.

Download the template via the “Adjustment Template” link in the roster upload section.
### Roster & Site Board Tabs
Two primary views are now available:

1. Site Board (default): Existing interactive assignment canvas, filters, smart assignment tools.
2. Roster: Headcount Overview table aggregating Active associates by Department ID, Management Area, Shift Code, and Status for the currently selected Date / Shift / Site.

Headcount recalculates automatically when you:
- Upload/build a new roster
- Change Date / Shift / Site
- Switch between sites via header or form selector

The top 5 departments (by active count) are shown as pills for a quick glance. A total Active count appears in the table footer.

If no roster has been loaded yet the tab shows an empty-state message.

You can refresh the table manually from the browser console with:
```
renderHeadcountOverview();
```

Accessible Markup:
- Tab buttons use `role="tab"` and maintain `aria-selected` state
- Panels use `role="tabpanel"` and are toggled via `hidden` class

Extensibility Ideas:
- Add export (CSV) for headcount overview
- Add filtering by Department or Management Area inside the tab
- Include trend vs previous day once historical snapshots are stored

- Real-time assignment tracking with site visibility
- Current assignment status (prevents duplicate tracking)
- Session-based analytics with date/time synchronization

## Quick Start
1. Serve the folder over HTTP: `python -m http.server 8080`
2. Open `http://localhost:8080` in your browser
3. Upload CSV files and select date/shift/site
4. Drag and drop associates between process areas
