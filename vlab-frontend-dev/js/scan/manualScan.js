// Manual Scan Module
// Extracted from app.js

window.MANUAL_SCAN = {
  currentPath: null,
  sessionContext: {},
  scanHistory: [],

  // Path barcode mapping (uppercase keys for case-insensitive matching)
  PATH_MAP: {
    'CB': 'cb',
    'DM': 'dm',
    'PB': 'pb',
    'E2S': 'e2s',
    'DOCKWS': 'dockws',
    'IBWS': 'ibws',
    'OBWS': 'obws',
    'SORT': 'sort',
    'PACK': 'pack',
    'CRETS': 'crets',
    'PA': 'pa',
    'PS': 'ps',
    'LABORSHARE': 'laborshare',
    'AO5S': 'ao5s'
  },

  // Initialize manual scan mode
  init() {
    console.log('[MANUAL_SCAN] Initializing...');
    
    // Set today's date by default
    const dateInput = document.getElementById('scan_date');
    if (dateInput && !dateInput.value) {
      const today = new Date().toISOString().split('T')[0];
      dateInput.value = today;
    }

    // Sync shift with main form if available
    const mainShift = document.querySelector('input[name="shift"]:checked')?.value;
    if (mainShift) {
      document.getElementById('scan_shift').value = mainShift;
    }

    // Sync site with main form if available
    // STATE is global now
    const mainSite = document.getElementById('site')?.value || (window.STATE && window.STATE.currentSite);
    if (mainSite) {
      document.getElementById('scan_site').value = mainSite;
    }

    // Path input handler
    const pathInput = document.getElementById('scan_path_input');
    if (pathInput) {
      pathInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handlePathScan(pathInput.value.trim());
          pathInput.value = '';
        }
      });
    }

    // Associate input handler
    const associateInput = document.getElementById('scan_associate_input');
    if (associateInput) {
      associateInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleAssociateScan(associateInput.value.trim());
          associateInput.value = '';
        }
      });
    }

    // Clear path button
    const clearPathBtn = document.getElementById('scan_clear_path');
    if (clearPathBtn) {
      clearPathBtn.addEventListener('click', () => {
        this.clearCurrentPath();
      });
    }

    console.log('[MANUAL_SCAN] Initialization complete');
  },

  // Handle clicking on path reference cards
  setupPathCardClickHandlers() {
    // This will be called when manual scan tab is shown
    const pathCards = document.querySelectorAll('#tab-manualScan .bg-white.border.rounded.p-2.text-center');
    pathCards.forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const pathCode = card.querySelector('.font-mono')?.textContent?.trim();
        if (pathCode) {
          this.handlePathScan(pathCode);
          // Also set the path input value
          const pathInput = document.getElementById('scan_path_input');
          if (pathInput) {
            pathInput.value = pathCode;
          }
        }
      });
    });
  },

  // Handle path barcode scan
  handlePathScan(scannedValue) {
    if (!scannedValue) return;

    const pathKey = scannedValue.toUpperCase();
    const mappedPath = this.PATH_MAP[pathKey];

    if (!mappedPath) {
      this.showStatus('error', `Unknown path code: ${scannedValue}`);
      return;
    }

    // Set current path
    this.currentPath = mappedPath;
    
    // Update UI
    const pathDisplay = document.getElementById('scan_current_path_display');
    const pathName = document.getElementById('scan_current_path_name');
    const associateInput = document.getElementById('scan_associate_input');

    if (pathDisplay && pathName && associateInput) {
      pathDisplay.classList.remove('hidden');
      pathName.textContent = pathKey;
      associateInput.disabled = false;
      associateInput.focus();
    }

    this.showStatus('success', `Path set to: ${pathKey} - Ready to scan associates`);
    console.log(`[MANUAL_SCAN] Path set to: ${mappedPath} (${pathKey})`);
  },

  // Handle associate badge scan
  handleAssociateScan(scannedValue) {
    if (!scannedValue) return;

    if (!this.currentPath) {
      this.showStatus('error', 'Please scan a path barcode first');
      return;
    }

    // Capture session context
    this.sessionContext = {
      date: document.getElementById('scan_date').value,
      shift: document.getElementById('scan_shift').value,
      site: document.getElementById('scan_site').value,
      shiftCode: document.getElementById('scan_shift_code').value
    };

    // Validate context
    if (!this.sessionContext.date) {
      this.showStatus('error', 'Please set the date');
      return;
    }

    // Find associate by badge ID or employee ID
    const associate = this.findAssociate(scannedValue);

    if (!associate) {
      this.showStatus('error', `Associate not found: ${scannedValue}`);
      this.showNotFoundPrompt(scannedValue);
      return;
    }

    // Validate site eligibility
    const validation = this.validateSiteEligibility(associate);
    if (!validation.valid) {
      this.showStatus('error', validation.message);
      return;
    }

    // Record the assignment
    this.recordAssignment(associate);
  },

  // Find associate in STATE.badges or DATABASE
  findAssociate(searchValue) {
    const search = searchValue.toLowerCase();
    const STATE = window.STATE;
    const DATABASE = window.DATABASE;

    // Search in STATE.badges first
    if (STATE && STATE.badges) {
      for (const badgeId in STATE.badges) {
        const badge = STATE.badges[badgeId];
        if (badge.id.toLowerCase() === search || 
            badge.eid.toLowerCase() === search ||
            badge.name.toLowerCase().includes(search)) {
          return badge;
        }
      }
    }

    // Search in DATABASE
    if (DATABASE) {
      const employees = DATABASE.getAllEmployees();
      for (const emp of employees) {
        if (emp.id?.toLowerCase() === search ||
            emp.eid?.toLowerCase() === search ||
            emp.employeeId?.toLowerCase() === search ||
            emp.name?.toLowerCase().includes(search)) {
          return emp;
        }
      }
    }

    return null;
  },

  // Validate site eligibility
  validateSiteEligibility(associate) {
    const scanSite = this.sessionContext.site;
    const associateSite = (associate.site || '').toUpperCase();

    // YHM2 associates can only work at YHM2
    if (associateSite === 'YHM2' && scanSite !== 'YHM2') {
      return {
        valid: false,
        message: `${associate.name} is YHM2 only - cannot assign to ${scanSite}`
      };
    }

    // YDD associates can work at YDD2 or YDD4
    const isYddAssociate = /^(YDD2|YDD4|YDD_SHARED|YDD)/.test(associateSite);
    const isYddScanSite = scanSite === 'YDD2' || scanSite === 'YDD4';

    if (isYddAssociate && !isYddScanSite && scanSite !== 'YHM2') {
      return {
        valid: false,
        message: `${associate.name} is YDD cluster - cannot assign to ${scanSite}`
      };
    }

    return { valid: true };
  },

  // Record manual scan assignment
  recordAssignment(associate) {
    const timestamp = Date.now();
    const badgeId = associate.id || associate.eid;
    const STATE = window.STATE;
    
    // Update badge location if in STATE.badges
    if (STATE.badges[badgeId]) {
      const oldLoc = STATE.badges[badgeId].loc;
      STATE.badges[badgeId].loc = this.currentPath;
      
      // Update site assignments
      Object.keys(STATE.sites).forEach(siteCode => {
        delete STATE.sites[siteCode].assignments[badgeId];
      });
      STATE.sites[this.sessionContext.site].assignments[badgeId] = this.currentPath;

      console.log(`[MANUAL_SCAN] Moved ${associate.name}: ${oldLoc} → ${this.currentPath}`);
    }

    // Log to analytics history
    if (STATE.analytics && STATE.analytics.history) {
      const historyEntry = {
        badgeId: badgeId,
        name: associate.name,
        eid: associate.eid || associate.employeeId,
        action: 'assign',
        fromLocation: 'manual_scan_entry',
        toLocation: this.currentPath,
        timestamp: timestamp,
        quarter: STATE.currentQuarter || 'Q1',
        method: 'manual_scan',
        scanContext: {
          date: this.sessionContext.date,
          shift: this.sessionContext.shift,
          site: this.sessionContext.site,
          shiftCode: this.sessionContext.shiftCode,
          scanner: 'manual'
        }
      };

      STATE.analytics.history.push(historyEntry);
      
      // Update performance metrics
      if (!STATE.analytics.performance[badgeId]) {
        STATE.analytics.performance[badgeId] = {
          totalAssignments: 0,
          processExperience: {},
          lastAssignment: null
        };
      }

      const perf = STATE.analytics.performance[badgeId];
      perf.totalAssignments += 1;
      perf.lastAssignment = timestamp;
      
      if (!perf.processExperience[this.currentPath]) {
        perf.processExperience[this.currentPath] = { count: 0, lastDate: null };
      }
      perf.processExperience[this.currentPath].count += 1;
      perf.processExperience[this.currentPath].lastDate = timestamp;

      console.log(`[MANUAL_SCAN] Logged to analytics:`, historyEntry);
    }

    // Add to scan history
    this.scanHistory.unshift({
      timestamp: timestamp,
      associate: associate.name,
      badgeId: badgeId,
      path: this.currentPath,
      pathDisplay: Object.keys(this.PATH_MAP).find(k => this.PATH_MAP[k] === this.currentPath),
      site: this.sessionContext.site
    });

    // Keep last 50 scans
    if (this.scanHistory.length > 50) {
      this.scanHistory = this.scanHistory.slice(0, 50);
    }

    // Update UI
    this.showStatus('success', `✓ ${associate.name} assigned to ${this.currentPath.toUpperCase()}`);
    this.updateRecentScans();
    
    // Re-render board if visible
    if (typeof window.renderAllBadges === 'function') {
      window.renderAllBadges();
    }
    if (typeof window.setCounts === 'function') {
      window.setCounts();
    }

    // Persist to storage
    if (typeof window.saveToLocalStorage === 'function') {
      window.saveToLocalStorage();
    }

    // Focus back to associate input for next scan
    const associateInput = document.getElementById('scan_associate_input');
    if (associateInput) {
      associateInput.focus();
    }
  },

  // Show status message
  showStatus(type, message) {
    const statusDisplay = document.getElementById('scan_status_display');
    const statusContent = document.getElementById('scan_status_content');

    if (!statusDisplay || !statusContent) return;

    statusDisplay.classList.remove('hidden');
    statusContent.className = 'rounded p-3 text-sm';

    if (type === 'success') {
      statusContent.classList.add('bg-green-100', 'border', 'border-green-400', 'text-green-800');
      statusContent.innerHTML = `<strong>✓</strong> ${message}`;
    } else if (type === 'error') {
      statusContent.classList.add('bg-red-100', 'border', 'border-red-400', 'text-red-800');
      statusContent.innerHTML = `<strong>✗</strong> ${message}`;
    } else {
      statusContent.classList.add('bg-blue-100', 'border', 'border-blue-400', 'text-blue-800');
      statusContent.innerHTML = message;
    }

    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusDisplay.classList.add('hidden');
    }, 3000);
  },

  // Show prompt for not found associate
  showNotFoundPrompt(scannedValue) {
    const statusContent = document.getElementById('scan_status_content');
    if (statusContent) {
      statusContent.innerHTML += `<br><small>Badge/ID: ${scannedValue} not in roster. Upload roster or add manually.</small>`;
    }
  },

  // Clear current path
  clearCurrentPath() {
    this.currentPath = null;
    
    const pathDisplay = document.getElementById('scan_current_path_display');
    const associateInput = document.getElementById('scan_associate_input');

    if (pathDisplay) {
      pathDisplay.classList.add('hidden');
    }
    if (associateInput) {
      associateInput.disabled = true;
      associateInput.value = '';
    }

    const pathInput = document.getElementById('scan_path_input');
    if (pathInput) {
      pathInput.focus();
    }

    this.showStatus('info', 'Path cleared - scan a new path barcode');
  },

  // Update recent scans display
  updateRecentScans() {
    const recentList = document.getElementById('scan_recent_list');
    if (!recentList) return;

    if (this.scanHistory.length === 0) {
      recentList.innerHTML = '<p class="text-sm text-gray-400 italic">No scans yet...</p>';
      return;
    }

    const html = this.scanHistory.slice(0, 20).map(scan => {
      const time = new Date(scan.timestamp).toLocaleTimeString();
      return `
        <div class="bg-white border border-gray-200 rounded p-2 text-xs">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-semibold">${scan.associate}</div>
              <div class="text-gray-600">${scan.badgeId}</div>
            </div>
            <div class="text-right">
              <div class="font-mono font-bold text-green-700">${scan.pathDisplay}</div>
              <div class="text-gray-500">${time}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    recentList.innerHTML = html;
  }
};

// Debug helper
window.debugManualScan = function() {
  console.log('=== Manual Scan Debug ===');
  console.log('Current Path:', window.MANUAL_SCAN.currentPath);
  console.log('Session Context:', window.MANUAL_SCAN.sessionContext);
  console.log('Scan History:', window.MANUAL_SCAN.scanHistory);
  console.log('Total Scans:', window.MANUAL_SCAN.scanHistory.length);
  return {
    currentPath: window.MANUAL_SCAN.currentPath,
    context: window.MANUAL_SCAN.sessionContext,
    history: window.MANUAL_SCAN.scanHistory
  };
};
