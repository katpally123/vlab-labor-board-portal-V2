# vlab-labor-board-portal
Next-gen VLAB Labor Board portal with new design specs, interactive headcount tools, and compact operational UI. Implements requirements from October 2025.

## Features

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
