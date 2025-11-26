// Database Module
// Extracted from app.js

class RosterDatabase {
  constructor() {
    this.database = new Map(); // Primary key: User ID (fallback to EID if missing)
    this.loadDatabase();
    this.setupEventListeners();
    this.updateStatus();
  }
  
  setupEventListeners() {
    // Database management buttons
    const viewDatabaseBtn = document.getElementById('viewDatabaseBtn');
    const clearDatabaseBtn = document.getElementById('clearDatabaseBtn');
    const loadFromDatabaseBtn = document.getElementById('loadFromDatabaseBtn');
    const downloadLoginTemplateBtn = document.getElementById('downloadLoginTemplateBtn');
    const downloadAdjustmentTemplateBtn = document.getElementById('downloadAdjustmentTemplateBtn');
    
    if (viewDatabaseBtn) viewDatabaseBtn.addEventListener('click', this.viewDatabase.bind(this));
    if (clearDatabaseBtn) clearDatabaseBtn.addEventListener('click', this.clearDatabase.bind(this));
    if (loadFromDatabaseBtn) loadFromDatabaseBtn.addEventListener('click', this.loadFromDatabase.bind(this));
    if (downloadLoginTemplateBtn) downloadLoginTemplateBtn.addEventListener('click', this.downloadLoginTemplate.bind(this));
    if (downloadAdjustmentTemplateBtn) downloadAdjustmentTemplateBtn.addEventListener('click', this.downloadAdjustmentTemplate.bind(this));
    
    // File input for logins
    const loginInput = document.getElementById('logins');
    if (loginInput) {
      loginInput.addEventListener('change', this.handleLoginUpload.bind(this));
    }
  }
  
  // Load database from localStorage
  loadDatabase() {
    try {
      const saved = localStorage.getItem('vlab:rosterDatabase');
      if (saved) {
        const data = JSON.parse(saved);
        this.database = new Map(Object.entries(data.employees || {}));
        // Migration: reindex to User ID if values have userId field
        try {
          let migrated = 0;
          const reindexed = new Map();
          for (const [k, v] of this.database.entries()){
            const userId = (v.userId || v.handle || v['User ID'] || '').toString();
            const eid = (v.eid || v.id || '').toString();
            const key = userId || eid || k;
            if (key !== k) migrated++;
            reindexed.set(key, { ...v, id: key, userId: userId || v.userId || '', eid: eid || v.eid || '' });
          }
          if (migrated){
            console.info(`[DATABASE] Migrated ${migrated} keys to User ID primary key`);
            this.database = reindexed;
            this.saveDatabase();
          }
        } catch(e){ console.warn('[DATABASE] migration skipped', e); }
        console.log('[DATABASE] Loaded', this.database.size, 'employees from database');
      }
    } catch (error) {
      console.error('[DATABASE] Error loading database:', error);
      this.database = new Map();
    }
  }
  
  // Save database to localStorage
  saveDatabase() {
    try {
      const data = {
        employees: Object.fromEntries(this.database),
        lastUpdated: new Date().toISOString(),
        version: '1.0'
      };
      localStorage.setItem('vlab:rosterDatabase', JSON.stringify(data));
      console.log('[DATABASE] Saved', this.database.size, 'employees to database');
      this.updateStatus();
    } catch (error) {
      console.error('[DATABASE] Error saving database:', error);
    }
  }
  
  // Update database status display
  updateStatus() {
    const statusEl = document.getElementById('databaseStatus');
    if (statusEl) {
      const count = this.database.size;
      if (count === 0) {
        statusEl.textContent = 'Database: Empty';
        statusEl.className = 'text-xs text-gray-500';
      } else {
        statusEl.textContent = `Database: ${count} employees`;
        statusEl.className = 'text-xs text-green-600 font-medium';
      }
    }
  }
  
  // Add or update employee in database
  addEmployee(employee) {
    const userId = (employee.userId || employee.handle || employee['User ID'] || '').toString();
    const eid = (employee.eid || employee.id || employee['Employee ID'] || '').toString();
    const key = (userId || eid);
    if (!key) return;
    this.database.set(key, {
      id: key,
      userId: userId,
      eid: eid,
      name: employee.name,
      scode: employee.scode,
      site: employee.site,
      status: employee.status || 'Active',
      manager: employee.manager,
      departmentId: employee.departmentId,
      managementAreaId: employee.managementAreaId,
      shiftPattern: employee.shiftPattern,
      addedDate: employee.addedDate || new Date().toISOString(),
      _forceInclude: employee._forceInclude,
      _adjustmentDate: employee._adjustmentDate,
      _adjustmentShift: employee._adjustmentShift
    });
  }
  
  // Get employee from database
  getEmployee(idLike) {
    if (!idLike) return undefined;
    const key = idLike.toString();
    
    // 1. Try direct exact match
    let found = this.database.get(key);
    if (found) return found;
    
    // 2. Try case-insensitive search
    const lowerKey = key.toLowerCase();
    for (const [k, v] of this.database.entries()) {
        if (k.toLowerCase() === lowerKey) return v;
        if ((v.userId || '').toString().toLowerCase() === lowerKey) return v;
        if ((v.eid || '').toString().toLowerCase() === lowerKey) return v;
    }
    
    return undefined;
  }
  
  // Get all employees
  getAllEmployees() {
    return Array.from(this.database.values());
  }
  
  // Update database with current roster
  updateDatabase() {
    const STATE = window.STATE;
    const TOAST = window.TOAST;
    
    const confirmed = confirm(
      `Update permanent database with current roster?\n\n` +
      `This will add new employees and update existing ones.\n` +
      `Current database: ${this.database.size} employees\n` +
      `Current roster: ${Object.keys(STATE.badges).length} associates`
    );
    
    if (!confirmed) return;
    
    let addedCount = 0;
    let updatedCount = 0;
    
    // Add all current associates to database
    Object.values(STATE.badges).forEach(badge => {
      const existing = this.getEmployee(badge.handle || badge.eid);
      if (existing) {
        // Update existing employee
        existing.name = badge.name;
        existing.scode = badge.scode;
        existing.site = badge.site;
        existing.status = badge.status || 'Active';
        existing.lastSeen = new Date().toISOString();
        updatedCount++;
      } else {
        // Add new employee
        this.addEmployee({
          userId: badge.handle,
          eid: badge.eid,
          name: badge.name,
          scode: badge.scode,
          site: badge.site,
          status: badge.status || 'Active'
        });
        addedCount++;
      }
    });
    
    this.saveDatabase();
    if (TOAST) TOAST.show(`📊 Database updated: ${addedCount} added, ${updatedCount} updated`, 'success');
  }
  
  // Handle login file upload
  async handleLoginUpload(event) {
    const TOAST = window.TOAST;
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('[LOGINS] Processing login file:', file.name);
    
    try {
      const csvText = await this.readFileAsText(file);
      const loginData = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim()
      });
      
      if (loginData.errors.length > 0) {
        console.warn('[LOGINS] CSV parsing errors:', loginData.errors);
      }
      
      await this.processLogins(loginData.data);
      
      // Clear the file input
      event.target.value = '';
      const label = document.getElementById('label-logins');
      if (label) label.textContent = '';
      
    } catch (error) {
      console.error('[LOGINS] Error processing login file:', error);
      if (TOAST) TOAST.show('Error processing login file: ' + error.message, 'error');
    }
  }
  
  // Process login data and match against database
  async processLogins(loginData) {
    const TOAST = window.TOAST;
    if (this.database.size === 0) {
      if (TOAST) TOAST.show('Database is empty. Please upload a roster first to build the database.', 'warning');
      return;
    }
    
    const matchedEmployees = [];
    const unmatchedLogins = [];
    
    // Extract employee IDs from login data
    const loginIds = new Set();
    loginData.forEach(row => {
      // Try multiple common column names for employee ID
      const possibleIds = [
        row['Employee ID'], row['ID'], row['EID'], row['EmployeeID'],
        row['Badge'], row['BadgeID'], row['Login'], row['Associate ID']
      ].filter(id => id);
      
      if (possibleIds.length > 0) {
        const id = possibleIds[0].toString().trim();
        if (id) loginIds.add(id);
      }
    });
    
    console.log('[LOGINS] Found', loginIds.size, 'unique login IDs');
    
    // Match login IDs against database
    loginIds.forEach(loginId => {
      const employee = this.getEmployee(loginId);
      if (employee) {
        matchedEmployees.push(employee);
      } else {
        unmatchedLogins.push(loginId);
      }
    });
    
    if (matchedEmployees.length === 0) {
      if (TOAST) TOAST.show('No matching employees found in database. Check login file format.', 'warning');
      return;
    }
    
    // Clear current badges and create new ones for matched employees
    this.loadMatchedEmployees(matchedEmployees);
    
    // Show results
    let message = `✅ Loaded ${matchedEmployees.length} present associates from database`;
    if (unmatchedLogins.length > 0) {
      message += `\n⚠️ ${unmatchedLogins.length} logins not found in database`;
      console.warn('[LOGINS] Unmatched IDs:', unmatchedLogins);
    }
    
    if (TOAST) TOAST.show(message, 'success');
  }
  
  // Load matched employees as badges
  loadMatchedEmployees(employees) {
    const STATE = window.STATE;
    const applySiteFilter = window.applySiteFilter;
    const renderAllBadges = window.renderAllBadges;
    const setCounts = window.setCounts;
    const saveSnapshot = window.saveSnapshot;

    // Clear current state
    STATE.badges = {};
    
    employees.forEach(emp => {
      const badgeId = `b_${emp.eid}`;
      STATE.badges[badgeId] = {
        id: badgeId,
        name: emp.name,
        eid: emp.eid,
        scode: emp.scode,
        site: emp.site,
        present: true,
        loc: 'unassigned',
        hidden: false
      };
    });
    
    // Apply site filtering
    if (typeof applySiteFilter === 'function') applySiteFilter();
    
    // Render badges
    if (typeof renderAllBadges === 'function') renderAllBadges();
    if (typeof setCounts === 'function') setCounts();
    
    // Save snapshot
    if (typeof saveSnapshot === 'function') saveSnapshot();
    
    console.log('[LOGINS] Loaded', employees.length, 'employees from database');
  }
  
  // View database contents
  viewDatabase() {
    if (this.database.size === 0) {
      alert('Database is empty. Upload a roster to build the database.');
      return;
    }
    
    const employees = this.getAllEmployees();
    const sites = {};
    
    // Group by site
    employees.forEach(emp => {
      if (!sites[emp.site]) sites[emp.site] = [];
      sites[emp.site].push(emp);
    });
    
    let message = `Roster Database (${employees.length} employees)\n\n`;
    
    Object.keys(sites).sort().forEach(site => {
      message += `${site}: ${sites[site].length} employees\n`;
      sites[site].slice(0, 5).forEach(emp => {
        message += `  • ${emp.name} (${emp.eid}) - ${emp.scode}\n`;
      });
      if (sites[site].length > 5) {
        message += `  ... and ${sites[site].length - 5} more\n`;
      }
      message += '\n';
    });
    
    alert(message);
  }
  
  // Clear database
  clearDatabase() {
    const STATE = window.STATE;
    const TOAST = window.TOAST;
    const ANALYTICS = window.ANALYTICS;
    const TILES = window.TILES;
    const setCounts = window.setCounts;

    const confirmed = confirm(
      `Clear the entire roster database and current board?\n\n` +
      `This will permanently delete ${this.database.size} employees from the database\n` +
      `and remove all current assignments.\n` +
      `This action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    // Clear the database
    this.database.clear();
    localStorage.removeItem('vlab:rosterDatabase');
    
    // Clear all current assignments and badges
    STATE.badges = {};
    STATE.sites = {
      YDD2: { assignments: {} },
      YDD4: { assignments: {} },
      YHM2: { assignments: {} }
    };
    
    // Clear quarter assignments
    STATE.quarterAssignments = {};
    
    // Clear all tiles and unassigned stack
    const unassignedStack = document.getElementById('unassignedStack');
    if (unassignedStack) unassignedStack.innerHTML = '';
    
    if (TILES) {
      TILES.forEach(([tileId, tileKey]) => {
        const tile = document.getElementById(tileId);
        if (tile) {
          const badgeLayer = tile.querySelector('.badge-layer');
          if (badgeLayer) badgeLayer.innerHTML = '';
        }
      });
    }
    
    // Clear localStorage assignments and all roster data
    localStorage.removeItem('vlab:assignments');
    localStorage.removeItem('vlab:currentRoster');
    localStorage.removeItem('vlab:lastRoster');
    localStorage.removeItem('vlab:quarterAssignments');
    localStorage.removeItem('vlab:analytics');
    
    // Update counts and status
    if (typeof setCounts === 'function') setCounts();
    this.updateStatus();
    
    // Clear analytics session
    if (ANALYTICS) {
      ANALYTICS.endSession();
    }
    
    if (TOAST) TOAST.show('🗑️ Database and board cleared completely', 'info');
    
    // Small delay then refresh page to ensure everything is cleared
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }

  // Load from database without requiring file upload
  loadFromDatabase() {
    const STATE = window.STATE;
    const TOAST = window.TOAST;
    const ANALYTICS = window.ANALYTICS;
    const classifySite = window.classifySite;
    const shiftCodeOf = window.shiftCodeOf;
    const parseInputDate = window.parseInputDate;
    const getAllowedCodes = window.getAllowedCodes;
    const applySiteFilter = window.applySiteFilter;
    const renderAllBadges = window.renderAllBadges;
    const setCounts = window.setCounts;
    const renderHeadcountOverview = window.renderHeadcountOverview;

    if (this.database.size === 0) {
      if (TOAST) TOAST.show('Database is empty. Please upload a roster file first.', 'warning');
      return;
    }

    console.log('[DATABASE] Loading all employees from database...');
    
    // Get scheduling values (controls were moved out of the upload form)
    const siteSel = document.getElementById('site')?.value || 'YHM2';
    const shiftSel = document.querySelector('input[name="shift"]:checked')?.value || 'day';
    const quarterSel = document.getElementById('quarter')?.value || 'Q1';
    const dateStr = document.getElementById('date')?.value || '';
    
    // Update current site and quarter
    STATE.currentSite = siteSel;
    STATE.currentQuarter = quarterSel;
    
    // Update display elements
    const elDate = document.getElementById('displayDate');
    const elDay = document.getElementById('displayDay');
    const elShift = document.getElementById('displayShift');
    const elType = document.getElementById('displayShiftType');
    const elSite = document.getElementById('displaySite');
    const elPlan = document.getElementById('displayPlannedHC');
    const elActual = document.getElementById('displayActualHC');
    
    if (elDate) elDate.textContent = dateStr || '-';
    if (elSite) elSite.textContent = siteSel;
    if (elShift) elShift.textContent = shiftSel[0].toUpperCase() + shiftSel.slice(1);
    if (elActual) elActual.textContent = '0';
    
    // Parse date for day calculation
    const d = typeof parseInputDate === 'function' ? parseInputDate(dateStr) : new Date(dateStr);
    const dow = d?.getDay() ?? 0;
    const shortDay = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    if (elDay) elDay.textContent = d ? shortDay[dow] : '-';
    
    // Update shift type
    const shiftTypeMap = {
      day:   {0:'FHD',1:'FHD',2:'FHD',3:'FHD',4:'BHD',5:'BHD',6:'BHD'},
      night: {0:'FHN',1:'FHN',2:'FHN',3:'FHN',4:'BHN',5:'BHN',6:'BHN'}
    };
    if (elType) elType.textContent = shiftTypeMap[shiftSel][dow];
    
    // Clear current badges and load all from database
    STATE.badges = {};
    const allEmployees = this.getAllEmployees();
    
    console.log(`[DATABASE] Creating badges for ${allEmployees.length} employees for site: ${siteSel}`);
    
    allEmployees.forEach(emp => {
      const badgeId = `b_${emp.eid}`;
      // Prefer normalized site stored in database; fall back to classifier for raw CSV rows
      const site = (emp.site || emp.Site) ? String(emp.site || emp.Site).toUpperCase() : (typeof classifySite === 'function' ? classifySite(emp) : 'Unknown');
      
      // Skip ICQA associates
      if (site === 'Other') return;
      
      // Site-specific filtering during badge creation
      let shouldInclude = false;
      if (siteSel === 'YHM2' && site === 'YHM2') {
        shouldInclude = true;
      } else if ((siteSel === 'YDD2' || siteSel === 'YDD4') && (site === 'YDD2' || site === 'YDD4' || site === 'YDD_SHARED')) {
        shouldInclude = true;
      }
      
      if (!shouldInclude) {
        console.log(`[DATABASE] Filtering out ${emp.name} - site ${site} not compatible with ${siteSel}`);
        return;
      }
      
      // Check adjustment date/shift validity
      if (emp._forceInclude && emp._adjustmentDate) {
        const adjDate = String(emp._adjustmentDate || '').trim();
        const adjShift = String(emp._adjustmentShift || '').trim();
        const currDate = String(dateStr || '').trim();
        const currShift = String(shiftSel || '').trim();
        
        if (adjDate !== currDate || (adjShift && adjShift !== currShift)) {
          console.log(`[DATABASE] Filtering out adjustment ${emp.name} - date/shift mismatch (${adjDate}/${adjShift} vs ${currDate}/${currShift})`);
          return;
        }
      }
      
      // Shift pattern filtering for specific date and shift
      const empShiftPattern = emp.shiftPattern || emp['Shift Pattern'] || '';
      const empShiftCode = (emp.scode || emp.shiftCode || '').toString().toUpperCase() || (typeof shiftCodeOf === 'function' ? shiftCodeOf(empShiftPattern) : '');
      
      // Get allowed shift codes for the current date and shift
      // Use raw date string for getAllowedCodes (it parses internally)
      if (dateStr && shiftSel && typeof getAllowedCodes === 'function') {
        const allowedCodes = getAllowedCodes(dateStr, shiftSel);
        
        // Skip shift code check if employee is force-included (adjustment)
        const isForced = !!(emp._forceInclude);
        
        /* 
           REMOVED filtering logic from loadFromDatabase as requested.
           The Site Board now uses ROSTER.exportToBoard() which relies on the Roster tab's pre-filtered list.
           This function is now primarily for initial database population or legacy calls.
        */
        /*
        if (!isForced && allowedCodes.length > 0 && !allowedCodes.includes(empShiftCode)) {
          console.log(`[DATABASE] Filtering out ${emp.name} - shift code ${empShiftCode} not allowed for ${shiftSel} shift on ${dateStr}`);
          return;
        } else if (allowedCodes.length > 0) {
          console.log(`[DATABASE] Including ${emp.name} - shift code ${empShiftCode} allowed for ${shiftSel} shift`);
        }
        */
      }
      
      STATE.badges[badgeId] = {
        id: badgeId,
        name: emp.name,
        eid: emp.eid,
        scode: emp.scode || (typeof shiftCodeOf === 'function' ? shiftCodeOf(emp.shiftPattern || '') : ''),
        site: (site === 'OTHER' ? 'Other' : site),
        present: true,
        loc: 'unassigned',
        hidden: false,
        isAdjustment: !!emp._forceInclude
      };
    });
    
    console.log(`[DATABASE] Created ${Object.keys(STATE.badges).length} badges for site ${siteSel}`);
    
    // Apply site and shift filtering
    if (typeof applySiteFilter === 'function') applySiteFilter();
    
    // Count visible badges
    const visibleBadges = Object.values(STATE.badges).filter(b => !b.hidden);
    
    // Update planned HC
    if (elPlan) elPlan.textContent = String(visibleBadges.length);
    
    // Render badges
    if (typeof renderAllBadges === 'function') renderAllBadges();
    if (typeof setCounts === 'function') setCounts();
    
    // Start analytics session
    if (ANALYTICS) {
      ANALYTICS.endSession();
      ANALYTICS.startSession({
        date: dateStr,
        shift: shiftSel,
        site: siteSel,
        plannedHC: visibleBadges.length,
        notes: `Loaded from database: ${visibleBadges.length} associates for ${siteSel}`
      });
    }
    
    // Save snapshot
    try {
      const snap = {
        badges: STATE.badges,
        sites: STATE.sites,
        currentSite: STATE.currentSite,
        meta: { date: dateStr, shift: shiftSel, site: siteSel, plannedHC: visibleBadges.length, quarter: STATE.currentQuarter }
      };
      localStorage.setItem('vlab:lastRoster', JSON.stringify(snap));
    } catch (_) {}
    
    // Update output message
    const output = document.getElementById('output');
    if (output) {
      const message = `🔄 Loaded from Database: ${visibleBadges.length} associates for ${siteSel}`;
      output.innerHTML = `<div style="color: #059669; font-weight: 500;">${message}</div>`;
    }
    
    if (TOAST) TOAST.show(`✅ Loaded ${visibleBadges.length} associates from database`, 'success');
    
    console.log('[DATABASE] Load from database complete');
    // Refresh roster overview & filters with database-backed data
    try{ if (typeof renderHeadcountOverview === 'function') renderHeadcountOverview(); }catch(_){ }
  }
  
  // Download login template
  downloadLoginTemplate() {
    const csvContent = [
      'Employee ID',
      '1234567',
      '7654321',
      '1122334'
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'login-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Download adjustments template
  downloadAdjustmentTemplate() {
    const TOAST = window.TOAST;
    const csvContent = [
      'User ID,Action,Date',
      'qruchikr,SWAPIN,2025-11-11',
      'ipanidhi,VET,2025-11-11',
      'sgrupind,SWAPOUT,2025-11-11',
      'manachha,VTO,2025-11-11',
      'extworker1,LS_IN,2025-11-11',
      'ourworker2,LS_OUT,2025-11-11'
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'adjustments_template.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (TOAST) TOAST.show('📥 Adjustments template downloaded','info');
  }
  
  // Helper to read file as text
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = e => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
}

// Initialize roster database
window.RosterDatabase = RosterDatabase;
window.DATABASE = new RosterDatabase();

// Assignment History Manager
class AssignmentHistoryManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 50;
    this.setupKeyboardShortcuts();
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
      }
    });
  }

  // Record an action for undo
  record(action) {
    // action: { type: 'move', badgeId, fromLoc, toLoc, fromSite, toSite, timestamp }
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    // Clear redo stack on new action
    this.redoStack = [];
    this.updateUI();
  }

  // Undo last action
  undo() {
    if (this.undoStack.length === 0) return;

    const action = this.undoStack.pop();
    this.redoStack.push(action);

    this.revertAction(action);
    this.updateUI();
    
    const TOAST = window.TOAST;
    if (TOAST) TOAST.show('Undo: ' + this.getActionDescription(action), 'info');
  }

  // Redo last undone action
  redo() {
    if (this.redoStack.length === 0) return;

    const action = this.redoStack.pop();
    this.undoStack.push(action);

    this.applyAction(action);
    this.updateUI();

    const TOAST = window.TOAST;
    if (TOAST) TOAST.show('Redo: ' + this.getActionDescription(action), 'info');
  }

  // Revert an action
  revertAction(action) {
    const STATE = window.STATE;
    const updateBadgeVisuals = window.updateBadgeVisuals;
    const setCounts = window.setCounts;
    const saveSnapshot = window.saveSnapshot;

    if (action.type === 'move') {
      const badge = STATE.badges[action.badgeId];
      if (!badge) return;

      // Move back to original location
      badge.loc = action.fromLoc;
      
      // Handle site change if needed
      if (action.fromSite && action.fromSite !== action.toSite) {
        badge.site = action.fromSite;
        
        // Update site assignments
        if (STATE.sites[action.toSite] && STATE.sites[action.toSite].assignments) {
          delete STATE.sites[action.toSite].assignments[action.badgeId];
        }
        if (STATE.sites[action.fromSite]) {
           if (!STATE.sites[action.fromSite].assignments) STATE.sites[action.fromSite].assignments = {};
           STATE.sites[action.fromSite].assignments[action.badgeId] = action.fromLoc;
        }
      }

      // Update UI
      const badgeEl = document.getElementById(action.badgeId);
      if (badgeEl) {
        // Move element to old container
        let container;
        if (action.fromLoc === 'unassigned') {
          container = document.getElementById('unassignedStack');
        } else {
          // Find tile with this key
          const TILES = window.TILES;
          const tileEntry = TILES.find(t => t[1] === action.fromLoc);
          if (tileEntry) {
            const tileEl = document.getElementById(tileEntry[0]);
            if (tileEl) container = tileEl.querySelector('.badge-layer');
          }
        }

        if (container) {
          container.appendChild(badgeEl);
        }
        
        if (typeof updateBadgeVisuals === 'function') updateBadgeVisuals(badge);
      }
      
      if (typeof setCounts === 'function') setCounts();
      if (typeof saveSnapshot === 'function') saveSnapshot();
    }
  }

  // Apply an action (for redo)
  applyAction(action) {
    const STATE = window.STATE;
    const updateBadgeVisuals = window.updateBadgeVisuals;
    const setCounts = window.setCounts;
    const saveSnapshot = window.saveSnapshot;

    if (action.type === 'move') {
      const badge = STATE.badges[action.badgeId];
      if (!badge) return;

      // Move to new location
      badge.loc = action.toLoc;
      
      // Handle site change
      if (action.toSite && action.fromSite !== action.toSite) {
        badge.site = action.toSite;
        
        // Update site assignments
        if (STATE.sites[action.fromSite] && STATE.sites[action.fromSite].assignments) {
          delete STATE.sites[action.fromSite].assignments[action.badgeId];
        }
        if (STATE.sites[action.toSite]) {
           if (!STATE.sites[action.toSite].assignments) STATE.sites[action.toSite].assignments = {};
           STATE.sites[action.toSite].assignments[action.badgeId] = action.toLoc;
        }
      }

      // Update UI
      const badgeEl = document.getElementById(action.badgeId);
      if (badgeEl) {
        // Move element to new container
        let container;
        if (action.toLoc === 'unassigned') {
          container = document.getElementById('unassignedStack');
        } else {
          const TILES = window.TILES;
          const tileEntry = TILES.find(t => t[1] === action.toLoc);
          if (tileEntry) {
            const tileEl = document.getElementById(tileEntry[0]);
            if (tileEl) container = tileEl.querySelector('.badge-layer');
          }
        }

        if (container) {
          container.appendChild(badgeEl);
        }
        
        if (typeof updateBadgeVisuals === 'function') updateBadgeVisuals(badge);
      }
      
      if (typeof setCounts === 'function') setCounts();
      if (typeof saveSnapshot === 'function') saveSnapshot();
    }
  }

  getActionDescription(action) {
    if (action.type === 'move') {
      const badge = window.STATE.badges[action.badgeId];
      const name = badge ? badge.name : 'Associate';
      return `Moved ${name} to ${action.toLoc}`;
    }
    return 'Unknown action';
  }

  updateUI() {
    // Optional: Update undo/redo buttons if they exist
  }
}

// Initialize history manager
window.AssignmentHistoryManager = AssignmentHistoryManager;
window.HISTORY = new AssignmentHistoryManager();

// Debug Functions
window.debugYDD4Assignments = function() {
  const STATE = window.STATE;
  console.log('--- YDD4 Assignments Debug ---');
  const ydd4 = STATE.sites.YDD4.assignments;
  console.log('YDD4 Assignments Map:', ydd4);
  
  let count = 0;
  Object.entries(ydd4).forEach(([bid, loc]) => {
    const badge = STATE.badges[bid];
    console.log(`${bid}: ${loc} (Badge Site: ${badge?.site}, Badge Loc: ${badge?.loc})`);
    if (badge?.site === 'YDD4') count++;
  });
  console.log(`Total YDD4 badges: ${count}`);
};

window.debugRotation = function() {
  const ANALYTICS = window.ANALYTICS;
  if (ANALYTICS && ANALYTICS.rotationEngine) {
    console.log('Rotation Engine State:', ANALYTICS.rotationEngine);
    console.log('Moves:', ANALYTICS.rotationEngine.moves);
  } else {
    console.log('Rotation Engine not initialized');
  }
};

window.debugStorage = function() {
  console.log('--- LocalStorage Debug ---');
  console.log('vlab:lastRoster:', localStorage.getItem('vlab:lastRoster') ? 'Present' : 'Missing');
  console.log('vlab:rosterDatabase:', localStorage.getItem('vlab:rosterDatabase') ? 'Present' : 'Missing');
  console.log('vlab:analytics:', localStorage.getItem('vlab:analytics') ? 'Present' : 'Missing');
};

window.debugAnalytics = function() {
  const STATE = window.STATE;
  console.log('--- Analytics Debug ---');
  console.log('History length:', STATE.analytics.history.length);
  console.log('Current Session:', STATE.analytics.sessionStart);
  console.log('Last 5 events:', STATE.analytics.history.slice(-5));
};

window.debugResetAnalytics = function() {
  const STATE = window.STATE;
  if (confirm('Reset all analytics history?')) {
    STATE.analytics.history = [];
    localStorage.removeItem('vlab:analytics');
    console.log('Analytics history cleared');
  }
};

window.debugForceRefresh = function() {
  const renderAllBadges = window.renderAllBadges;
  const setCounts = window.setCounts;
  console.log('Forcing full refresh...');
  if (typeof renderAllBadges === 'function') renderAllBadges();
  if (typeof setCounts === 'function') setCounts();
  console.log('Refresh complete');
};

window.debugYDDAssignments = function() {
  const STATE = window.STATE;
  const MULTISITE = window.MULTISITE;
  console.group('🔍 YDD2/YDD4 Assignment Debug');
  
  console.log('Current site:', STATE.currentSite);
  console.log('YDD2 assignments:', STATE.sites?.YDD2?.assignments || {});
  console.log('YDD4 assignments:', STATE.sites?.YDD4?.assignments || {});
  
  // Check badge locations for YDD associates
  const yddBadges = Object.values(STATE.badges || {}).filter(b => 
    b.site === 'YDD2' || b.site === 'YDD4'
  );
  
  console.log(`Total YDD badges: ${yddBadges.length}`);
  
  yddBadges.forEach(badge => {
    const inYDD2 = STATE.sites?.YDD2?.assignments?.[badge.id];
    const inYDD4 = STATE.sites?.YDD4?.assignments?.[badge.id];
    console.log(`${badge.name} (${badge.site}): loc=${badge.loc}, YDD2=${inYDD2 || 'none'}, YDD4=${inYDD4 || 'none'}`);
  });
  
  // Check localStorage specifically for YDD assignments
  const saved = localStorage.getItem('vlab:lastRoster');
  if (saved) {
    const data = JSON.parse(saved);
    console.log('Saved YDD2 assignments:', data.sites?.YDD2?.assignments || {});
    console.log('Saved YDD4 assignments:', data.sites?.YDD4?.assignments || {});
  }
  
  console.groupEnd();
};

window.debugQuarterAssignments = function() {
  const STATE = window.STATE;
  console.group('📊 Quarter Assignment Debug');
  
  console.log('Current quarter:', STATE.currentQuarter);
  console.log('Quarter assignments:', STATE.quarterAssignments);
  console.log('Quarter locks:', STATE.quarterLocks);
  
  // Check localStorage
  const saved = localStorage.getItem('vlab:quarterAssignments');
  if (saved) {
    console.log('Saved quarter assignments:', JSON.parse(saved));
  }
  
  // Check analytics history per quarter
  const historyByQuarter = {};
  if (STATE.analytics && STATE.analytics.history) {
    STATE.analytics.history.forEach(entry => {
      const q = entry.quarter || 'Unknown';
      if (!historyByQuarter[q]) historyByQuarter[q] = [];
      historyByQuarter[q].push(entry);
    });
  }
  
  console.log('Analytics history by quarter:');
  Object.keys(historyByQuarter).forEach(quarter => {
    console.log(`  ${quarter}: ${historyByQuarter[quarter].length} entries`);
  });
  
  // Check for duplicates
  const duplicates = STATE.analytics.history.filter((entry, index, array) => {
    return array.findIndex(e => 
      e.badgeId === entry.badgeId && 
      e.toLocation === entry.toLocation && 
      Math.abs(new Date(e.timestamp) - new Date(entry.timestamp)) < 1000
    ) !== index;
  });
  
  console.log(`Found ${duplicates.length} potential duplicates in analytics`);
  
  console.groupEnd();
};

window.fixQuarterAssignments = function() {
  const STATE = window.STATE;
  const ANALYTICS = window.ANALYTICS;
  console.log('🔧 Fixing quarter assignment data...');
  
  // Remove duplicates from analytics
  const uniqueHistory = [];
  const seen = new Set();
  
  STATE.analytics.history.forEach(entry => {
    const key = `${entry.badgeId}-${entry.toLocation}-${entry.timestamp}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueHistory.push(entry);
    }
  });
  
  const removedDuplicates = STATE.analytics.history.length - uniqueHistory.length;
  STATE.analytics.history = uniqueHistory;
  
  // Save cleaned data
  if (ANALYTICS) ANALYTICS.saveAnalyticsData();
  localStorage.setItem('vlab:quarterAssignments', JSON.stringify(STATE.quarterAssignments));
  
  console.log(`✅ Removed ${removedDuplicates} duplicates from analytics history`);
  console.log('✅ Saved cleaned quarter assignments');
};

window.testYDD4Persistence = function() {
  const STATE = window.STATE;
  const MULTISITE = window.MULTISITE;
  console.group('🧪 YDD4 Assignment Persistence Test');
  
  // Switch to YDD4 and check assignments
  if (STATE.currentSite !== 'YDD4') {
    console.log('Switching to YDD4 to test assignments...');
    if (MULTISITE) MULTISITE.switchToSite('YDD4');
  }
  
  // Count visible YDD badges and their assignments
  const visibleYDDBadges = Object.values(STATE.badges).filter(badge => 
    !badge.hidden && (badge.site === 'YDD2' || badge.site === 'YDD4')
  );
  
  const assignedYDDBadges = visibleYDDBadges.filter(badge => 
    badge.loc !== 'unassigned' && badge.loc !== 'assigned-elsewhere'
  );
  
  console.log(`Visible YDD badges in YDD4: ${visibleYDDBadges.length}`);
  console.log(`Assigned YDD badges in YDD4: ${assignedYDDBadges.length}`);
  
  // Show specific assignments
  assignedYDDBadges.forEach(badge => {
    console.log(`  ${badge.name} → ${badge.loc}`);
  });
  
  // Check if YDD4 site assignments match badge locations
  const ydd4SiteAssignments = STATE.sites?.YDD4?.assignments || {};
  const ydd4AssignmentCount = Object.keys(ydd4SiteAssignments).length;
  
  console.log(`YDD4 site assignments: ${ydd4AssignmentCount}`);
  console.log('YDD4 assignments:', ydd4SiteAssignments);
  
  // Check localStorage consistency
  const saved = localStorage.getItem('vlab:lastRoster');
  if (saved) {
    const data = JSON.parse(saved);
    const savedYDD4Assignments = data.sites?.YDD4?.assignments || {};
    console.log('Saved YDD4 assignments count:', Object.keys(savedYDD4Assignments).length);
    console.log('Saved YDD4 assignments:', savedYDD4Assignments);
  }
  
  console.groupEnd();
};
