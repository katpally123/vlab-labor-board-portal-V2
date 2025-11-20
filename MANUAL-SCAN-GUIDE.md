# 📱 Manual Scan Assignment Mode - User Guide

## Overview

The Manual Scan Assignment Mode allows managers to use barcode scanners to quickly assign associates to process paths in real-time, mirroring physical floor operations. This feature works independently of the drag-and-drop board and continues to function even after assignments are locked.

## Key Benefits

✅ **Fast Assignment** - Scan path + scan badge = instant assignment  
✅ **Works After Lock** - Continue making assignments even when board is locked  
✅ **Real-time Tracking** - All scans logged with timestamps and context  
✅ **Rotation Integration** - Scans automatically feed into fairness analytics  
✅ **Multi-site Support** - Validates site eligibility (YHM2 vs YDD cluster)  
✅ **No Mouse Required** - Perfect for floor operations with scanners  

---

## How to Use

### 1. Set Scan Session Context

Before scanning, configure the session settings:

- **Date** - The work date (defaults to today)
- **Shift** - Day or Night
- **Site** - YDD2, YDD4, or YHM2
- **Shift Code** - DA, DB, DC, DL, DN, DH, NA, NB, NC, NL, NN, NH

> 💡 **Tip**: These settings sync with the main roster form automatically

### 2. Scan Process Path

**Method 1: Barcode Scanner**
- Scan the process path barcode (e.g., CB, DM, SORT)
- The current path indicator will turn green and show the path name

**Method 2: Click Reference Card**
- Click on any path card in the reference guide at the bottom
- The path will be automatically set

**Method 3: Type Manually**
- Type the path code in the "Scan Process Path Barcode" field
- Press Enter

### 3. Scan Associate Badge

Once a path is set:
- The associate badge input field becomes active (blue border)
- Scan or type the associate's badge ID or employee ID
- Press Enter

### 4. Confirm Assignment

After scanning:
- ✅ **Success**: Green status shows associate name + path assignment
- ❌ **Error**: Red status shows validation error (not found, wrong site, etc.)
- The recent scans list updates with timestamp and details

### 5. Continue Scanning

- The path remains active for multiple associate scans
- Just keep scanning badges to assign them to the same path
- Click "Clear Path" or scan a new path barcode to change paths

---

## Process Path Codes

| Code | Process Path | Code | Process Path |
|------|-------------|------|-------------|
| **CB** | Case Breakdown | **DOCKWS** | Dock Waterspider |
| **DM** | Decant Mez | **IBWS** | Inbound Waterspider |
| **PB** | Pick Buffer | **OBWS** | Outbound Waterspider |
| **E2S** | Each to Sorter | **SORT** | Sort |
| **PACK** | Pack | **CRETS** | CRETs Process |
| **PA** | Process Assistant | **PS** | Problem Solver |
| **LABORSHARE** | Labor Share | **AO5S** | AO/5S |

---

## Validation Rules

### Site Eligibility
- **YHM2 associates** → Can only work at YHM2
- **YDD2/YDD4 associates** → Can work at either YDD2 or YDD4
- Cross-site violations will show error and block assignment

### Associate Not Found
If an associate isn't in the roster:
- Error message shows: "Associate not found: [ID]"
- Manager can upload roster or add associate manually via main form

### Missing Context
If date is not set:
- Error message prompts to set the date before scanning

---

## Analytics Integration

Every manual scan is logged to `STATE.analytics.history` with:

```javascript
{
  badgeId: "12345",
  name: "John Doe",
  action: "assign",
  toLocation: "cb",
  timestamp: 1700000000000,
  method: "manual_scan",  // ← Distinguishes from drag-drop
  scanContext: {
    date: "2025-11-19",
    shift: "day",
    site: "YDD2",
    shiftCode: "DA",
    scanner: "manual"
  }
}
```

### Rotation Fairness

Manual scans feed directly into the rotation scoring algorithm:
- Updates `processExperience` counts for the associate
- Calculates recency/frequency metrics
- Contributes to fairness variance calculations
- Shows in Analytics > Rotation tab

---

## Keyboard Shortcuts & Tips

- **Enter** - Confirm path or badge scan
- **Tab** - Navigate between fields
- **Escape** - Clear current input (custom implementation needed)

### Best Practices

1. **Set context once per shift** - Date/shift/site typically don't change
2. **Print barcode reference cards** - Place at each process station
3. **Use Recent Scans list** - Verify assignments were logged correctly
4. **Check Analytics tab** - Confirm scans appear in rotation history

---

## Troubleshooting

### Path input doesn't work
- Ensure you're in the Manual Scan tab
- Check that the path code matches exactly (case-insensitive)
- Valid codes: CB, DM, PB, E2S, DOCKWS, IBWS, OBWS, SORT, PACK, CRETS, PA, PS, LABORSHARE, AO5S

### Associate input disabled
- You must scan a path barcode first
- The green "Current Path" indicator should be visible
- Click "Clear Path" and rescan the path if needed

### Assignment not showing on board
- Manual scans update `STATE.badges` location
- Board should auto-refresh after each scan
- If not, switch to Site Board tab and back

### Scans not in analytics
- Check browser console for errors
- Run `debugManualScan()` in console to see scan history
- Verify `STATE.analytics.history` is initialized

---

## Debug Commands

Open browser console (F12) and run:

```javascript
// View manual scan state
debugManualScan()

// Shows:
// - Current path
// - Session context
// - Scan history (last 50)
// - Total scan count
```

---

## Use Cases

### Late Arrival
Associate arrives after board is locked:
1. Open Manual Scan tab
2. Scan their assigned path
3. Scan their badge
4. Assignment logged and rotation updated

### Labor Share Movement
YDD2 associate shared to YDD4:
1. Change site selector to YDD4
2. Scan destination path
3. Scan associate badge
4. System validates cluster eligibility

### VTO (Voluntary Time Off)
Associate takes VTO mid-shift:
1. Scan "UNASSIGNED" path (if implemented)
2. Scan their badge
3. Removes from active assignment

### Cross-Department Support
Associate from Pack helps Sort:
1. Scan SORT path
2. Scan associate badge
3. Logged as temporary assignment

---

## Data Persistence

Manual scans are saved to:
- **In-memory**: `STATE.badges`, `STATE.analytics.history`
- **Local Storage**: Auto-saves with main board state
- **Export**: Included in Analytics CSV export

---

## Future Enhancements

- [ ] Physical barcode labels generator (print from browser)
- [ ] Scanner auto-detect (USB HID barcode reader support)
- [ ] Undo last scan button
- [ ] Bulk scan mode (scan multiple badges for same path)
- [ ] Audio confirmation beep on successful scan
- [ ] QR code support for associate badges
- [ ] Mobile-responsive scanner view
- [ ] Backend API sync for multi-user scenarios

---

## Technical Details

### Implementation Files
- **index.html** (lines ~360-545): Manual Scan tab UI
- **app.js** (lines ~8810+): MANUAL_SCAN object with scan logic
- **styles.css** (lines ~1355+): Scanner input styling

### State Management
```javascript
MANUAL_SCAN = {
  currentPath: null,           // Active process path
  sessionContext: {},          // Date/shift/site/code
  scanHistory: [],             // Last 50 scans
  PATH_MAP: {...}             // Barcode → internal key mapping
}
```

### Integration Points
- Updates `STATE.badges[badgeId].loc`
- Updates `STATE.sites[site].assignments`
- Logs to `STATE.analytics.history`
- Triggers `renderAllBadges()` + `setCounts()`
- Saves via `saveToLocalStorage()`

---

## Contact & Support

For questions or issues:
1. Check browser console for debug logs
2. Run `debugManualScan()` to inspect state
3. Verify roster is loaded with associates
4. Ensure date/shift/site context is set

---

**Version**: 1.0  
**Last Updated**: November 19, 2025  
**Compatible With**: VLAB Labor Board Portal V2
