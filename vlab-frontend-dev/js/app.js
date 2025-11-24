// app.js — simplified, restored, and self-contained for the VLAB labor board.
// Provides: CSV parsing (PapaParse), STATE.badges, left unassigned stack, tile layers,
// drag & drop, presence tick, and a form submit that does not navigate away.

document.addEventListener('DOMContentLoaded', () => {
  console.log('[DEBUG] DOM Content Loaded - Initializing VLAB');
  // --- Tabs & Roster Headcount Overview Injection ---
  // Lightweight tab logic lives in index.html; here we provide data wiring for roster headcount.
  // Headcount table removed; use compact roster overview instead
  const rosterOverviewContent = document.getElementById('rosterOverviewContent');
  const rosterShiftCodeFilter = document.getElementById('rosterShiftCodeFilter');
  // Active shift code filter ("" means all)
  let SHIFT_CODE_FILTER = '';

  function safeNum(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }

  function buildHeadcountDataset(){
    if (!window.DATABASE || !DATABASE.database) return [];
    // Use DATABASE which stores richer fields (departmentId, managementAreaId, status, scode, site)
    const employees = DATABASE.getAllEmployees();
    if (!employees || employees.length === 0) return [];
    // Normalize current site selection
    const site = (STATE.currentSite || document.getElementById('site')?.value || document.getElementById('site_roster')?.value || document.getElementById('headerSiteSelector')?.value || '').toString().trim().toUpperCase();
    const shift = document.querySelector('input[name="shift"]:checked')?.value || 'day';
    const dateStr = document.getElementById('date')?.value || null;
    const allowedCodes = getAllowedCodes(dateStr, shift);
    const allowedSet = new Set(allowedCodes);
    const daySet = shift === 'day' ? DAY_SET : NIGHT_SET;
    const rows = [];
    window.__ROSTER_INCLUDED = []; // raw included employees for associate list
    employees.forEach(emp => {
      const empSiteRaw = (emp.site || emp.Site || '').toString().trim().toUpperCase();
      // Treat YDD_SHARED as part of both YDD2 and YDD4 cluster; also allow any "YDD" prefixed code as cluster
      const isYddClusterSite = /^(YDD2|YDD4|YDD_SHARED|YDD)/.test(empSiteRaw);
      // When computing base dataset for table we still apply current site filter,
      // but we'll also build a multi-site aggregate separately.
      if (site === 'YHM2' && empSiteRaw !== 'YHM2') return;
      if ((site === 'YDD2' || site === 'YDD4') && !isYddClusterSite) return;
      const sc = shiftCodeOf(emp.scode);
      let forced = !!(emp._forceInclude || emp._isUploaded); // allow force-included to bypass code gating
      
      // Strict date/shift check for adjustments
      if (forced) {
        if (emp._adjustmentDate && emp._adjustmentDate !== dateStr) forced = false;
        else if (emp._adjustmentShift && emp._adjustmentShift !== shift) forced = false;
      }
      // If it was an uploaded/synthetic record and it's no longer forced (due to date mismatch), hide it
      if (!forced && emp._isUploaded) return;

      if (!forced && !allowedSet.has(sc)) return; // weekday allowed
      if (!forced && !daySet.has(sc)) return; // shift set allowed
      if (String(emp.status || '').toLowerCase() !== 'active') return;
      if (SHIFT_CODE_FILTER && sc !== SHIFT_CODE_FILTER) return; // apply user shift code filter
      rows.push(emp);
      window.__ROSTER_INCLUDED.push(emp);
    });
    // Group
    const map = new Map();
    rows.forEach(r => {
      const dept = r.departmentId || '—';
      const area = r.managementAreaId || '—';
      const sc = shiftCodeOf(r.scode) || 'NA';
      const key = `${dept}|${area}|${sc}|${(r.status||'Active')}`;
      const prev = map.get(key) || { departmentId: dept, managementAreaId: area, scode: sc, status: r.status || 'Active', count:0 };
      prev.count += 1;
      map.set(key, prev);
    });
    // Multi-site aggregate (YHM2 vs YDD Cluster) for summary pills
    const multi = { YHM2:0, YDD_CLUSTER:0 };
    employees.forEach(emp => {
      const empSiteRaw = (emp.site || emp.Site || '').toString().trim().toUpperCase();
      const sc = shiftCodeOf(emp.scode);
      let forced = !!(emp._forceInclude || emp._isUploaded);
      
      // Strict date/shift check for adjustments
      if (forced) {
        if (emp._adjustmentDate && emp._adjustmentDate !== dateStr) forced = false;
        else if (emp._adjustmentShift && emp._adjustmentShift !== shift) forced = false;
      }
      if (!forced && emp._isUploaded) return;

      if (!forced && !allowedSet.has(sc)) return;
      if (!forced && !daySet.has(sc)) return;
      if (String(emp.status||'').toLowerCase() !== 'active') return;
      if (empSiteRaw === 'YHM2') multi.YHM2 += 1; else if (/^(YDD2|YDD4|YDD_SHARED|YDD)/.test(empSiteRaw)) multi.YDD_CLUSTER += 1;
    });
    // Fallback: if YDD cluster gated count is zero but there are active YDD employees ignored due to code gating, compute non-gated count for visibility
    if (multi.YDD_CLUSTER === 0){
      const rawYdd = employees.filter(emp => /^(YDD2|YDD4|YDD_SHARED|YDD)/.test((emp.site||emp.Site||'').toString().trim().toUpperCase()) && String(emp.status||'').toLowerCase()==='active');
      if (rawYdd.length){
        multi.YDD_CLUSTER = rawYdd.length; // show raw active count so it's not blank
        map._yddFallback = true;
      }
    }
    map._multiSite = multi; // attach for render
    return Array.from(map.values()).sort((a,b)=> b.count - a.count || String(a.departmentId).localeCompare(String(b.departmentId)));
  }

  function renderHeadcountOverview(){
    const rosterOverviewContent = document.getElementById('rosterOverviewContent');
    // 1. Populate shift code filter options
    try {
      if (rosterShiftCodeFilter) {
        const dateStr = document.getElementById('date')?.value || document.getElementById('date_roster')?.value || null;
        const shiftSel = document.querySelector('input[name="shift"]:checked')?.value || document.querySelector('input[name="shift_roster"]:checked')?.value || 'day';
        const codes = getAllowedCodes(dateStr, shiftSel) || [];
        const existing = Array.from(rosterShiftCodeFilter.options).map(o => o.value);
        const needed = [''].concat(codes);
        const changed = needed.length !== existing.length || needed.some((v,i)=> v !== existing[i]);
        if (changed) {
          rosterShiftCodeFilter.innerHTML = '<option value="">All</option>' + codes.map(c => `<option value="${c}" ${c===SHIFT_CODE_FILTER?'selected':''}>${c}</option>`).join('');
          if (SHIFT_CODE_FILTER && !codes.includes(SHIFT_CODE_FILTER)) SHIFT_CODE_FILTER='';
        }
      }
    } catch(e){ console.warn('[SHIFT_CODE_FILTER] populate failed', e); }

    // 2. Build expected HC block
    const data = buildHeadcountDataset && buildHeadcountDataset();
    let expectedHTML='';
    if (!data || data.length===0){
      expectedHTML = `<div class="text-xs text-gray-500 italic">No active associates match current filters.</div>`;
    } else {
      let multi = data._multiSite || { YHM2:0, YDD_CLUSTER:0 };
      let total = (multi.YHM2||0)+(multi.YDD_CLUSTER||0);
      if (total===0){
        const badgeCount = Object.keys(STATE.badges||{}).length;
        const shiftTotal = parseInt((document.getElementById('shiftCodeTotal')?.textContent||'0').trim(),10);
        const regLike = badgeCount || shiftTotal || (window.VLAB_REGULAR_HC||0);
        if (regLike>0){
          if (STATE.currentSite==='YHM2') multi.YHM2=regLike; else multi.YDD_CLUSTER=regLike;
          total = regLike; multi._fallback=true;
        }
      }
      expectedHTML = `
        <div class="px-2 py-1 bg-blue-50 border border-blue-100 rounded shadow-sm flex items-center"><span class="text-blue-600 font-semibold mr-2">YHM2 Expected</span><span class="font-bold text-blue-900">${multi.YHM2}</span></div>
        <div class="px-2 py-1 bg-blue-50 border border-blue-100 rounded shadow-sm flex items-center"><span class="text-blue-600 font-semibold mr-2">YDD Cluster</span><span class="font-bold text-blue-900">${multi.YDD_CLUSTER}</span></div>
        <div class="px-2 py-1 bg-blue-50 border border-blue-100 rounded shadow-sm flex items-center"><span class="text-blue-600 font-semibold mr-2">Total Expected</span><span class="font-bold text-blue-900">${total}</span></div>
      `;
      try {
        const elPlan = document.getElementById('displayPlannedHC');
        if (elPlan) elPlan.textContent = String(multi[STATE.currentSite==='YHM2'?'YHM2':'YDD_CLUSTER'] || total);
        setCounts && setCounts();
      } catch(e){ console.warn('[HEADCOUNT->BOARD] propagation failed', e); }
    }

    // 3. Adjustments block (Compact Pills Layout)
    try {
      const adjTarget = document.getElementById('rosterAdjSummary');
      const adj = window.VLAB_ADJUST_STATS || { SWAPIN:0, SWAPOUT:0, VET:0, VTO:0, LS_IN:0, LS_OUT:0 };
      let regHC = (typeof window.VLAB_REGULAR_HC==='number') ? window.VLAB_REGULAR_HC : 0;
      if (!regHC && window.__ROSTER_INCLUDED) regHC = window.__ROSTER_INCLUDED.length;
      if (!regHC) regHC = Object.keys(STATE.badges||{}).length;
      if (!regHC){
        const scTotal = parseInt((document.getElementById('shiftCodeTotal')?.textContent||'0').trim(),10);
        if (scTotal) regHC = scTotal;
      }
      
      // Use compact pills instead of large cards
      const adjHTML = `
        <div class="px-2 py-1 bg-white border rounded shadow-sm flex items-center"><span class="text-gray-500 font-semibold mr-2">Expected Headcount</span><span class="font-bold text-gray-900">${regHC}</span></div>
        <div class="px-2 py-1 bg-white border rounded shadow-sm flex items-center"><span class="text-gray-500 font-semibold mr-2">Swap In</span><span class="font-bold text-blue-600">${adj.SWAPIN||0}</span></div>
        <div class="px-2 py-1 bg-white border rounded shadow-sm flex items-center"><span class="text-gray-500 font-semibold mr-2">Swap Out</span><span class="font-bold text-red-600">${adj.SWAPOUT||0}</span></div>
        <div class="px-2 py-1 bg-white border rounded shadow-sm flex items-center"><span class="text-gray-500 font-semibold mr-2">VET</span><span class="font-bold text-blue-600">${adj.VET||0}</span></div>
        <div class="px-2 py-1 bg-white border rounded shadow-sm flex items-center"><span class="text-gray-500 font-semibold mr-2">VTO</span><span class="font-bold text-red-600">${adj.VTO||0}</span></div>
        <div class="px-2 py-1 bg-white border rounded shadow-sm flex items-center"><span class="text-gray-500 font-semibold mr-2">LS_IN</span><span class="font-bold text-indigo-600">${adj.LS_IN||0}</span></div>
        <div class="px-2 py-1 bg-white border rounded shadow-sm flex items-center"><span class="text-gray-500 font-semibold mr-2">LS_OUT</span><span class="font-bold text-orange-600">${adj.LS_OUT||0}</span></div>
      `;
      
      if (rosterOverviewContent){
        // Legacy container support (if it exists)
        rosterOverviewContent.innerHTML = `<div class="flex flex-wrap gap-2">${adjHTML}${expectedHTML}</div>`;
      } else if (adjTarget){
        // Target container in index.html
        adjTarget.innerHTML = adjHTML;
      }
    } catch(err){ console.warn('[ADJ-SUMMARY] render failed', err); }

    // 4. Ancillary panels
    renderShiftCodeBreakdown && renderShiftCodeBreakdown(window.__ROSTER_INCLUDED || []);
    renderIncludedAssociates && renderIncludedAssociates(window.__ROSTER_INCLUDED || []);
    renderRosterFilterSummary && renderRosterFilterSummary(window.__ROSTER_INCLUDED || []);
  }

  // --- Shift Code Breakdown ---
  function renderShiftCodeBreakdown(list){
    const body = document.getElementById('shiftCodeBody');
    const totalEl = document.getElementById('shiftCodeTotal');
    if (!body || !totalEl){ return; }
    body.innerHTML='';
    if (!Array.isArray(list) || list.length === 0){ totalEl.textContent='0'; return; }
    const counts = {};
    list.forEach(e => { const sc = shiftCodeOf(e.scode) || 'NA'; counts[sc] = (counts[sc]||0)+1; });
    const entries = Object.entries(counts).sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0]));
    let total=0; const frag=document.createDocumentFragment();
    entries.forEach(([sc,c])=>{ total+=c; const tr=document.createElement('tr'); tr.innerHTML=`<td class="px-3 py-1">${sc}</td><td class="px-3 py-1 text-right font-semibold">${c}</td>`; frag.appendChild(tr); });
    body.appendChild(frag); totalEl.textContent = String(total);
  }

  // --- Included Associates List ---
  function renderIncludedAssociates(list){
    const tbody = document.getElementById('rosterIncludedList');
    const countEl = document.getElementById('rosterIncludedCount');
    const search = document.getElementById('rosterIncludedSearch');
    if (!tbody || !countEl) return;
    tbody.innerHTML='';
    if (!Array.isArray(list) || list.length===0){ countEl.textContent='0'; return; }
    const frag = document.createDocumentFragment();
    list.forEach(emp => {
      const isAdjusted = !!(emp._forceInclude || emp._isUploaded);
      const tr = document.createElement('tr');
      if (isAdjusted) {
        tr.className = 'bg-yellow-50';
        tr.title = 'Adjusted Associate';
      }
      tr.innerHTML = `
        <td class="px-3 py-1 whitespace-nowrap">
          ${emp.name || emp.eid}
          ${isAdjusted ? '<span class="ml-1 text-yellow-600" title="Adjusted">★</span>' : ''}
        </td>
        <td class="px-3 py-1 text-xs text-gray-600">${emp.eid}</td>
        <td class="px-3 py-1">${shiftCodeOf(emp.scode) || 'NA'}</td>
        <td class="px-3 py-1">${emp.userId || emp.handle || '—'}</td>
        <td class="px-3 py-1">${emp.manager || '—'}</td>`;
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
    countEl.textContent = String(list.length);
    if (search && !search._bound){
      search._bound = true;
      search.addEventListener('input', () => {
        const q = (search.value||'').toLowerCase();
        Array.from(tbody.children).forEach(row => {
          const txt = (row.textContent||'').toLowerCase();
          row.style.display = !q || txt.includes(q) ? '' : 'none';
        });
      });
    }
  }

  // --- Filter Summary Chips ---
  function renderRosterFilterSummary(list){
    const target = document.getElementById('rosterFiltersSummary');
    if (!target) return;
    const date = document.getElementById('date')?.value || '-';
    const site = STATE.currentSite || document.getElementById('site')?.value || '-';
    const shift = document.querySelector('input[name="shift"]:checked')?.value || '-';
    const dObj = parseInputDate(date); const day = dObj ? dayNames[dObj.getDay()].slice(0,3) : '-';
    const allowed = getAllowedCodes(date, shift);
    const scCounts = {};
    (window.__ROSTER_INCLUDED || []).forEach(emp => { const sc = shiftCodeOf(emp.scode); scCounts[sc] = (scCounts[sc]||0)+1; });
    const scSummary = allowed.map(sc => `${sc}:${scCounts[sc]||0}`).join(' ');
    // Shift Type labeling with Wednesday overlap rule
    let shiftTypeLabel = '-';
    if (dObj) {
      const dow = dObj.getDay();
      const baseType = shiftTypeMap[shift]?.[dow] || '-';
      shiftTypeLabel = (dow === 3) ? `Overlap (${baseType})` : baseType; // Wednesday index 3
    }
    target.innerHTML = '';
    const chips = [
      ['Date', date],
      ['Day', day],
      ['Site', site],
      ['Shift', shift.charAt(0).toUpperCase()+shift.slice(1)],
      ['Shift Type', shiftTypeLabel],
      ['Codes', scSummary]
    ];
    if (SHIFT_CODE_FILTER) chips.push(['Code Filter', SHIFT_CODE_FILTER]);
    chips.forEach(([label,val]) => {
      const chip = document.createElement('div'); chip.className='chip'; chip.innerHTML = `<span class="font-medium">${label}</span><span class="ml-2">${val||'-'}</span>`; target.appendChild(chip);
    });
  }
  // Shift code filter change handler
  rosterShiftCodeFilter && rosterShiftCodeFilter.addEventListener('change', (e) => {
    SHIFT_CODE_FILTER = e.target.value || '';
    renderHeadcountOverview();
  });

  // Expose for debugging / manual refresh
  window.renderHeadcountOverview = renderHeadcountOverview;
  window.renderShiftCodeBreakdown = renderShiftCodeBreakdown;
  window.renderIncludedAssociates = renderIncludedAssociates;
  window.renderRosterFilterSummary = renderRosterFilterSummary;

  // Auto-refresh headcount when core selectors change
  function handleFilterChange() {
    // Reload from database to ensure STATE.badges is filtered correctly by date/shift
    if (window.DATABASE && typeof DATABASE.loadFromDatabase === 'function') {
      DATABASE.loadFromDatabase();
    } else {
      renderHeadcountOverview();
    }
  }

  ['site','date','quarter','site_roster','date_roster'].forEach(id => { 
    const el = document.getElementById(id); 
    el && el.addEventListener('change', handleFilterChange); 
  });
  document.querySelectorAll('input[name="shift"], input[name="shift_roster"]').forEach(r => r.addEventListener('change', handleFilterChange));
  // Also keep schedule chips synced on control changes (siteBoard view)
  ['site','date','quarter','plannedVolumeStub'].forEach(id => { const el = document.getElementById(id); el && el.addEventListener('change', setScheduleChips); });
  document.querySelectorAll('input[name="shift"]').forEach(r => r.addEventListener('change', setScheduleChips));

  
  // Roster upload form (uploads + database)
  const form = document.getElementById('rosterForm') || document.getElementById('laborForm');
  const output = document.getElementById('output');
  // Wire explicit fetch button (Site Board controls)
  const fetchRosterBtn = document.getElementById('fetchRosterBtn');
  const clearBoardBtn = document.getElementById('clearBoardBtn');
  
  // Check if required elements exist
  if (!form) {
    console.error('[DEBUG] Roster form element not found!');
    console.error('[DEBUG] Available forms:', Array.from(document.forms).map(f => f.id || f.name));
    // Do not return; allow Analytics and other features to initialize without roster form
  } else {
    console.log('[DEBUG] Roster form found successfully:', form.id);
  }
  if (!output) {
    console.error('[DEBUG] Output element not found!');
    console.error('[DEBUG] Available elements with id containing "output":', Array.from(document.querySelectorAll('[id*="output"]')).map(el => el.id));
    // Do not return; allow Analytics and other features to initialize without output panel
  } else {
    console.log('[DEBUG] Output element found successfully:', output.id);
  }
  
  console.log('[DEBUG] Form and output elements found successfully');
  console.log('[DEBUG] Form has roster input:', !!form.roster);
  console.log('[DEBUG] Form has logins input:', !!form.logins);
  
  console.log('[DEBUG] Core elements found, continuing initialization...');

  // Attach form submit handler (Moved from bottom to ensure early binding)
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation(); // Ensure no other handlers interfere
      
      console.log('[DEBUG] Form submit event triggered (Top Handler)');
      
      // Check if output element exists
      if (!output) {
        console.error('[DEBUG] Output element not found!');
        alert('Error: Output element not found. Please refresh the page.');
        return;
      }
      
      // Set flag to prevent auto-load during form processing
      isFormProcessing = true;
      console.log('[FORM] Form processing started, preventing auto-load');
      
      console.log('[DEBUG] Form submission started');
      console.log('[DEBUG] Form element:', form);
      console.log('[DEBUG] Form files - roster:', form.roster?.files, 'logins:', form.logins?.files, 'adjustments:', form.adjustments?.files);
      
      // Store current form state to preserve after processing
      const resolvedDate = document.getElementById('date')?.value || '';
      const resolvedSite = document.getElementById('site')?.value || '';
      const resolvedShift = document.querySelector('input[name="shift"]:checked')?.value || '';
      const resolvedQuarter = document.getElementById('quarter')?.value || '';
      const resolvedPlannedVolume = document.getElementById('plannedVolume')?.value || '';
      const currentFormState = {
        date: resolvedDate,
        site: resolvedSite,
        shift: resolvedShift,
        quarter: resolvedQuarter,
        plannedVolume: resolvedPlannedVolume,
        rosterFileName: form.roster?.files[0]?.name,
        loginsFileName: form.logins?.files?.[0]?.name,
        adjustmentsFileName: form.adjustments?.files?.[0]?.name
      };
      console.log('[DEBUG] Preserving form state:', currentFormState);
      
      output.textContent = 'Processing files…';

      const rosterFile = form.roster?.files[0];
      const loginsFile = form.logins?.files[0] || null;
      const adjustmentsFile = form.adjustments?.files[0] || null;
      
      if (!rosterFile && !adjustmentsFile){ 
        output.textContent = 'Please select a Roster File or an Adjustments CSV to proceed.'; 
        console.warn('[DEBUG] No roster or adjustments file selected');
        isFormProcessing = false;
        return; 
      }
      
      if (rosterFile) {
        console.log('[DEBUG] Roster file selected:', rosterFile.name, 'size:', rosterFile.size);
      } else {
        console.log('[DEBUG] No roster file, proceeding with adjustments-only');
      }
      
      console.log('[DEBUG] Daily logins file:', loginsFile ? `${loginsFile.name} (${loginsFile.size} bytes)` : 'None selected');
      console.log('[DEBUG] Adjustments file:', adjustmentsFile ? `${adjustmentsFile.name} (${adjustmentsFile.size} bytes)` : 'None selected');

      if (typeof Papa === 'undefined') {
        const errorMsg = 'Error: CSV parser not loaded. Please refresh the page and ensure internet connection.';
        output.textContent = errorMsg;
        console.error('[DEBUG] PapaParse library not available');
        alert(errorMsg);
        isFormProcessing = false;
        return;
      }

      console.log('[DEBUG] Papa Parse available, version:', Papa.version || 'unknown');
      console.log('[DEBUG] Starting CSV parsing...');
      
      Promise.all([
        rosterFile ? parseCsv(rosterFile).catch(err => { 
          console.error('[DEBUG] Roster parsing error:', err); 
          output.textContent = `Error parsing roster file: ${err.message}`;
          return []; 
        }) : Promise.resolve([]),
        loginsFile ? parseCsv(loginsFile).catch(err => { 
          console.error('[DEBUG] Daily logins parsing error:', err);
          console.warn('[WARNING] Daily logins failed to parse, continuing without it');
          return []; 
        }) : Promise.resolve([]),
        adjustmentsFile ? parseCsv(adjustmentsFile).catch(err => { 
          console.error('[DEBUG] Adjustments parsing error:', err);
          console.warn('[WARNING] Adjustments failed to parse, continuing without it');
          return []; 
        }) : Promise.resolve([]),
      ]).then(([roster, logins, adjustments]) => {
        console.debug('[build] rosterFile=', rosterFile && rosterFile.name, 'size=', rosterFile && rosterFile.size);
        
        const siteSel = resolvedSite || (document.getElementById('site')?.value || 'YHM2');
        const quarterSel = document.getElementById('quarter')?.value || 'Q1';
        if (!rosterFile && adjustmentsFile){
          try { TOAST.info('Building board from adjustments only (no roster uploaded).'); } catch(_) { console.log('[INFO] Adjustments-only build mode'); }
        }
        
        STATE.currentSite = siteSel;
        console.log('[DEBUG] Setting current site to:', siteSel);
        
        const dateStr = resolvedDate || '';
        const shiftSel = resolvedShift || 'day';
        const d = parseInputDate(dateStr); const dow = d?.getDay() ?? 0;
        const shortDay = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const shiftTypeMap = {
          day:   {0:'FHD',1:'FHD',2:'FHD',3:'FHD',4:'BHD',5:'BHD',6:'BHD'},
          night: {0:'FHN',1:'FHN',2:'FHN',3:'FHN',4:'BHN',5:'BHN',6:'BHN'}
        };

        elDate.textContent = dateStr || '-';
        elDay.textContent = d ? shortDay[dow] : '-';
        elShift.textContent = shiftSel[0].toUpperCase() + shiftSel.slice(1);
        elType.textContent = shiftTypeMap[shiftSel][dow];
        elSite.textContent = siteSel;
        STATE.currentQuarter = quarterSel;

        const allowed = new Set(getAllowedCodes(dateStr, shiftSel));
        if (allowed.size){ codesBar.classList.remove('hidden'); codesBar.textContent = `Codes active for ${dayNames[dow]} (${elShift.textContent}): ${[...allowed].sort().join(', ')}`; }
        else { codesBar.classList.add('hidden'); codesBar.textContent = ''; }

        let combinedRoster = Array.isArray(roster) ? [...roster] : [];

        const adjRes = processAdjustments(adjustments, combinedRoster, { date: resolvedDate, shift: resolvedShift, site: resolvedSite });
        combinedRoster = adjRes.combinedRoster;
        try { window.VLAB_ADJUST_STATS = adjRes.stats; window.VLAB_ADJUST_FORCE_IDS = Array.from(adjRes.forceIds); } catch(_) {}
        
        try {
          if (!rosterFile && (adjRes.stats.added + adjRes.stats.removed) === 0) {
            const todayKey = (document.getElementById('date')?.value || '').trim();
            const hadRows = Array.isArray(adjustments) && adjustments.length > 0;
            if (hadRows) {
              const msg = `No adjustments matched current Date ${todayKey}. Ensure the Date column matches the selected date.`;
              TOAST && TOAST.warn ? TOAST.warn(msg) : console.warn('[ADJUST]', msg);
            }
          }
        } catch(_) { }
        
        const presentEmployeeIds = new Set();
        
        if (Array.isArray(logins) && logins.length > 0) {
          logins.forEach(loginRecord => {
            const employeeId = loginRecord['Employee ID'] || loginRecord['ID'] || loginRecord['EID'] || '';
            if (employeeId) presentEmployeeIds.add(employeeId.toString());
          });
        }
        
        if (presentEmployeeIds.size > 0) {
          combinedRoster = combinedRoster.filter(employee => {
            const employeeId = (employee['Employee ID'] || employee['ID'] || employee['EID'] || '').toString();
            const forced = employee['_isUploaded'] === true || employee['_forceInclude'] === true;
            return forced || presentEmployeeIds.has(employeeId);
          });
        }

        const activeRows = combinedRoster.filter(r => (String(r['Employee Status'] ?? r.Status ?? '').toLowerCase() === 'active') || r._forceInclude === true);

        if (combinedRoster.length > 0 && filteredPreviewNeeded(combinedRoster, activeRows)){
          const keys = combinedRoster[0] ? Object.keys(combinedRoster[0]) : [];
          output.textContent = `Parsed ${combinedRoster.length} rows (${logins.length || 0} daily logins). No active rows matched filters. Detected headers: ${keys.join(', ')}.`; 
          console.warn('[build] no active rows in adjustments', keys);
        }

        console.log('[DATABASE] Updating database with ALL active associates...');
        if (DATABASE && activeRows.length > 0) {
          let dbAddedCount = 0;
          let dbUpdatedCount = 0;
          
          activeRows.forEach(r => {
            const eid = String(r['Employee ID'] ?? r['ID'] ?? r['EID'] ?? r['Employee Number'] ?? '').trim();
            const handle = String(r['User ID'] ?? r['Handle'] ?? r['Employee Handle'] ?? r['Login'] ?? '').trim();
            const name = String(r['Employee Name'] ?? r['Name'] ?? r['Full Name'] ?? '').trim();
            const sc = shiftCodeOf(r['Shift Pattern'] ?? r['ShiftCode'] ?? r['Shift Code'] ?? r['Shift'] ?? r['Pattern']);
            const site = classifySite(r);
            
            if ((!eid && !handle) || !name) return;
            
            const existing = DATABASE.getEmployee(handle || eid);
            const employeeData = {
              eid: eid,
              userId: handle,
              name: name,
              manager: r['Manager Name'] || r.Manager,
              scode: sc,
              site: site,
              status: r['Employee Status'] ?? r.Status ?? 'Active',
              departmentId: r['Department ID'],
              managementAreaId: r['Management Area ID'],
              shiftPattern: r['Shift Pattern'],
              lastSeen: new Date().toISOString(),
              _forceInclude: !!(r._forceInclude || r._isUploaded),
              _adjustmentDate: r._adjustmentDate,
              _adjustmentShift: r._adjustmentShift
            };
            
            if (existing) {
              Object.assign(existing, employeeData);
              dbUpdatedCount++;
            } else {
              DATABASE.addEmployee(employeeData);
              dbAddedCount++;
            }
          });
          
          DATABASE.saveDatabase();
          console.log(`[DATABASE] Updated database: ${dbAddedCount} added, ${dbUpdatedCount} updated from ${activeRows.length} active associates`);
        }

        let filtered = activeRows.filter(r => {
          const site = classifySite(r);
          const sc = shiftCodeOf(r['Shift Pattern'] ?? r['ShiftCode'] ?? r['Shift Code'] ?? r['Shift'] ?? r['Pattern']);
          const isUploaded = r['_isUploaded'] === true;
          
          if (siteSel === 'YHM2' && site !== 'YHM2') return false;
          if ((siteSel === 'YDD2' || siteSel === 'YDD4') && (site !== 'YHM2' && site !== 'YDD_SHARED')) return false;
          
          if (r._forceInclude === true) return true;

          if (!allowed.has(sc)) return false;
          if (shiftSel === 'day' && !DAY_SET.has(sc)) return false;
          if (shiftSel === 'night' && !NIGHT_SET.has(sc)) return false;
          return true;
        });

        try {
          const forceList = Array.isArray(window.VLAB_ADJUST_FORCE_IDS) ? window.VLAB_ADJUST_FORCE_IDS : [];
          if (forceList.length) {
            const presentHandles = new Set(filtered.map(r => String(r['User ID']||'').toLowerCase()));
            forceList.forEach(uidKey => {
              const handle = String(uidKey||'').toLowerCase();
              if (!handle || presentHandles.has(handle)) return;
              const dbEmp = (window.DATABASE && DATABASE.getEmployee) ? DATABASE.getEmployee(handle) : null;
              if (!dbEmp) return;
              const synth = {
                'Employee Name': dbEmp.name || handle,
                'Employee ID': dbEmp.eid || handle,
                'Employee Status': 'Active',
                'Shift Pattern': dbEmp.shiftPattern || dbEmp.scode || ((resolvedShift||'day')==='day'?'DA':'NA'),
                'User ID': dbEmp.userId || handle,
                'Department ID': dbEmp.departmentId,
                'Management Area ID': dbEmp.managementAreaId,
                site: dbEmp.site || ((resolvedSite||'YHM2')==='YHM2' ? 'YHM2' : 'YDD_SHARED'),
                _isUploaded: true,
                _forceInclude: true
              };
              const siteX = classifySite(synth);
              if (siteSel === 'YHM2' && siteX !== 'YHM2') return;
              if ((siteSel === 'YDD2' || siteSel === 'YDD4') && (siteX !== 'YHM2' && siteX !== 'YDD_SHARED')) return;
              filtered.push(synth);
            });
          }
        } catch (e) { console.warn('[ADJUST-FORCE] fallback include skipped', e); }

        const adj = (window.VLAB_ADJUST_STATS || { SWAPIN:0, SWAPOUT:0, VET:0, VTO:0 });
        const swaps = [];
        const vetvto = [];
        const labshare = [];

        const swapIN  = adj.SWAPIN + swaps.filter(x => ((x.Direction ?? x.direction) ?? '').toString().toUpperCase() === 'IN').length;
        const swapOUT = adj.SWAPOUT + swaps.filter(x => ((x.Direction ?? x.direction) ?? '').toString().toUpperCase() === 'OUT').length;
        const vet = adj.VET + vetvto.filter(x => {
          const t = ((x.Type ?? x.type) ?? '').toString().toUpperCase();
          const acc = ((x.Accepted ?? x.Status) ?? '').toString().toUpperCase();
          return t === 'VET' && (!acc || acc === 'YES' || acc === 'ACCEPTED');
        }).length;
        const vto = adj.VTO + vetvto.filter(x => {
          const t = ((x.Type ?? x.type) ?? '').toString().toUpperCase();
          const acc = ((x.Accepted ?? x.Status) ?? '').toString().toUpperCase();
          return t === 'VTO' && (!acc || acc === 'YES' || acc === 'ACCEPTED');
        }).length;
        const lsIN  = labshare.filter(x => (x.Direction ?? x.direction ?? '').toString().toUpperCase() === 'IN').length;
        const lsOUT = labshare.filter(x => (x.Direction ?? x.direction ?? '').toString().toUpperCase() === 'OUT').length;

        const baseHC = filtered.length;
        const plannedHC = baseHC - swapOUT + swapIN + vet - vto + lsIN - lsOUT;
        elPlan.textContent = String(plannedHC); elActual.textContent = '0';
        try {
          window.VLAB_REGULAR_HC = baseHC;
          window.VLAB_UPLOADED_LOGINS = presentEmployeeIds.size || 0;
        } catch(_) {}

        STATE.badges = {};
        filtered.forEach((r, idx) => {
          const name = String(r['Employee Name'] ?? r['Name'] ?? r['Full Name'] ?? '').trim();
          const eid  = String(r['Employee ID'] ?? r['ID'] ?? r['EID'] ?? r['Employee Number'] ?? '').trim();
          const sc   = shiftCodeOf(r['Shift Pattern'] ?? r['ShiftCode'] ?? r['Shift Code'] ?? r['Shift'] ?? r['Pattern']);
          const classifiedSite = classifySite(r);
          const actualSite = classifiedSite === 'YDD_SHARED' ? siteSel : classifiedSite;
          const barcode = String(r['Badge Barcode ID'] ?? r['Barcode'] ?? r['Badge'] ?? r['Employee Login'] ?? r['Username'] ?? '').trim();
          const handle = String(r['User ID'] ?? r['Handle'] ?? r['Employee Handle'] ?? r['Login'] ?? '').trim();
          const photo = String(r['Photo'] ?? r['Photo URL'] ?? r['Image'] ?? '').trim();
          const manager = String(r['Manager Name'] ?? r['Manager'] ?? '').trim();
          const departmentId = r['Department ID'] ?? r.departmentId ?? r.DepartmentID ?? r['Dept ID'];
          const managementAreaId = r['Management Area ID'] ?? r.managementAreaId ?? r.ManagementAreaID ?? r['Mgmt Area ID'];
          const id   = `b_${eid || idx}_${Math.random().toString(36).slice(2,8)}`;
          const isUploaded = r['_isUploaded'] === true;
          STATE.badges[id] = { id, name, eid, scode: sc, site: actualSite, present:false, loc:'unassigned', barcode, handle, photo, isUploaded, manager, departmentId, managementAreaId, userId: handle };
        });

        if (Object.keys(STATE.badges).length === 0){
          output.textContent = 'No badges created — check CSV headers and active status field.';
          console.warn('[build] no badges in STATE.badges');
        }
        try {
          MULTISITE.ensureCurrentSiteSync();
          console.log('[DEBUG] Multi-site state synchronized');
        } catch(err) {
          console.warn('[DEBUG] Multi-site sync warning:', err);
        }
        
        renderAllBadges();
        applySiteFilter();
        setCounts();
        try{ renderHeadcountOverview(); }catch(err){ console.warn('[HEADCOUNT] render skipped:', err); }
        
        try{ 
          STATE.quarterAssignments[STATE.currentQuarter] = STATE.quarterAssignments[STATE.currentQuarter] || {}; 
          Object.values(STATE.badges).forEach(b => { 
            STATE.quarterAssignments[STATE.currentQuarter][b.id] = b.loc; 
          }); 
        }catch(_){ }
        setupVPH(plannedHC);
        
        const databaseMessage = DATABASE ? 
          (Object.keys(STATE.badges).length > 0 ? ` | Database updated with ${Object.keys(STATE.badges).length} associates` : '') : '';
        
        const siteMessage = `📋 Schedule Board Ready: ${baseHC} associates for ${siteSel}` + 
          (presentEmployeeIds.size > 0 ? ` (filtered by ${presentEmployeeIds.size} daily logins)` : '') +
          ((window.VLAB_ADJUST_STATS && (window.VLAB_ADJUST_STATS.SWAPIN || window.VLAB_ADJUST_STATS.SWAPOUT || window.VLAB_ADJUST_STATS.VET || window.VLAB_ADJUST_STATS.VTO))
            ? ` | Adjustments: +${(window.VLAB_ADJUST_STATS.SWAPIN||0)+(window.VLAB_ADJUST_STATS.VET||0)} / -${(window.VLAB_ADJUST_STATS.SWAPOUT||0)+(window.VLAB_ADJUST_STATS.VTO||0)}`
            : '') +
          databaseMessage;
        output.innerHTML = `<div style="color: #059669; font-weight: 500;">${siteMessage}</div>`;
        if (window.VLAB_ADJUST_STATS) {
          const a = window.VLAB_ADJUST_STATS;
          const plus = (a.SWAPIN||0) + (a.VET||0); const minus = (a.SWAPOUT||0) + (a.VTO||0);
          if (plus || minus) {
            try { TOAST.show(`Adjusted: +${plus} / -${minus}`, 'info'); } catch(_) { console.log(`[ADJUST] Net +${plus} / -${minus}`); }
          }
        }
        
        console.log('[BUILD-COMPLETE] Board ready with site-filtered associates');

        ANALYTICS.endSession();
        const loginsCount = logins.length || 0;
        const sessionNotes = loginsCount > 0 
          ? `Roster: ${rosterFile.name} + ${loginsCount} daily logins, Badges: ${Object.keys(STATE.badges).length}`
          : `Roster: ${rosterFile.name}, Badges: ${Object.keys(STATE.badges).length}`;
          
        ANALYTICS.startSession({
          date: dateStr,
          shift: shiftSel,
          site: siteSel,
          plannedHC: plannedHC,
          notes: sessionNotes
        });
        
        try{
          STATE.currentSite = siteSel;
          MULTISITE.saveCurrentSiteAssignments();
          const snap = { 
            badges: STATE.badges, 
            sites: STATE.sites,
            currentSite: STATE.currentSite,
            meta: { date: dateStr, shift: shiftSel, site: siteSel, plannedHC, quarter: STATE.currentQuarter } 
          };
          localStorage.setItem('vlab:lastRoster', JSON.stringify(snap));
          
          if (currentFormState.rosterFileName) {
            const rosterLabel = document.getElementById('label-roster');
            if (rosterLabel) {
              rosterLabel.textContent = `✅ ${currentFormState.rosterFileName}`;
              rosterLabel.style.color = '#059669';
            }
          }
          if (currentFormState.loginsFileName) {
            const loginsLabel = document.getElementById('label-logins');
            if (loginsLabel) {
              loginsLabel.textContent = `✅ ${currentFormState.loginsFileName}`;
              loginsLabel.style.color = '#059669';
            }
          }
          if (currentFormState.adjustmentsFileName) {
            const adjLabel = document.getElementById('label-adjustments');
            if (adjLabel) {
              adjLabel.textContent = `✅ ${currentFormState.adjustmentsFileName}`;
              adjLabel.style.color = '#a16207';
            }
          }
          isFormProcessing = false;
        }catch(_){ }
      }).catch(err => { 
        console.error('[DEBUG] Form submission error:', err); 
        output.textContent = `Error processing files: ${err.message || err}. Please check CSV headers and try again.`;
        isFormProcessing = false;
      });
    });
  }
  // Attach click handler for explicit fetch
  if (fetchRosterBtn) {
    fetchRosterBtn.addEventListener('click', async () => {
      try {
        // Ensure roster-side mirrors main (source of truth is Site Board controls now)
        // Removed sync logic as controls are unified

        // Provide feedback and disable while loading
        fetchRosterBtn.disabled = true;
        fetchRosterBtn.textContent = 'Fetching...';
        if (window.TOAST) TOAST.info('Fetching roster using current Date/Shift/Site...');

        // Use the existing database fetch which respects both roster and site controls
        if (window.DATABASE && typeof DATABASE.loadFromDatabase === 'function') {
          DATABASE.loadFromDatabase();
        } else {
          console.warn('[FETCH] DATABASE not ready, attempting simpleAutoLoad');
          if (typeof simpleAutoLoad === 'function') simpleAutoLoad();
        }
        // Persist schedule controls right after a successful fetch
        try { window.__saveSchedule && window.__saveSchedule(); } catch(_){ }

        // Refresh roster overview/filters after load
        try { if (typeof renderHeadcountOverview === 'function') renderHeadcountOverview(); } catch(_) {}
        try { if (typeof setCounts === 'function') setCounts(); } catch(_) {}
      } finally {
        fetchRosterBtn.disabled = false;
        fetchRosterBtn.textContent = '🔄 Fetch Roster';
      }
    });
  }

  // Clear Board: move all assigned badges for current site back to unassigned
  if (clearBoardBtn) {
    clearBoardBtn.addEventListener('click', () => {
      const currentSite = STATE.currentSite || document.getElementById('site')?.value || 'YHM2';
      let moved = 0;
      Object.values(STATE.badges).forEach(badge => {
        if (badge.loc && badge.loc !== 'unassigned' && badge.loc !== 'assigned-elsewhere') {
          // Only clear badges belonging to the current site context
          const badgeSite = (badge.site || '').toUpperCase();
          const siteMatch = (currentSite === 'YHM2') ? badgeSite === 'YHM2' : ['YDD2','YDD4','YDD_SHARED'].includes(badgeSite);
          if (siteMatch) {
            badge.loc = 'unassigned';
            moved++;
          }
        }
      });
      renderAllBadges();
      setCounts();
      updateActualHC();
      try{ renderHeadcountOverview(); }catch(_){ }
      try { window.__saveSchedule && window.__saveSchedule(); } catch(_){ }
      // Persist snapshot immediately after clearing
      try {
        const snap = {
          badges: STATE.badges,
          sites: STATE.sites,
          meta: {
            date: document.getElementById('date')?.value || '',
            shift: document.querySelector('input[name="shift"]:checked')?.value || 'day',
            site: currentSite,
            quarter: document.getElementById('quarter')?.value || 'Q1',
            plannedHC: document.getElementById('plannedVolumeStub')?.value || ''
          }
        };
        localStorage.setItem('vlab:lastRoster', JSON.stringify(snap));
        console.log('[CLEAR BOARD] Snapshot saved after clearing board');
      } catch(e){ console.warn('[CLEAR BOARD] Failed to save snapshot', e); }
      const output = document.getElementById('output');
      if (output){
        output.textContent = `🧹 Cleared board for ${currentSite}: ${moved} assignments moved to Unassigned.`;
        output.style.color = '#b45309';
        setTimeout(()=>{ output.textContent=''; }, 5000);
      }
    });
  }
  
  // Initialize unassigned header with default site
  const initializeUnassignedHeader = () => {
    const currentSite = document.getElementById('site')?.value || 'YHM2';
    const unassignedSiteLabel = document.getElementById('unassignedSiteLabel');
    if (unassignedSiteLabel) {
      unassignedSiteLabel.textContent = `${currentSite} Unassigned`;
    }
  };
  
  // Set initial unassigned header
  initializeUnassignedHeader();
  // And sync summary chips with persisted schedule once at startup
  try { setScheduleChips(); } catch(_){ }

  // ===== Summary DOM refs =====
  const elDate   = document.getElementById('displayDate');
  const elDay    = document.getElementById('displayDay');
  const elShift  = document.getElementById('displayShift');
  const elType   = document.getElementById('displayShiftType');
  const elSite   = document.getElementById('displaySite');
  const elPlan   = document.getElementById('displayPlannedHC');
  const elActual = document.getElementById('displayActualHC');
  const codesBar = document.getElementById('codesBar');

  // Keep summary chips in sync with the scheduling controls
  function setScheduleChips(){
    try {
      const dateVal = document.getElementById('date')?.value || '';
      const shiftVal = document.querySelector('input[name="shift"]:checked')?.value || 'day';
      const siteVal = document.getElementById('site')?.value || (STATE.currentSite || '');
      const planVal = document.getElementById('plannedVolumeStub')?.value || '';

      if (elDate) elDate.textContent = dateVal || '-';
      if (elShift) elShift.textContent = shiftVal ? (shiftVal === 'day' ? 'Day' : 'Night') : '-';
      if (elSite) elSite.textContent = siteVal || '-';
      if (elPlan) elPlan.textContent = planVal ? String(planVal) : '0';
      if (elDay && dateVal){
        const d = parseInputDate(dateVal);
        if (d) { const dayOfWeek = dayNames[d.getDay()]; elDay.textContent = dayOfWeek; }
      }
    } catch(e){ console.warn('[SUMMARY] Failed to sync chips', e); }
  }

  // Left panel stack
  const unassignedStack = document.getElementById('unassignedStack');
  const unassignedCountEl = document.getElementById('unassignedCount');
  const quarterSelect = document.getElementById('quarter');

  // Basic constants and helpers (kept small and explicit)
  const DAY_SET   = new Set(['DA','DB','DC','DL','DN','DH']);
  const NIGHT_SET = new Set(['NA','NB','NC','NL','NN','NH']);
  // Remove YHM2 site from site filtering universe on Site Board (YDD2/YDD4 share associates)
  // Any badge with YHM2 site will be treated as unassigned-other and hidden unless later separate board implemented.
  // When false, day/night filtering uses only DAY_SET/NIGHT_SET regardless of weekday
  // Turn to true to also restrict by WEEK_ALLOWED (calendar gating)
  const STRICT_WEEK = true; // Enable weekday-specific code gating (per your request)
  const dayNames  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const shortDay  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const WEEK_ALLOWED = {
    // Codes active per calendar day (union of day & night codes for that weekday)
    'Sunday':    ['DA','DL','DN','DH','NA','NL','NN'],
    'Monday':    ['DA','DC','DL','DH','NA','NC','NL','NH'],
    'Tuesday':   ['DA','DC','DL','NA','NC','NL'],
    'Wednesday': ['DA','DB','NA','NB'],
    'Thursday':  ['DB','DC','DN','NB','NC','NN','NH'],
    'Friday':    ['DB','DC','DN','DH','NB','NC','NN','NH'],
    'Saturday':  ['DB','DL','DN','DH','NB','NL','NN','NH']
  };

  const shiftTypeMap = {
    day:   {0:'FHD',1:'FHD',2:'FHD',3:'FHD',4:'BHD',5:'BHD',6:'BHD'},
    night: {0:'FHN',1:'FHN',2:'FHN',3:'FHN',4:'BHN',5:'BHN',6:'BHN'}
  };

  // Tiles order matches DOM `board-card` order: process tiles only (no Unassigned tile here)
  const TILES = [
    // Process tiles
    ['tile-cb','cb'], ['tile-ibws','ibws'], ['tile-lineloaders','lineloaders'], ['tile-trickle','trickle'],
    ['tile-dm','dm'], ['tile-idrt','idrt'], ['tile-pb','pb'], ['tile-e2s','e2s'], ['tile-dockws','dockws'],
    ['tile-e2sws','e2sws'], ['tile-tpb','tpb'], ['tile-tws','tws'], ['tile-sap','sap'], ['tile-ao5s','ao5s'],
    ['tile-pa','pa'], ['tile-ps','ps'], ['tile-laborshare','laborshare']
  ];

  // tile layers map key -> element
  const tileBadgeLayers = {};
  document.querySelectorAll('.board-card').forEach((card, idx) => {
    const layer = document.createElement('div');
    // path-box allows wrapping many badges inside process tiles
  layer.className = 'badge-layer path-box';
    card.style.position = card.style.position || 'relative';
    card.appendChild(layer);
    const pair = TILES[idx];
    if (pair){ const key = pair[1]; tileBadgeLayers[key] = layer; }
    // make the layer itself accept drops
    makeDropTarget(layer, TILES[idx] ? TILES[idx][1] : null);

    // Add an expand button to each tile header to open a pop-out view
    try {
      const pair2 = TILES[idx];
      const tileKey = pair2 ? pair2[1] : null;
      const hdr = card.querySelector('.tile-header');
      if (hdr && tileKey) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = 'Expand tile';
        btn.textContent = '⤢';
        btn.style.marginLeft = '8px';
        btn.style.border = '1px solid #374151';
        btn.style.borderRadius = '6px';
        btn.style.padding = '2px 6px';
        btn.style.background = '#ffffff';
        btn.style.color = '#1f2937';
        btn.style.fontSize = '12px';
        btn.addEventListener('click', () => {
          const titleEl = hdr.querySelector('.font-semibold');
          const title = titleEl ? titleEl.textContent : tileKey.toUpperCase();
          openTileOverlay(tileKey, title);
        });
        hdr.appendChild(btn);
      }
    } catch (_){ }
  });



  // wire up count inputs for each tile (allow numeric input to assign random badges)
  function assignRandomToTile(key, n){
    // Update STATE only: pick `n` random, PRESENT, site-eligible, unassigned badges and set their loc to the tile key.
    const currentSite = MULTISITE.ensureCurrentSiteSync ? MULTISITE.ensureCurrentSiteSync() : (STATE.currentSite || document.getElementById('site')?.value || 'YHM2');
    // Only consider badges that are:
    // - currently unassigned
    // - marked present (available today)
    // - belong to the current site view (YDD2/YDD4 share pool)
    // - not hidden
    const pool = Object.values(STATE.badges).filter(b => {
      if (b.loc !== 'unassigned') return false;
      if (!b.present) return false;
      if (b.hidden) return false;
      try { return MULTISITE.badgeBelongsToSite ? MULTISITE.badgeBelongsToSite(b, currentSite) : true; } catch(_) { return true; }
    });
    if (pool.length === 0) return 0;
    const take = Math.min(n, pool.length);
    for (let i = 0; i < take; i++){
      const idx = Math.floor(Math.random() * pool.length);
      const b = pool.splice(idx,1)[0];
      b.loc = key;
    }
    // After mutating STATE, re-render the board to avoid DOM duplication and keep layering consistent.
    try{ renderAllBadges(); }catch(_){ }
    try{ setCounts(); }catch(_){ }
    try{ if (typeof snapshotCurrentQuarter === 'function') snapshotCurrentQuarter(); }catch(_){ }
    return take;
  }

  function unassignFromTile(key, n){
    // Update STATE only: move up to `n` badges from the tile back to unassigned.
    const inTile = Object.values(STATE.badges).filter(b => b.loc === key);
    const take = Math.min(n, inTile.length);
    for (let i = 0; i < take; i++){
      // remove from the end of the list (recently-rendered) — deterministic and simple
      const b = inTile[inTile.length - 1 - i];
      if (!b) break;
      b.loc = 'unassigned';
    }
    try{ renderAllBadges(); }catch(_){ }
    try{ setCounts(); }catch(_){ }
    try{ if (typeof snapshotCurrentQuarter === 'function') snapshotCurrentQuarter(); }catch(_){ }
    return take;
  }

  // attach listeners to inputs
  TILES.forEach(([id,key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    // if it's an input
    if (el.tagName === 'INPUT'){
      // set initial properties
      if (key === 'unassigned') el.readOnly = true;
      el.addEventListener('change', (ev) => {
        // If quarter locked, confirm override
        let doOverride = false;
        if (STATE.quarterLocks && STATE.quarterLocks[STATE.currentQuarter]){
          const ok = confirm(`Quarter ${STATE.currentQuarter} is locked. Override previous assignments with this change?`);
          if (!ok){
            const countsNowLocked = Object.values(STATE.badges).filter(b => b.loc === key).length;
            el.value = String(countsNowLocked);
            return;
          }
          doOverride = true;
        }
        // Track before-state for override logging
        const beforeInTile = new Set(Object.values(STATE.badges).filter(b => b.loc === key).map(b => b.id));
        let desired = Number(el.value) || 0;
        const countsNow = Object.values(STATE.badges).filter(b => b.loc === key).length;
        // Compute available present, site-eligible unassigned associates for hard capping
        const currentSite = MULTISITE.ensureCurrentSiteSync ? MULTISITE.ensureCurrentSiteSync() : (STATE.currentSite || document.getElementById('site')?.value || 'YHM2');
        const availablePool = Object.values(STATE.badges).filter(b => {
          if (b.loc !== 'unassigned') return false;
          if (!b.present) return false;
          if (b.hidden) return false;
          try { return MULTISITE.badgeBelongsToSite ? MULTISITE.badgeBelongsToSite(b, currentSite) : true; } catch(_) { return true; }
        }).length;
        const maxPossible = countsNow + availablePool;
        if (desired > maxPossible){
          desired = maxPossible;
          // Reflect cap in the input immediately so users see the true limit
          el.value = String(desired);
          try {
            if (window.TOAST && TOAST.warning) TOAST.warning(`Only ${availablePool} available to add (present + unassigned).`, 'Capped by availability');
            else alert(`Only ${availablePool} available to add (present + unassigned).`);
          } catch(_) { /* no-op */ }
        }
        if (desired > countsNow){
          const toAdd = desired - countsNow;
          const added = assignRandomToTile(key, toAdd);
          if (added < toAdd) alert(`Only ${added} could be assigned (not enough unassigned).`);
        } else if (desired < countsNow){
          const toRemove = countsNow - desired;
          unassignFromTile(key, toRemove);
        }
        setCounts();
        // Snapshot the quarter after changes
        try{ if (typeof snapshotCurrentQuarter === 'function') snapshotCurrentQuarter(); }catch(_){ }
        // Log overrides for moved badges when applicable
        if (doOverride){
          const afterInTile = new Set(Object.values(STATE.badges).filter(b => b.loc === key).map(b => b.id));
          // Added to tile: ids in after not in before
          Object.values(STATE.badges).forEach(b => {
            if (afterInTile.has(b.id) && !beforeInTile.has(b.id)){
              addOverrideLog(b.id, 'unassigned', key);
            }
            if (beforeInTile.has(b.id) && !afterInTile.has(b.id)){
              addOverrideLog(b.id, key, 'unassigned');
            }
          });
        }
      });
    }
  });

  // unassigned stack should accept drops too
  if (unassignedStack) makeDropTarget(unassignedStack, 'unassigned');

  // Unassigned dropdown overlay handling
  const toggleUnassignedBtn = document.getElementById('toggleUnassignedBtn');
  const leftPanelEl = document.getElementById('leftPanel');
  let overlayEl = null;
  let _savedBodyOverflow = null;
  let _savedLeftPanelOverflow = null;
  let _overlayRepositionHandler = null;

  function openUnassignedOverlay(){
    if (overlayEl) return;
    // Create an in-panel dropdown (no full-screen backdrop)
    overlayEl = document.createElement('div');
    overlayEl.id = 'unassignedOverlay';
    overlayEl.style.position = 'absolute';
    // anchor just under the header/toggle area inside leftPanel
    const anchor = document.getElementById('toggleUnassignedBtn') || leftPanelEl;
    const topY = (anchor?.offsetTop || 0) + (anchor?.offsetHeight || 0) + 8;
    overlayEl.style.top = topY + 'px';
    overlayEl.style.left = '8px';
    overlayEl.style.right = '8px';
    overlayEl.style.bottom = '8px';
    overlayEl.style.background = '#fff';
    overlayEl.style.border = '1px solid #d1d5db';
    overlayEl.style.borderRadius = '10px';
    overlayEl.style.boxShadow = '0 8px 16px rgba(0,0,0,0.12)';
    overlayEl.style.padding = '10px';
    overlayEl.style.zIndex = '10';
    overlayEl.style.overflow = 'auto';

    // Header with close
    const hdr = document.createElement('div');
    hdr.style.display='flex'; hdr.style.justifyContent='space-between'; hdr.style.alignItems='center'; hdr.style.marginBottom='6px';
    const title = document.createElement('strong'); title.textContent = 'Unassigned'; hdr.appendChild(title);
    const closeBtn = document.createElement('button'); closeBtn.className = 'text-sm text-gray-600 border rounded p-1'; closeBtn.textContent='✕'; closeBtn.addEventListener('click', closeUnassignedOverlay);
    hdr.appendChild(closeBtn);
    overlayEl.appendChild(hdr);

    // Search bar
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'unassignedSearch';
    searchInput.placeholder = 'Search unassigned by name or ID...';
    searchInput.setAttribute('aria-label','Search unassigned');
    searchInput.style.width = '100%';
    searchInput.style.border = '1px solid #d1d5db';
    searchInput.style.borderRadius = '8px';
    searchInput.style.padding = '8px 10px';
    searchInput.style.fontSize = '13px';
    overlayEl.appendChild(searchInput);

    // Move the unassigned stack into the dropdown and re-render fully
    overlayEl.appendChild(unassignedStack);
    leftPanelEl.style.position = 'relative';
    leftPanelEl.appendChild(overlayEl);

    // Mark expanded
    toggleUnassignedBtn && toggleUnassignedBtn.setAttribute('aria-expanded','true');

    // Re-render to show full list
    try{ renderAllBadges(); }catch(_){ }

    // Wire search filter
    searchInput.addEventListener('input', () => {
      const q = (searchInput.value||'').toLowerCase();
      Array.from(unassignedStack.children).forEach(el => {
        if (!el.classList.contains('unassigned-item')) return;
        el.style.display = !q || (el.textContent||'').toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  function closeUnassignedOverlay(){
    if (!overlayEl) return;
    // Move stack back into the left panel flow
    leftPanelEl.appendChild(unassignedStack);
    if (overlayEl && overlayEl.parentElement) overlayEl.parentElement.removeChild(overlayEl);
    overlayEl = null;
    toggleUnassignedBtn && toggleUnassignedBtn.setAttribute('aria-expanded','false');
    try{ renderAllBadges(); }catch(_){ }
  }

  function outsideClickHandler(e){
    if (!overlayEl) return;
    if (overlayEl.contains(e.target) || toggleUnassignedBtn.contains(e.target)) return;
    closeUnassignedOverlay();
  }

  toggleUnassignedBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (overlayEl) closeUnassignedOverlay(); else openUnassignedOverlay();
  });
  // ESC closes overlay
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlayEl) closeUnassignedOverlay(); });

  // --- Tile pop-out overlay ---
  let tileOverlayEl = null;
  function openTileOverlay(tileKey, title){
    if (tileOverlayEl) closeTileOverlay();
    tileOverlayEl = document.createElement('div');
    tileOverlayEl.id = 'tileOverlay_'+tileKey;
    tileOverlayEl.style.position = 'fixed';
    tileOverlayEl.style.top = '50%';
    tileOverlayEl.style.left = '50%';
    tileOverlayEl.style.transform = 'translate(-50%, -50%)';
    tileOverlayEl.style.width = '720px';
    tileOverlayEl.style.maxWidth = '95vw';
    tileOverlayEl.style.maxHeight = '80vh';
    tileOverlayEl.style.background = '#fff';
    tileOverlayEl.style.border = '2px solid #374151';
    tileOverlayEl.style.borderRadius = '12px';
    tileOverlayEl.style.boxShadow = '0 20px 40px rgba(0,0,0,0.25)';
    tileOverlayEl.style.zIndex = '1100';
    tileOverlayEl.style.display = 'flex';
    tileOverlayEl.style.flexDirection = 'column';

    // header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.background = '#1f2937';
    header.style.color = '#fff';
    header.style.padding = '12px 16px';
    header.style.borderTopLeftRadius = '10px';
    header.style.borderTopRightRadius = '10px';
    const hTitle = document.createElement('div'); hTitle.textContent = title || tileKey.toUpperCase(); hTitle.style.fontWeight = '800';
    const controls = document.createElement('div');
    const search = document.createElement('input');
    search.type = 'text'; search.placeholder = 'Search...';
    search.style.marginRight = '8px'; search.style.padding = '6px 8px'; search.style.borderRadius = '6px'; search.style.border = '1px solid #d1d5db';
    const closeBtn = document.createElement('button'); closeBtn.textContent = '✕'; closeBtn.title = 'Close';
    closeBtn.style.padding = '4px 8px'; closeBtn.style.borderRadius = '6px'; closeBtn.style.border = '1px solid #374151'; closeBtn.style.background = '#fff'; closeBtn.style.color = '#1f2937';
    closeBtn.addEventListener('click', closeTileOverlay);
    controls.appendChild(search); controls.appendChild(closeBtn);
    header.appendChild(hTitle); header.appendChild(controls);
    tileOverlayEl.appendChild(header);

    // content
    const content = document.createElement('div');
    content.style.padding = '12px';
    content.style.overflow = 'auto';
    content.style.flex = '1 1 auto';
    const layer = document.createElement('div');
    layer.className = 'badge-layer path-box';
    layer.style.minHeight = '300px';
    content.appendChild(layer);
    tileOverlayEl.appendChild(content);
    document.body.appendChild(tileOverlayEl);

    // Make it a drop target for the tile
    makeDropTarget(layer, tileKey);

    // Render badges currently in this tile
    try{
      Object.values(STATE.badges).forEach(b => {
        if (b.loc === tileKey){
          const node = renderBadge(b);
          if (b.present){ node.classList.add('present'); }
          layer.appendChild(node);
        }
      });
    }catch(_){ }

    // Simple search filter
    const doFilter = () => {
      const q = (search.value || '').toLowerCase();
      Array.from(layer.children).forEach(el => {
        if (!el.classList || !el.classList.contains('badge')) return;
        const text = (el.textContent || '').toLowerCase();
        const eid = (el.getAttribute('data-id') || '').toLowerCase();
        el.style.display = (!q || text.includes(q) || eid.includes(q)) ? '' : 'none';
      });
    };
    search.addEventListener('input', doFilter);
    doFilter();

    // backdrop (click outside to close)
    const backdrop = document.createElement('div');
    backdrop.style.position = 'fixed'; backdrop.style.left = '0'; backdrop.style.top = '0'; backdrop.style.right = '0'; backdrop.style.bottom = '0';
    backdrop.style.background = 'rgba(0,0,0,0.35)'; backdrop.style.zIndex = '1099';
    backdrop.addEventListener('click', closeTileOverlay);
    document.body.appendChild(backdrop);
    tileOverlayEl._backdrop = backdrop;

    // Prevent body scroll while open
    try{ document.body.style.overflow = 'hidden'; }catch(_){ }
  }

  function closeTileOverlay(){
    if (!tileOverlayEl) return;
    if (tileOverlayEl._backdrop && tileOverlayEl._backdrop.parentElement) tileOverlayEl._backdrop.parentElement.removeChild(tileOverlayEl._backdrop);
    if (tileOverlayEl.parentElement) tileOverlayEl.parentElement.removeChild(tileOverlayEl);
    tileOverlayEl = null;
    try{ document.body.style.overflow = ''; }catch(_){ }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tileOverlayEl) closeTileOverlay(); });

  // In-memory badge store with analytics tracking and multi-site support
  const STATE = window.STATE;

  // Multi-Site Management Functions
  // MULTISITE module is loaded from js/modules/multisite.js
  const MULTISITE = window.MULTISITE;


  // Analytics and Data Collection System
  const ANALYTICS = window.ANALYTICS;
  // Load analytics data on startup
  ANALYTICS.loadAnalyticsData();
  // Load saved quarter snapshots if available
  try{
    const qa = localStorage.getItem('vlab:quarterAssignments');
    if (qa){ 
      const parsed = JSON.parse(qa); 
      if (parsed && typeof parsed === 'object') {
        STATE.quarterAssignments = Object.assign({Q1:{},Q2:{},Q3:{}}, parsed);
        console.log('[QUARTER] Loaded quarter assignments from localStorage:', Object.keys(STATE.quarterAssignments).map(q => `${q}:${Object.keys(STATE.quarterAssignments[q]).length}`));
      }
    }
  }catch(e){ 
    console.warn('[QUARTER] Failed to load quarter assignments:', e);
  }
  
  // Global flag to prevent auto-load during form processing
  let isFormProcessing = false;

  // Auto-load last roster and assignments on page refresh
  function autoLoadLastRoster() {
    console.log('[AUTO-LOAD] Starting auto-load process...');
    
    // Don't auto-load if we're currently processing a form submission
    if (isFormProcessing) {
      console.log('[AUTO-LOAD] Skipping auto-load - form is being processed');
      return;
    }
    
    try {
      const raw = localStorage.getItem('vlab:lastRoster');
      console.log('[AUTO-LOAD] Raw data found:', !!raw, raw ? raw.length + ' characters' : 'none');
      if (raw) {
        const snap = JSON.parse(raw);
        console.log('[AUTO-LOAD] Parsed roster data:', {
          hasBadges: !!snap.badges,
          badgeCount: snap.badges ? Object.keys(snap.badges).length : 0,
          hasSites: !!snap.sites,
          currentSite: snap.currentSite,
          hasMeta: !!snap.meta
        });
        console.log('[AUTO-LOAD] Found saved roster data, restoring assignments...');
        
        // Restore badges
        if (snap.badges) {
          console.log('[AUTO-LOAD] Restoring', Object.keys(snap.badges).length, 'badges');
          STATE.badges = snap.badges;
          
          // Debug: Count initial assignments in badges
          const initialAssigned = Object.values(STATE.badges).filter(b => b.loc !== 'unassigned' && b.loc !== 'assigned-elsewhere');
          console.log('[AUTO-LOAD] Badges with assignments found:', initialAssigned.length);
          initialAssigned.forEach(b => console.log('  -', b.name, '→', b.loc));
        }
        
        // Restore multi-site data
        if (snap.sites) {
          STATE.sites = snap.sites;
          console.log('[AUTO-LOAD] Restored site data:', STATE.sites);
          
          // Debug YDD4 assignments specifically
          if (STATE.sites.YDD4 && STATE.sites.YDD4.assignments) {
            console.log('[AUTO-LOAD] YDD4 assignments restored from localStorage:', STATE.sites.YDD4.assignments);
          }
        }
        
        // Restore current site
        if (snap.currentSite) {
          STATE.currentSite = snap.currentSite;
          // Update UI selectors
          const headerSelector = document.getElementById('headerSiteSelector');
          const formSelector = document.getElementById('site');
          if (headerSelector) headerSelector.value = snap.currentSite;
          if (formSelector) formSelector.value = snap.currentSite;
        }
        
        // Restore form data
        if (snap.meta) {
          if (snap.meta.date) {
            const dateInput = document.getElementById('date');
            if (dateInput) dateInput.value = snap.meta.date;
          }
          if (snap.meta.shift) {
            const shiftRadio = document.querySelector(`input[name="shift"][value="${snap.meta.shift}"]`);
            if (shiftRadio) shiftRadio.checked = true;
          }
          if (snap.meta.site) {
            const siteSelect = document.getElementById('site');
            if (siteSelect) siteSelect.value = snap.meta.site;
          }
          if (snap.meta.quarter) {
            STATE.currentQuarter = snap.meta.quarter;
            const quarterSelect = document.getElementById('quarter');
            if (quarterSelect) quarterSelect.value = snap.meta.quarter;
          }
        }
        
        // Restore assignments with perfect preservation across all sites
        if (STATE.sites && STATE.currentSite) {
          console.log('[AUTO-LOAD] Applying site-based filtering while preserving all assignments for:', STATE.currentSite);
          
          // First, let's try a simple approach: restore ALL badge assignments regardless of site filtering
          console.log('[AUTO-LOAD] SIMPLE RESTORE: Restoring all badge assignments from snapshot');
          let restoredCount = 0;
          Object.values(STATE.badges).forEach(badge => {
            // Get the original assignment from the snapshot
            if (badge.loc && badge.loc !== 'unassigned') {
              console.log(`[AUTO-LOAD] SIMPLE: Badge ${badge.name} has assignment: ${badge.loc}`);
              restoredCount++;
            }
          });
          console.log(`[AUTO-LOAD] SIMPLE: Found ${restoredCount} badges with assignments in snapshot`);
          
          // Now apply site filtering for visibility only (don't change assignments)
          Object.values(STATE.badges).forEach(badge => {
            const belongsToCurrentSite = MULTISITE.badgeBelongsToSite(badge, STATE.currentSite);
            badge.hidden = !belongsToCurrentSite;
            
            if (belongsToCurrentSite) {
              console.log(`[AUTO-LOAD] Badge ${badge.name} (site: ${badge.site}) visible in ${STATE.currentSite}, assignment: ${badge.loc}`);
            }
          });
          
          // LEGACY COMPLEX RESTORE (keeping for comparison)
          // Special handling for YDD2/YDD4 to ensure site-specific assignments are properly restored
          if (STATE.currentSite === 'YDD2' || STATE.currentSite === 'YDD4') {
            console.log(`[AUTO-LOAD] LEGACY YDD handling for site: ${STATE.currentSite}`);
            console.log(`[AUTO-LOAD] ${STATE.currentSite} assignments:`, STATE.sites[STATE.currentSite].assignments);
            
            // Count assignments before restoration
            const assignmentCount = Object.keys(STATE.sites[STATE.currentSite].assignments).length;
            console.log(`[AUTO-LOAD] Found ${assignmentCount} assignments for ${STATE.currentSite}`);
            
            // For YDD sites, also check site-specific assignments (but don't override badge.loc unless necessary)
            Object.values(STATE.badges).forEach(badge => {
              const belongsToCurrentSite = MULTISITE.badgeBelongsToSite(badge, STATE.currentSite);
              console.log(`[AUTO-LOAD] Badge ${badge.name} (site: ${badge.site}) belongs to ${STATE.currentSite}?`, belongsToCurrentSite);
              
              if (belongsToCurrentSite) {
                // Check if there's a site-specific assignment that differs from badge.loc
                const siteAssignment = STATE.sites[STATE.currentSite].assignments[badge.id];
                console.log(`[AUTO-LOAD] Site assignment for ${badge.name}:`, siteAssignment, 'vs current loc:', badge.loc);
                
                if (siteAssignment && siteAssignment !== badge.loc) {
                  // Override badge location with site-specific assignment
                  const oldLoc = badge.loc;
                  badge.loc = siteAssignment;
                  console.log(`[AUTO-LOAD] OVERRIDE: Restored ${badge.name} from ${oldLoc} to ${siteAssignment} for ${STATE.currentSite}`);
                  
                  // Special debugging for YDD4 restorations
                  if (STATE.currentSite === 'YDD4') {
                    console.log(`[YDD4-AUTO-LOAD] Successfully restored YDD4 assignment: ${badge.name} → ${siteAssignment}`);
                  }
                }
              }
            });
          }
          
          console.log('[AUTO-LOAD] Site filtering applied while preserving all assignments');
        }
        
        // Update display and render
        try {
          console.log('[AUTO-LOAD] Restoring badges:', Object.keys(STATE.badges).length);
          console.log('[AUTO-LOAD] Restoring sites:', Object.keys(STATE.sites || {}).length);
          
          // Count assignments for verification
          const assignedCount = Object.values(STATE.badges).filter(b => b.loc !== 'unassigned' && b.loc !== 'assigned-elsewhere').length;
          console.log('[AUTO-LOAD] Assigned badges count:', assignedCount);
          
          renderAllBadges();
          setCounts();
          updateActualHC();
          
          // Update summary display manually
          if (snap.meta) {
            const elDate = document.getElementById('displayDate');
            const elDay = document.getElementById('displayDay');
            const elShift = document.getElementById('displayShift');
            const elSite = document.getElementById('displaySite');
            
            if (elDate && snap.meta.date) elDate.textContent = snap.meta.date;
            if (elShift && snap.meta.shift) elShift.textContent = snap.meta.shift;
            if (elSite && snap.meta.site) elSite.textContent = snap.meta.site;
            
            if (elDay && snap.meta.date) {
              const dayDate = parseInputDate(snap.meta.date);
              if (dayDate) {
                const dayOfWeek = dayNames[dayDate.getDay()];
                elDay.textContent = dayOfWeek;
              }
            }
          }
          
          // Start analytics session for the restored roster
          if (snap.meta) {
            ANALYTICS.endSession(); // End any existing session
            ANALYTICS.startSession({
              date: snap.meta.date,
              shift: snap.meta.shift,
              site: snap.meta.site,
              plannedHC: snap.meta.plannedHC || 0,
              notes: 'Auto-loaded from saved roster'
            });
            console.log('[AUTO-LOAD] Started analytics session for restored roster');
          }
          
          // Display a visual confirmation of restoration
        const output = document.getElementById('output');
        if (output) {
          const assignedCount = Object.values(STATE.badges).filter(b => 
            b.loc !== 'unassigned' && b.loc !== 'assigned-elsewhere' && b.loc !== 'hidden'
          ).length;
          output.textContent = `✅ Restored board state: ${assignedCount} assignments preserved across refresh`;
          output.style.color = '#059669'; // Green color
          setTimeout(() => {
            output.textContent = '';
          }, 5000);
        }
        
        console.log('[AUTO-LOAD] Successfully restored board state');
        } catch (renderError) {
          console.error('[AUTO-LOAD] Error during render:', renderError);
        }
      }
    } catch (error) {
      console.warn('[AUTO-LOAD] Failed to auto-load roster:', error);
    }
  }
  
  // ULTRA-SIMPLE AUTO-LOAD - bypasses all complex logic
  function simpleAutoLoad() {
    console.log('[AUTO-LOAD] ============ STARTING PROPER DATA FLOW ============');
    
    // Don't run if form is being processed
    if (isFormProcessing) {
      console.log('[AUTO-LOAD] Skipping - form is being processed');
      return;
    }

    // Defensive: ensure database object exists after potential previous clear
    if (typeof DATABASE === 'undefined' || !DATABASE) {
      console.warn('[AUTO-LOAD] DATABASE object missing; re-initializing RosterDatabase');
      try {
        window.DATABASE = new RosterDatabase();
      } catch (err) {
        console.error('[AUTO-LOAD] Failed to reinitialize database:', err);
      }
    }
    
    // STEP 1: Get the database
    if (!DATABASE || !DATABASE.database || DATABASE.database.size === 0) {
      console.log('[AUTO-LOAD] No database found or empty - nothing to load');
      return;
    }
    
    console.log(`[AUTO-LOAD] 📊 Database contains ${DATABASE.database.size} total employees`);
    
    // STEP 2: Get form values
    const siteSelect = document.getElementById('site');
    const shiftRadio = document.querySelector('input[name="shift"]:checked');
    const dateInput = document.getElementById('date');

    if (!siteSelect || !shiftRadio || !dateInput) {
      console.warn('[AUTO-LOAD] Required form controls missing (site/shift/date). Aborting auto-load.');
      return;
    }
    
    const currentSite = siteSelect?.value || 'YHM2';
    const currentShift = shiftRadio?.value || 'day';
    const currentDate = dateInput?.value || new Date().toISOString().split('T')[0];
    
    console.log(`[AUTO-LOAD] 🎯 FILTERS: Site=${currentSite}, Shift=${currentShift}, Date=${currentDate}`);
    
    // STEP 3: Apply proper filtering with ACTUAL filtering (not just logging)
    const allEmployees = Array.from(DATABASE.database.values());
    console.log(`[AUTO-LOAD] 📋 Starting with ${allEmployees.length} total employees`);
    
    // Get allowed shift codes for this date/shift combination
  const allowedShiftCodes = getAllowedCodes(currentDate, currentShift); // now respects STRICT_WEEK
  const dayNightSet = currentShift === 'day' ? DAY_SET : NIGHT_SET;
  console.log(`[AUTO-LOAD] ⏰ Allowed (calendar) shift codes for ${currentShift} on ${currentDate}: ${allowedShiftCodes.join(', ')}`);
  console.log(`[AUTO-LOAD] ⏰ Core ${currentShift === 'day' ? 'DAY' : 'NIGHT'} set restriction: ${Array.from(dayNightSet).join(', ')}`);
    
    // CRITICAL FIX: Apply filtering and actually USE the filtered result
    const filteredEmployees = allEmployees.filter(emp => {
      // Site filtering — prefer normalized fields from database entries
      const empSite = (emp.site || emp.Site) ? String(emp.site || emp.Site).toUpperCase() : classifySite(emp);
      
      // Skip ICQA (Other category) - they're not operational associates
      if (empSite === 'Other') {
        return false; // ACTUALLY FILTER OUT
      }
      
      // Site matching logic
      let siteMatch = false;
      if (currentSite === 'YHM2') {
        siteMatch = (empSite === 'YHM2');
      } else if (currentSite === 'YDD2' || currentSite === 'YDD4') {
        siteMatch = ['YDD2', 'YDD4', 'YDD_SHARED'].includes(empSite);
      }
      
      if (!siteMatch) {
        return false; // ACTUALLY FILTER OUT
      }
      
      // Shift filtering (two layers): first membership in day/night set, then date-specific allowance
      const rawPattern = emp['Shift Pattern'] || emp.ShiftCode || emp.shiftPattern || '';
      const empShiftCode = (emp.scode || emp.shiftCode || '').toString().toUpperCase() || shiftCodeOf(rawPattern);
      if (!dayNightSet.has(empShiftCode)) {
        return false;
      }
      if (allowedShiftCodes.length && !allowedShiftCodes.includes(empShiftCode)) {
        return false;
      }
      
      return true; // KEEP this employee
    });
    
  const dropped = allEmployees.length - filteredEmployees.length;
  console.log(`[AUTO-LOAD] ✅ FILTERING COMPLETE: ${allEmployees.length} → ${filteredEmployees.length} employees (dropped ${dropped})`);
    
    // STEP 4: Create badges ONLY for filtered employees (this is the key fix)
    STATE.badges = {}; // Clear existing
    
    filteredEmployees.forEach(emp => {
      const empId = emp['Employee ID'] || emp.ID || emp.EID || emp.eid;
      const badgeId = `b_${empId}`;
      
      STATE.badges[badgeId] = {
        id: badgeId,
        name: emp['Employee Name'] || emp.Name || emp.name || 'Unknown',
        eid: empId || '',
        scode: (emp.scode || emp.shiftCode || '').toString().toUpperCase() ||
               shiftCodeOf(emp['Shift Pattern'] || emp.ShiftCode || emp.shiftPattern || ''),
        site: (emp.site || emp.Site) ? String(emp.site || emp.Site).toUpperCase() : classifySite(emp),
        present: true,
        loc: 'unassigned'
      };
    });
    
    console.log(`[AUTO-LOAD] 🎫 Created badges for FILTERED employees only: ${Object.keys(STATE.badges).length}`);
    // Initialize overview chip stats for auto-load path
    try {
      window.VLAB_REGULAR_HC = Object.keys(STATE.badges).length;
      window.VLAB_UPLOADED_LOGINS = 0;
      window.VLAB_ADJUST_STATS = window.VLAB_ADJUST_STATS || { SWAPIN:0, SWAPOUT:0, VET:0, VTO:0 };
    } catch(_) {}
    
    // STEP 5: Attempt to restore previous assignments from last snapshot
    try {
      const snapRaw = localStorage.getItem('vlab:lastRoster');
      if (snapRaw) {
        const snap = JSON.parse(snapRaw);
        // Prefer restoring full multi-site structure first
        if (snap.sites) {
          STATE.sites = snap.sites;
        }
        if (snap.badges) {
          Object.keys(STATE.badges).forEach(bid => {
            if (snap.badges[bid] && typeof snap.badges[bid].loc !== 'undefined') {
              STATE.badges[bid].loc = snap.badges[bid].loc;
            }
          });
        }
        console.log('[AUTO-LOAD] Restored assignments from last snapshot');
      }
    } catch (e) { console.warn('[AUTO-LOAD] Failed to restore assignments from snapshot:', e); }

    // STEP 6: Quarter system fix - load ALL quarters but keep same employee pool
    console.log(`[AUTO-LOAD] 📂 Fixing quarter system - employees stay constant across quarters`);
    
    // Restore assignments but keep the same employee pool across ALL quarters
    try {
      const savedAssignments = localStorage.getItem('vlab:assignments');
      if (savedAssignments) {
        const assignments = JSON.parse(savedAssignments);
        Object.keys(assignments).forEach(badgeId => {
          if (STATE.badges[badgeId]) {
            STATE.badges[badgeId].loc = assignments[badgeId];
            console.log(`[AUTO-LOAD] 📌 Restored: ${STATE.badges[badgeId].name} → ${assignments[badgeId]}`);
          }
        });
      }
    } catch (e) {
      console.log('[AUTO-LOAD] No assignments to restore');
    }
    
  // STEP 7: Update UI state
    STATE.currentSite = currentSite;
    
    // Update site selectors
    const headerSelector = document.getElementById('headerSiteSelector');
    if (headerSelector) headerSelector.value = currentSite;
    
    // Update unassigned header
    const unassignedLabel = document.getElementById('unassignedSiteLabel');
    if (unassignedLabel) unassignedLabel.textContent = `${currentSite} Unassigned`;
    
    // STEP 8: Render the FILTERED badges (not the original dataset)
    try {
      applySiteFilter(); // Apply any additional visibility rules
      renderAllBadges(); // This now uses the filtered STATE.badges
      setCounts();
  // Update roster headcount overview after new roster build
  try{ renderHeadcountOverview(); }catch(err){ console.warn('[HEADCOUNT] render skipped:', err); }
    } catch (renderErr) {
      console.error('[AUTO-LOAD] Rendering failure:', renderErr);
    }
    
    // STEP 9: Start analytics with correct headcount
    try {
      if (window.ANALYTICS) {
        ANALYTICS.endSession();
        ANALYTICS.startSession({
          date: currentDate,
          shift: currentShift,
          site: currentSite,
          plannedHC: Object.keys(STATE.badges).length, // Use filtered count
          notes: `Auto-loaded: ${Object.keys(STATE.badges).length} associates (properly filtered)`
        });
      }
    } catch (e) {
      console.log('[AUTO-LOAD] Analytics not available');
    }
    
  // STEP 10: Show success message with CORRECT count
    const output = document.getElementById('output');
    if (output) {
      output.innerHTML = `<div style="color: #059669; font-weight: 500;">✅ Loaded ${Object.keys(STATE.badges).length} associates for ${currentSite} ${currentShift} shift (properly filtered)</div>`;
    }
    
    console.log(`[AUTO-LOAD] ✅ SUCCESS: ${Object.keys(STATE.badges).length} associates loaded (was ${allEmployees.length} before filtering)`);
    console.log('[AUTO-LOAD] ============ PROPER DATA FLOW COMPLETE ============');
  }

  // Auto-load after a delay to ensure DOM is ready
  setTimeout(() => {
    console.log('[AUTO-LOAD] Timer triggered, using simple auto-load...');
    // Double-check that key elements are available
  const formEl = document.getElementById('rosterForm') || document.getElementById('laborForm');
    const unassignedEl = document.getElementById('unassignedStack');
    
    if (formEl && unassignedEl) {
      console.log('[AUTO-LOAD] DOM elements found, proceeding with simple auto-load...');
      
      // Check current STATE before auto-load
      console.log('[AUTO-LOAD] Current STATE before auto-load:');
      console.log('  - Badges:', Object.keys(STATE.badges || {}).length);
      console.log('  - Sites:', Object.keys(STATE.sites || {}).length);
      console.log('  - Current site:', STATE.currentSite);
      
      simpleAutoLoad();
    } else {
      console.warn('[AUTO-LOAD] DOM not ready, retrying in 1 second...');
      setTimeout(simpleAutoLoad, 1000);
    }
  }, 800);

  // Save snapshot on unload so assignments persist even without further interactions
  window.addEventListener('beforeunload', () => {
    try {
      const snap = {
        badges: STATE.badges,
        sites: STATE.sites,
        currentSite: STATE.currentSite,
        meta: {
          date: document.getElementById('date')?.value || '',
          shift: document.querySelector('input[name="shift"]:checked')?.value || 'day',
          site: STATE.currentSite,
          quarter: STATE.currentQuarter || 'Q1'
        }
      };
      localStorage.setItem('vlab:lastRoster', JSON.stringify(snap));
    } catch(_) {}
  });

  // ====== TOAST NOTIFICATION SYSTEM ======
  
  class ToastManager {
    constructor() {
      this.container = document.getElementById('toastContainer');
      this.toastId = 0;
    }
    
    show(message, type = 'success', title = null, duration = 4000) {
      const toast = this.createToast(message, type, title, duration);
      this.container.appendChild(toast);
      
      // Trigger animation
      setTimeout(() => toast.classList.add('show'), 100);
      
      // Auto remove
      setTimeout(() => this.remove(toast), duration);
      
      return toast;
    }
    
    createToast(message, type, title, duration) {
      const toastId = `toast-${++this.toastId}`;
      const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
      };
      
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.id = toastId;
      
      toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
          ${title ? `<div class="toast-title">${title}</div>` : ''}
          <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="TOAST.remove(this.parentElement)">×</button>
      `;
      
      return toast;
    }
    
    remove(toast) {
      if (toast && toast.parentElement) {
        toast.classList.remove('show');
        setTimeout(() => {
          if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
          }
        }, 300);
      }
    }
    
    success(message, title = null) {
      return this.show(message, 'success', title);
    }
    
    error(message, title = null) {
      return this.show(message, 'error', title);
    }
    
    warning(message, title = null) {
      return this.show(message, 'warning', title);
    }
    
    info(message, title = null) {
      return this.show(message, 'info', title);
    }
  }
  
  // Initialize toast manager
  const TOAST = new ToastManager();
  window.TOAST = TOAST; // Make globally available
  
  // Helper function to get display names for tiles
  function getTileDisplayName(tileKey) {
    const tileNames = {
      'cb': 'Cross Belt',
      'sort': 'Sort',
      'pack': 'Pack',
      'ps': 'Problem Solve',
      'dock': 'Dock',
      'fluid': 'Fluid',
      'tdr': 'TDR',
      'singles': 'Singles',
      'amnesty': 'Amnesty',
      'damaged': 'Damaged',
      'gift': 'Gift Wrap',
      'hazmat': 'Hazmat',
      'liquids': 'Liquids',
      'oversized': 'Oversized',
      'quality': 'Quality'
    };
    return tileNames[tileKey] || tileKey.charAt(0).toUpperCase() + tileKey.slice(1);
  }

  // ====== BULK ASSIGNMENT SYSTEM ======
  
  class BulkAssignmentManager {
    constructor() {
      this.selectedBadges = new Set();
      this.setupEventListeners();
    }
    
    setupEventListeners() {
      // Filter controls
      const nameFilter = document.getElementById('nameFilter');
      const deptFilter = document.getElementById('deptFilter');
      const shiftFilter = document.getElementById('shiftFilter');
      const clearFilters = document.getElementById('clearFilters');
      
      // Bulk action controls
      const selectAllBtn = document.getElementById('selectAllBtn');
      const clearSelectionBtn = document.getElementById('clearSelectionBtn');
      const bulkAssignBtn = document.getElementById('bulkAssignBtn');
      const bulkAssignTarget = document.getElementById('bulkAssignTarget');
      
      if (nameFilter) nameFilter.addEventListener('input', this.applyFilters.bind(this));
      if (deptFilter) deptFilter.addEventListener('change', this.applyFilters.bind(this));
      if (shiftFilter) shiftFilter.addEventListener('change', this.applyFilters.bind(this));
      if (clearFilters) clearFilters.addEventListener('click', this.clearFilters.bind(this));
      
      if (selectAllBtn) selectAllBtn.addEventListener('click', this.selectAllVisible.bind(this));
      if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', this.clearSelection.bind(this));
      if (bulkAssignBtn) bulkAssignBtn.addEventListener('click', this.performBulkAssignment.bind(this));
      
      // Populate assignment targets
      this.populateAssignmentTargets();
    }
    
    populateAssignmentTargets() {
      const select = document.getElementById('bulkAssignTarget');
      if (!select) return;
      
      // Clear existing options except first
      select.innerHTML = '<option value="">Assign to...</option>';
      
      // Add tiles as options
      TILES.forEach(([tileId, tileKey]) => {
        if (tileKey) {
          const option = document.createElement('option');
          option.value = tileKey;
          option.textContent = getTileDisplayName(tileKey);
          select.appendChild(option);
        }
      });
    }
    
    populateFilterOptions() {
      const deptFilter = document.getElementById('deptFilter');
      const shiftFilter = document.getElementById('shiftFilter');
      
      if (deptFilter) {
        const departments = new Set();
        const shifts = new Set();
        
        Object.values(STATE.badges).forEach(badge => {
          if (badge.loc === 'unassigned' && !badge.hidden) {
            if (badge.eid) {
              const dept = badge.eid.toString().substring(0, 7); // First 7 digits as dept
              departments.add(dept);
            }
            if (badge.scode) shifts.add(badge.scode);
          }
        });
        
        // Clear and populate department filter
        deptFilter.innerHTML = '<option value="">All</option>';
        Array.from(departments).sort().forEach(dept => {
          const option = document.createElement('option');
          option.value = dept;
          option.textContent = dept;
          deptFilter.appendChild(option);
        });
        
        // Clear and populate shift filter
        shiftFilter.innerHTML = '<option value="">All</option>';
        Array.from(shifts).sort().forEach(shift => {
          const option = document.createElement('option');
          option.value = shift;
          option.textContent = shift;
          shiftFilter.appendChild(option);
        });
      }
    }
    
    applyFilters() {
      const nameFilter = document.getElementById('nameFilter')?.value.toLowerCase() || '';
      const deptFilter = document.getElementById('deptFilter')?.value || '';
      const shiftFilter = document.getElementById('shiftFilter')?.value || '';
      
      const badges = document.querySelectorAll('.badge');
      let visibleCount = 0;
      
      badges.forEach(badgeEl => {
        const badgeId = badgeEl.id;
        const badge = STATE.badges[badgeId];
        
        if (!badge || badge.loc !== 'unassigned' || badge.hidden) {
          badgeEl.style.display = 'none';
          return;
        }
        
        let show = true;
        
        // Name/ID filter
        if (nameFilter) {
          const name = (badge.name || '').toLowerCase();
          const eid = (badge.eid || '').toString().toLowerCase();
          show = show && (name.includes(nameFilter) || eid.includes(nameFilter));
        }
        
        // Department filter
        if (deptFilter && badge.eid) {
          const dept = badge.eid.toString().substring(0, 7);
          show = show && (dept === deptFilter);
        }
        
        // Shift filter
        if (shiftFilter) {
          show = show && (badge.scode === shiftFilter);
        }
        
        badgeEl.style.display = show ? '' : 'none';
        if (show) visibleCount++;
      });
      
      // Update counts
      this.updateSelectionUI();
    }
    
    clearFilters() {
      document.getElementById('nameFilter').value = '';
      document.getElementById('deptFilter').value = '';
      document.getElementById('shiftFilter').value = '';
      this.applyFilters();
    }
    
    selectAllVisible() {
      const visibleBadges = document.querySelectorAll('.badge:not([style*="display: none"]) .badge-checkbox');
      visibleBadges.forEach(checkbox => {
        checkbox.checked = true;
        this.selectedBadges.add(checkbox.getAttribute('data-badge-id'));
      });
      this.updateSelectionUI();
    }
    
    clearSelection() {
      this.selectedBadges.clear();
      document.querySelectorAll('.badge-checkbox').forEach(checkbox => {
        checkbox.checked = false;
      });
      this.updateSelectionUI();
    }
    
    updateSelectionUI() {
      const count = this.selectedBadges.size;
      const countEl = document.querySelector('.selected-count');
      const bulkActions = document.getElementById('bulkActions');
      
      if (countEl) countEl.textContent = `${count} selected`;
      if (bulkActions) {
        bulkActions.classList.toggle('show', count > 0);
      }
      
      // Update badge styling
      document.querySelectorAll('.badge').forEach(badgeEl => {
        const isSelected = this.selectedBadges.has(badgeEl.id);
        badgeEl.classList.toggle('selected', isSelected);
      });
    }
    
    performBulkAssignment() {
      const target = document.getElementById('bulkAssignTarget')?.value;
      if (!target || this.selectedBadges.size === 0) {
        TOAST.warning('Please select badges and a target location', 'Bulk Assignment');
        return;
      }
      
      const targetName = getTileDisplayName(target);
      const count = this.selectedBadges.size;
      
      if (!confirm(`Assign ${count} associates to ${targetName}?`)) {
        return;
      }
      
      let successCount = 0;
      
      this.selectedBadges.forEach(badgeId => {
        const badge = STATE.badges[badgeId];
        if (badge && badge.loc === 'unassigned') {
          // Perform assignment using same logic as drag-and-drop
          const currentSite = STATE.currentSite;
          
          // Remove from all sites first
          Object.keys(STATE.sites).forEach(siteCode => {
            delete STATE.sites[siteCode].assignments[badgeId];
          });
          
          // Add to current site
          STATE.sites[currentSite].assignments[badgeId] = target;
          badge.loc = target;
          
          // Save to quarter
          STATE.quarterAssignments[STATE.currentQuarter] = STATE.quarterAssignments[STATE.currentQuarter] || {};
          STATE.quarterAssignments[STATE.currentQuarter][badgeId] = target;
          
          successCount++;
        }
      });
      
      // Save state
      MULTISITE.saveToStorage();
      localStorage.setItem('vlab:quarterAssignments', JSON.stringify(STATE.quarterAssignments));
      
      // Clear selection and re-render
      this.clearSelection();
      renderAllBadges();
      setCounts();
      
      TOAST.success(`${successCount} associates assigned to ${targetName}`, 'Bulk Assignment Complete');
    }
  }
  
  // Badge selection handler
  function handleBadgeSelection(event) {
    const checkbox = event.target;
    const badgeId = checkbox.getAttribute('data-badge-id');
    
    if (checkbox.checked) {
      BULK.selectedBadges.add(badgeId);
    } else {
      BULK.selectedBadges.delete(badgeId);
    }
    
    BULK.updateSelectionUI();
  }
  
  // Initialize bulk assignment manager
  const BULK = new BulkAssignmentManager();
  window.BULK = BULK;

  // ====== SMART ASSIGNMENT TOOLS ======
  
  class SmartAssignmentManager {
    constructor() {
      this.setupEventListeners();
    }
    
    setupEventListeners() {
      // Auto assignment
      // Smart assignment UI removed from roster; guard for future reintroduction on Site Board.
      const autoAssignBtn = document.getElementById('autoAssignBtn');
      if (autoAssignBtn) autoAssignBtn.addEventListener('click', this.autoAssignAll.bind(this));
      // Other buttons are intentionally absent; no-op if missing.
      this.populateRapidTargets();
    }
    
    populateRapidTargets() {
      const select = document.getElementById('rapidTarget');
      if (!select) return;
      
      select.innerHTML = '<option value="">To process...</option>';
      TILES.forEach(([tileId, tileKey]) => {
        if (tileKey) {
          const option = document.createElement('option');
          option.value = tileKey;
          option.textContent = getTileDisplayName(tileKey);
          select.appendChild(option);
        }
      });
    }
    
    async autoAssignAll() {
      const unassignedBadges = Object.values(STATE.badges).filter(
        badge => badge.loc === 'unassigned' && !badge.hidden
      );
      
      if (unassignedBadges.length === 0) {
        TOAST.show('No unassigned associates to auto-assign', 'warning');
        return;
      }
      
      const confirmed = await this.showConfirmDialog(
        `Auto-assign ${unassignedBadges.length} associates using rotation fairness?`,
        'This will automatically assign associates based on rotation priority scores to ensure fair distribution across process paths.'
      );
      
      if (!confirmed) return;
      
      let assignedCount = 0;
      const assignments = [];
      
      // Get capacity needs for each process
      const capacityNeeds = this.getCapacityNeeds();
      const processQueue = Object.entries(capacityNeeds)
        .filter(([process, need]) => need > 0)
        .sort(([,a], [,b]) => b - a); // Sort by highest need first
      
      // Use rotation-based assignment for each process
      for (const [processKey, need] of processQueue) {
        // Get ranked candidates using rotation scoring
        const candidates = ANALYTICS.ROTATION.getRankedCandidatesForPath(processKey, {
          site: STATE.currentSite,
          shift: document.querySelector('input[name="shift"]:checked')?.value,
          includeAssigned: false
        });
        
        // Assign top N candidates based on capacity need
        const toAssign = candidates.slice(0, need);
        toAssign.forEach(candidate => {
          assignments.push({ 
            badgeId: candidate.badgeId, 
            processKey: processKey,
            score: candidate.priorityScore,
            name: candidate.name
          });
        });
      }
      
      // If there are remaining unassigned badges after meeting capacity needs,
      // distribute them to paths with lowest current headcount using rotation scores
      const assignedBadgeIds = new Set(assignments.map(a => a.badgeId));
      const remainingBadges = unassignedBadges.filter(b => !assignedBadgeIds.has(b.id));
      
      if (remainingBadges.length > 0) {
        const allProcessKeys = TILES.map(([,key]) => key).filter(key => key);
        
        // Get current counts per process
        const processCounts = {};
        allProcessKeys.forEach(key => {
          processCounts[key] = Object.values(STATE.badges).filter(b => b.loc === key).length;
        });
        
        // For each remaining badge, find best path by rotation score
        remainingBadges.forEach(badge => {
          // Get rotation scores for all paths
          const pathScores = allProcessKeys.map(pathKey => {
            const score = ANALYTICS.ROTATION.calculateEnhancedRotationScore(badge.eid, pathKey);
            return {
              pathKey: pathKey,
              priorityScore: score.priorityScore,
              currentCount: processCounts[pathKey] || 0
            };
          });
          
          // Sort by priority score DESC, then by current count ASC (prefer less crowded)
          pathScores.sort((a, b) => {
            if (Math.abs(b.priorityScore - a.priorityScore) > 0.5) {
              return b.priorityScore - a.priorityScore;
            }
            return a.currentCount - b.currentCount;
          });
          
          const bestPath = pathScores[0];
          assignments.push({
            badgeId: badge.id,
            processKey: bestPath.pathKey,
            score: bestPath.priorityScore,
            name: badge.name
          });
          processCounts[bestPath.pathKey] = (processCounts[bestPath.pathKey] || 0) + 1;
        });
      }
      
      // Apply all assignments with animation delay
      for (const { badgeId, processKey, score, name } of assignments) {
        dragDrop(null, processKey, badgeId);
        assignedCount++;
      }
      
      // Show summary with rotation info
      const avgScore = assignments.reduce((sum, a) => sum + (a.score || 0), 0) / assignments.length;
      TOAST.show(`🤖 Auto-assigned ${assignedCount} associates (Avg Rotation Score: ${avgScore.toFixed(1)})`, 'success');
      
      console.log('[AUTO-ASSIGN] Rotation-based assignments:', assignments.map(a => `${a.name} → ${a.processKey} (${a.score?.toFixed(2)})`));
    }
    
    async selectByShift() {
      const shifts = this.getAvailableShifts();
      if (shifts.length === 0) {
        TOAST.show('No shifts available to select from', 'warning');
        return;
      }
      
      const shift = await this.showShiftSelector(shifts);
      if (!shift) return;
      
      const badges = Object.values(STATE.badges).filter(
        badge => badge.loc === 'unassigned' && !badge.hidden && badge.scode === shift
      );
      
      this.selectBadges(badges);
      TOAST.show(`Selected ${badges.length} associates with shift ${shift}`, 'success');
    }
    
    async selectByDepartment() {
      const departments = this.getAvailableDepartments();
      if (departments.length === 0) {
        TOAST.show('No departments available to select from', 'warning');
        return;
      }
      
      const dept = await this.showDepartmentSelector(departments);
      if (!dept) return;
      
      const badges = Object.values(STATE.badges).filter(badge => {
        if (badge.loc !== 'unassigned' || badge.hidden) return false;
        const badgeDept = badge.eid ? badge.eid.toString().substring(0, 7) : '';
        return badgeDept === dept;
      });
      
      this.selectBadges(badges);
      TOAST.show(`Selected ${badges.length} associates from department ${dept}`, 'success');
    }
    
    async selectFirstN() {
      const unassignedCount = Object.values(STATE.badges).filter(
        badge => badge.loc === 'unassigned' && !badge.hidden
      ).length;
      
      if (unassignedCount === 0) {
        TOAST.show('No unassigned associates available', 'warning');
        return;
      }
      
      const count = await this.showNumberInput(
        'Select first N associates',
        `Enter number of associates to select (max: ${unassignedCount})`,
        1, unassignedCount, Math.min(10, unassignedCount)
      );
      
      if (!count) return;
      
      const badges = Object.values(STATE.badges)
        .filter(badge => badge.loc === 'unassigned' && !badge.hidden)
        .slice(0, count);
      
      this.selectBadges(badges);
      TOAST.show(`Selected first ${badges.length} associates`, 'success');
    }
    
    async rapidAssign() {
      const countInput = document.getElementById('rapidCount');
      const targetSelect = document.getElementById('rapidTarget');
      
      if (!countInput || !targetSelect) return;
      
      const count = parseInt(countInput.value);
      const target = targetSelect.value;
      
      if (!count || count <= 0) {
        TOAST.show('Please enter a valid count', 'warning');
        return;
      }
      
      if (!target) {
        TOAST.show('Please select a target process', 'warning');
        return;
      }
      
      const unassignedBadges = Object.values(STATE.badges).filter(
        badge => badge.loc === 'unassigned' && !badge.hidden
      );
      
      if (unassignedBadges.length === 0) {
        TOAST.show('No unassigned associates available', 'warning');
        return;
      }
      
      const actualCount = Math.min(count, unassignedBadges.length);
      const badgesToAssign = unassignedBadges.slice(0, actualCount);
      
      for (const badge of badgesToAssign) {
        dragDrop(null, target, badge.id);
      }
      
      // Clear inputs
      countInput.value = '';
      targetSelect.value = '';
      
      TOAST.show(`⚡ Rapidly assigned ${actualCount} associates to ${getTileDisplayName(target)}`, 'success');
    }
    
    async fillAllToCapacity() {
      const capacityNeeds = this.getCapacityNeeds();
      const totalNeed = Object.values(capacityNeeds).reduce((sum, need) => sum + need, 0);
      
      if (totalNeed === 0) {
        TOAST.show('All process paths are at or above capacity', 'info');
        return;
      }
      
      const unassignedBadges = Object.values(STATE.badges).filter(
        badge => badge.loc === 'unassigned' && !badge.hidden
      );
      
      if (unassignedBadges.length === 0) {
        TOAST.show('No unassigned associates available', 'warning');
        return;
      }
      
      const confirmed = await this.showConfirmDialog(
        `Fill ${Object.keys(capacityNeeds).length} process paths to capacity?`,
        `This will assign ${Math.min(totalNeed, unassignedBadges.length)} associates to reach target capacity.`
      );
      
      if (!confirmed) return;
      
      let assignedCount = 0;
      let badgeIndex = 0;
      
      for (const [processKey, need] of Object.entries(capacityNeeds)) {
        if (need > 0 && badgeIndex < unassignedBadges.length) {
          const toAssign = Math.min(need, unassignedBadges.length - badgeIndex);
          
          for (let i = 0; i < toAssign; i++) {
            const badge = unassignedBadges[badgeIndex];
            dragDrop(null, processKey, badge.id);
            assignedCount++;
            badgeIndex++;
          }
        }
      }
      
      TOAST.show(`📊 Filled processes to capacity: assigned ${assignedCount} associates`, 'success');
    }
    
    // Helper methods
    getCapacityNeeds() {
      const needs = {};
      
      TILES.forEach(([tileId, tileKey]) => {
        if (!tileKey) return;
        
        const targetInput = document.getElementById(tileId);
        const target = targetInput ? parseInt(targetInput.value) || 0 : 0;
        
        const currentCount = Object.values(STATE.badges).filter(
          badge => badge.loc === tileKey && !badge.hidden
        ).length;
        
        const need = Math.max(0, target - currentCount);
        if (need > 0) {
          needs[tileKey] = need;
        }
      });
      
      return needs;
    }
    
    getAvailableShifts() {
      const shifts = new Set();
      Object.values(STATE.badges).forEach(badge => {
        if (badge.loc === 'unassigned' && !badge.hidden && badge.scode) {
          shifts.add(badge.scode);
        }
      });
      return Array.from(shifts).sort();
    }
    
    getAvailableDepartments() {
      const departments = new Set();
      Object.values(STATE.badges).forEach(badge => {
        if (badge.loc === 'unassigned' && !badge.hidden && badge.eid) {
          const dept = badge.eid.toString().substring(0, 7);
          departments.add(dept);
        }
      });
      return Array.from(departments).sort();
    }
    
    selectBadges(badges) {
      // Clear current selection
      BULK.clearSelection();
      
      // Select the specified badges
      badges.forEach(badge => {
        BULK.selectedBadges.add(badge.id);
      });
      
      // Update UI
      BULK.updateSelectionDisplay();
    }
    
    async showConfirmDialog(title, message) {
      return new Promise(resolve => {
        const confirmed = confirm(`${title}\n\n${message}`);
        resolve(confirmed);
      });
    }
    
    async showShiftSelector(shifts) {
      const shift = prompt(
        `Select shift code:\n\nAvailable shifts:\n${shifts.join(', ')}\n\nEnter shift code:`
      );
      return shifts.includes(shift) ? shift : null;
    }
    
    async showDepartmentSelector(departments) {
      const dept = prompt(
        `Select department:\n\nAvailable departments:\n${departments.join(', ')}\n\nEnter department code:`
      );
      return departments.includes(dept) ? dept : null;
    }
    
    async showNumberInput(title, message, min, max, defaultValue) {
      const input = prompt(`${title}\n\n${message}`, defaultValue);
      if (input === null) return null;
      
      const num = parseInt(input);
      if (isNaN(num) || num < min || num > max) {
        TOAST.show(`Please enter a number between ${min} and ${max}`, 'warning');
        return null;
      }
      
      return num;
    }
  }
  
  // Initialize smart assignment manager
  // Initialize smart assignment manager only if any related control exists
  if (document.getElementById('autoAssignBtn')) {
    const SMART = new SmartAssignmentManager();
    window.SMART = SMART;
  } else {
    console.info('[SMART] Smart assignment controls not present; skipped initialization.');
  }

  // ====== ROSTER DATABASE SYSTEM ======
  
  const DATABASE = window.DATABASE;
  // ====== ASSIGNMENT HISTORY TRACKING ======
  
  const HISTORY = window.HISTORY;

  // Debug function for YDD4 assignments
  window.debugYDD4Assignments = function() {
    console.log('=== YDD4 Assignment Debug ===');
    console.log('Current site:', STATE.currentSite);
    
    // Check badges with YDD4 assignments
    const ydd4Badges = Object.values(STATE.badges).filter(b => 
      b.loc !== 'unassigned' && 
      b.loc !== 'assigned-elsewhere' && 
      (b.site === 'YDD4' || b.site === 'YDD_SHARED')
    );
    console.log('YDD4/YDD_SHARED badges with assignments:', ydd4Badges.length);
    ydd4Badges.forEach(b => {
      console.log(`  Badge ${b.id} (${b.name}): site=${b.site}, loc=${b.loc}, hidden=${b.hidden}`);
    });
    
    // Check YDD4 site assignments
    if (STATE.sites.YDD4) {
      const ydd4SiteAssignments = Object.keys(STATE.sites.YDD4.assignments || {});
      console.log('YDD4 site assignments:', ydd4SiteAssignments.length);
      console.log('YDD4 assignments object:', STATE.sites.YDD4.assignments);
    } else {
      console.log('YDD4 site object not found');
    }
    
    // Check localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('vlab:lastRoster') || '{}');
      if (saved.sites && saved.sites.YDD4) {
        const savedYDD4 = Object.keys(saved.sites.YDD4.assignments || {});
        console.log('Saved YDD4 assignments in localStorage:', savedYDD4.length);
        console.log('Saved YDD4 assignments:', saved.sites.YDD4.assignments);
      } else {
        console.log('No YDD4 data in localStorage');
      }
    } catch (e) {
      console.log('Error reading localStorage:', e);
    }
    
    console.log('=== End YDD4 Debug ===');
  };

  window.testYDD4Persistence = function() {
    console.log('=== YDD4 Persistence Test ===');
    
    // Count current YDD4 assignments
    const currentAssignments = Object.values(STATE.badges).filter(b => 
      b.loc !== 'unassigned' && 
      b.loc !== 'assigned-elsewhere' && 
      STATE.currentSite === 'YDD4' &&
      !b.hidden
    ).length;
    
    console.log('Currently visible YDD4 assignments:', currentAssignments);
    
    if (currentAssignments === 0) {
      console.warn('❌ YDD4 assignments not visible after refresh!');
      console.log('Running full debug...');
      debugYDD4Assignments();
    } else {
      console.log('✅ YDD4 assignments are visible');
    }
  };
  
  // Debug function to test analytics
  window.debugAnalytics = function() {
    console.log('STATE.analytics:', STATE.analytics);
    console.log('ANALYTICS object:', ANALYTICS);
    console.log('PapaParse available:', typeof Papa !== 'undefined');
  };
  
  // Debug rotation scoring system
  window.debugRotation = function(processPath = 'cb') {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔄 ROTATION SCORING DEBUG FOR PATH:', processPath.toUpperCase());
    console.log('═══════════════════════════════════════════════════');
    
    const candidates = ANALYTICS.ROTATION.getRankedCandidatesForPath(processPath, {
      site: STATE.currentSite,
      shift: document.querySelector('input[name="shift"]:checked')?.value
    });
    
    console.log(`\n📊 Top 10 Candidates for ${processPath.toUpperCase()}:\n`);
    candidates.slice(0, 10).forEach((c, idx) => {
      console.log(`${idx + 1}. ${c.name} (${c.scode}) - Score: ${c.priorityScore.toFixed(2)}`);
      console.log(`   Details:`, c.scoreDetails);
      console.log('');
    });
    
    // Fairness alerts
    const alerts = ANALYTICS.ROTATION.generateFairnessAlerts();
    if (alerts.length > 0) {
      console.log('\n⚠️ FAIRNESS ALERTS:\n');
      alerts.slice(0, 5).forEach(alert => {
        console.log(`[${alert.severity.toUpperCase()}] ${alert.message}`);
      });
    } else {
      console.log('\n✅ No fairness alerts - good rotation balance!\n');
    }
    
    // Overall fairness
    const allFairness = Object.values(STATE.analytics.performance || {}).map(emp => {
      return ANALYTICS.ROTATION.calculateFairnessScore(emp.employeeId);
    });
    
    const avgFairness = allFairness.length ? 
      allFairness.reduce((sum, f) => sum + f.fairnessScore, 0) / allFairness.length : 0;
    
    console.log(`\n📈 Overall Fairness Index: ${avgFairness.toFixed(1)}/100`);
    console.log(`   Balanced: ${allFairness.filter(f => f.status === 'excellent' || f.status === 'balanced').length}`);
    console.log(`   Unbalanced: ${allFairness.filter(f => f.status === 'unbalanced').length}`);
    console.log('═══════════════════════════════════════════════════\n');
    
    return { candidates, alerts, avgFairness };
  };
  
  // Test rotation for all paths
  window.debugAllRotation = function() {
    const paths = ['cb', 'dm', 'pb', 'e2s', 'dockws'];
    console.log('🔄 TESTING ROTATION FOR ALL MAJOR PATHS\n');
    paths.forEach(path => {
      console.log(`\n--- ${path.toUpperCase()} ---`);
      const result = window.debugRotation(path);
      console.log(`Top candidate: ${result.candidates[0]?.name || 'None'} (${result.candidates[0]?.priorityScore.toFixed(2) || 'N/A'})`);
    });
  };
  
  // Debug function to check localStorage
  window.debugStorage = function() {
    const raw = localStorage.getItem('vlab:lastRoster');
    if (raw) {
      const data = JSON.parse(raw);
      console.log('=== LOCALSTORAGE DEBUG ===');
      console.log('Data found:', !!data);
      console.log('Badges:', data.badges ? Object.keys(data.badges).length : 0);
      console.log('Sites:', data.sites ? Object.keys(data.sites) : []);
      console.log('Current site:', data.currentSite);
      
      if (data.badges) {
        const assigned = Object.values(data.badges).filter(b => b.loc !== 'unassigned' && b.loc !== 'assigned-elsewhere');
        console.log('Assigned badges in storage:', assigned.length);
        assigned.forEach(b => console.log('  -', b.name, '→', b.loc));
      }
      
      if (data.sites && data.currentSite && data.sites[data.currentSite]) {
        console.log('Site assignments in storage:', Object.keys(data.sites[data.currentSite].assignments || {}).length);
      }
      
      console.log('=== END DEBUG ===');
    } else {
      console.log('No roster data in localStorage');
    }
  };

  // Debug function to check site assignment isolation
  window.debugSiteAssignments = function() {
    console.group('🔍 Site Assignment Debug');
    console.log('Current site:', STATE.currentSite);
    
    Object.keys(STATE.sites || {}).forEach(siteCode => {
      const siteData = STATE.sites[siteCode];
      const assignmentCount = Object.keys(siteData.assignments || {}).length;
      console.log(`${siteCode}: ${assignmentCount} assignments`, siteData.assignments);
    });
    
    // Show visible badges for current site
    if (STATE.badges) {
      const visibleBadges = Object.values(STATE.badges).filter(badge => 
        badge.loc !== 'hidden' && MULTISITE.badgeBelongsToSite(badge, STATE.currentSite)
      );
      console.log(`Visible badges in ${STATE.currentSite}:`, visibleBadges.length);
      
      const assignedBadges = visibleBadges.filter(badge => 
        badge.loc !== 'unassigned' && badge.loc !== 'assigned-elsewhere'
      );
      console.log(`Assigned badges in ${STATE.currentSite}:`, assignedBadges.length);
      assignedBadges.forEach(badge => {
        console.log(`  - ${badge.name} (${badge.site}) → ${badge.loc}`);
      });
    }
    
    console.groupEnd();
  };
  
  // Test function to verify assignment persistence
  window.testPersistence = function() {
    console.group('🧪 Assignment Persistence Test');
    
    const totalBadges = Object.keys(STATE.badges || {}).length;
    const allAssignments = Object.values(STATE.badges || {}).filter(b => 
      b.loc !== 'unassigned' && b.loc !== 'assigned-elsewhere' && b.loc !== 'hidden'
    );
    
    console.log(`Total badges: ${totalBadges}`);
    console.log(`Total assignments: ${allAssignments.length}`);
    
    // Group assignments by site
    const assignmentsBySite = {};
    allAssignments.forEach(badge => {
      const site = badge.site || 'Unknown';
      if (!assignmentsBySite[site]) assignmentsBySite[site] = [];
      assignmentsBySite[site].push(badge);
    });
    
    Object.keys(assignmentsBySite).forEach(site => {
      console.log(`${site}: ${assignmentsBySite[site].length} assignments`);
      assignmentsBySite[site].forEach(badge => {
        console.log(`  - ${badge.name} → ${badge.loc}`);
      });
    });
    
    // Check localStorage
    const saved = localStorage.getItem('vlab:lastRoster');
    if (saved) {
      const data = JSON.parse(saved);
      const savedAssignments = Object.values(data.badges || {}).filter(b => 
        b.loc !== 'unassigned' && b.loc !== 'assigned-elsewhere' && b.loc !== 'hidden'
      );
      console.log(`Saved assignments in localStorage: ${savedAssignments.length}`);
    } else {
      console.log('No saved data in localStorage');
    }
    
    console.groupEnd();
  };

  // Debug YDD2/YDD4 assignment restoration specifically
  window.debugYDDAssignments = function() {
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

  // Debug quarter assignment issues
  window.debugQuarterAssignments = function() {
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
    STATE.analytics.history.forEach(entry => {
      const q = entry.quarter || 'Unknown';
      if (!historyByQuarter[q]) historyByQuarter[q] = [];
      historyByQuarter[q].push(entry);
    });
    
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

  // Clean up quarter assignment data
  window.fixQuarterAssignments = function() {
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
    ANALYTICS.saveAnalyticsData();
    localStorage.setItem('vlab:quarterAssignments', JSON.stringify(STATE.quarterAssignments));
    
    console.log(`✅ Removed ${removedDuplicates} duplicates from analytics history`);
    console.log('✅ Saved cleaned quarter assignments');
  };

  // Test YDD4 assignment persistence specifically
  window.testYDD4Persistence = function() {
    console.group('🧪 YDD4 Assignment Persistence Test');
    
    // Switch to YDD4 and check assignments
    if (STATE.currentSite !== 'YDD4') {
      console.log('Switching to YDD4 to test assignments...');
      MULTISITE.switchToSite('YDD4');
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

  // --- helpers ---
  function addOverrideLog(badgeId, fromLoc, toLoc){
    const badge = STATE.badges[badgeId];
    const ts = new Date();
    const entry = {
      id: `override_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
      timestamp: ts.toISOString(),
      date: ts.toDateString(),
      badgeId: badgeId,
      employeeId: badge ? badge.eid : undefined,
      employeeName: badge ? badge.name : undefined,
      shiftCode: badge ? badge.scode : undefined,
      site: badge ? badge.site : undefined,
      quarter: STATE.currentQuarter || 'Q1',
      fromLocation: fromLoc,
      toLocation: toLoc,
      action: 'override',
      duration: null,
      sessionId: ANALYTICS.getCurrentSessionId()
    };
    STATE.analytics.history.push(entry);
    try{ ANALYTICS.saveAnalyticsData(); }catch(_){ }
  }

  function parseInputDate(dateStr){
    if (!dateStr) return null;
    // accept dd/mm/yyyy
    if (dateStr.includes('/')){
      const parts = dateStr.split('/').map(Number);
      if (parts.length === 3){
        const [d,m,y] = parts;
        return new Date(y, m-1, d);
      }
    }
    // accept ISO yyyy-mm-dd (from <input type=date>) without timezone shift
    // avoid using new Date(string) which can be parsed as UTC and shift day in some timezones
    const isoMatch = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(dateStr);
    if (isoMatch){
      const y = Number(isoMatch[1]);
      const m = Number(isoMatch[2]);
      const d = Number(isoMatch[3]);
      return new Date(y, m-1, d);
    }
    // fallback
    return new Date(dateStr);
  }

  function toNum(x){ const n = Number(x); return Number.isFinite(n) ? n : NaN; }

  // Site classifier based on department codes and management area
  function classifySite(row){
    // FIRST: honor normalized site field if present (entries loaded from database already have this)
    const preClassified = (row.site || row.Site || '').toString().toUpperCase();
    if (['YHM2','YDD2','YDD4','YDD_SHARED','OTHER'].includes(preClassified)) {
      // Normalize 'OTHER' back to 'Other'
      return preClassified === 'OTHER' ? 'Other' : preClassified;
    }

    // Otherwise, derive from department/management area fields (CSV uploads)
    const deptId = toNum(row['Department ID'] ?? row.departmentId ?? row.DepartmentID ?? row['Dept ID']);
    const mgmtAreaId = toNum(row['Management Area ID'] ?? row.managementAreaId ?? row.ManagementAreaID ?? row['Mgmt Area ID']);
    
    console.log(`[CLASSIFY-SITE] Classifying:`, {
      name: row.name || row['Employee Name'],
      deptId: deptId,
      mgmtAreaId: mgmtAreaId,
      rawDept: row['Department ID'] ?? row.departmentId ?? row.DepartmentID,
      rawMgmt: row['Management Area ID'] ?? row.managementAreaId ?? row.ManagementAreaID
    });
    
    if (isFinite(deptId)) {
      // YHM2 Inbound departments
      if ([1211010, 1211020, 1299010, 1299020].includes(deptId)) {
        console.log(`[CLASSIFY-SITE] → YHM2 (Inbound dept: ${deptId})`);
        return 'YHM2';
      }
      
      // YHM2 Outbound departments  
      if ([1211030, 1211040, 1299030, 1299040].includes(deptId)) {
        console.log(`[CLASSIFY-SITE] → YHM2 (Outbound dept: ${deptId})`);
        return 'YHM2';
      }
      
      // YDD2/YDD4 CRETs (Management Area 22) - can work in both YDD2 and YDD4
      if ([1299070, 1211070].includes(deptId) && mgmtAreaId === 22) {
        console.log(`[CLASSIFY-SITE] → YDD_SHARED (CRET dept: ${deptId}, area: ${mgmtAreaId})`);
        return 'YDD_SHARED';
      }
      
      // ICQA (Management Area 27) - excluded from operations
      if ([1299070, 1211070].includes(deptId) && mgmtAreaId === 27) {
        console.log(`[CLASSIFY-SITE] → Other (ICQA dept: ${deptId}, area: ${mgmtAreaId})`);
        return 'Other';
      }
    }
    
    // Default to 'Other' for unrecognized departments
    console.log(`[CLASSIFY-SITE] → Other (unrecognized - dept: ${deptId}, area: ${mgmtAreaId})`);
    return 'Other';
  }

  // Apply site filtering based on current site, shift, and date
  function applySiteFilter() {
    const currentSite = STATE.currentSite;
    const currentShift = getCurrentShift();
    const currentDate = getCurrentDate();
    
    console.log(`[SITE-FILTER] Applying filter for site: ${currentSite}, shift: ${currentShift}, date: ${currentDate}`);
    
    Object.values(STATE.badges).forEach(badge => {
      badge.hidden = !shouldShowBadge(badge, currentSite, currentShift, currentDate);
    });
    
    // Update unassigned header to match current site
    const unassignedSiteLabel = document.getElementById('unassignedSiteLabel');
    if (unassignedSiteLabel) {
      unassignedSiteLabel.textContent = `${currentSite} Unassigned`;
      console.log(`[SITE-FILTER] Updated unassigned header to: ${currentSite} Unassigned`);
    }
    
    console.log(`[SITE-FILTER] Filtered badges - showing ${Object.values(STATE.badges).filter(b => !b.hidden).length} of ${Object.values(STATE.badges).length} for site ${currentSite}`);
  }
  
  // Determine if a badge should be shown based on site, shift, and date
  function shouldShowBadge(badge, site, shift, date) {
    // Always show if no filtering criteria
    if (!site) return true;
    
    // Site-based filtering
    switch (site) {
      case 'YHM2':
        // Only show YHM2 associates
        return badge.site === 'YHM2';
        
      case 'YDD2':
      case 'YDD4':
        // Show YDD2, YDD4, and YDD_SHARED associates
        if (!(badge.site === 'YDD2' || badge.site === 'YDD4' || badge.site === 'YDD_SHARED')) {
          return false;
        }
        break;
        
      default:
        // Show all for unknown sites
        return true;
    }
    
    // Shift-based filtering (if shift is specified)
    if (shift && date) {
      const allowedCodes = getAllowedCodes(date, shift);
      const badgeShiftCode = shiftCodeOf(badge.scode);
      
      if (allowedCodes.length > 0 && !allowedCodes.includes(badgeShiftCode)) {
        console.log(`[SHIFT-FILTER] Hiding ${badge.name} - shift ${badgeShiftCode} not allowed on ${shift} shift`);
        return false;
      }
    }
    
    return true;
  }
  
  // Get current shift from form
  function getCurrentShift() {
    const shiftRadio = document.querySelector('input[name="shift"]:checked');
    return shiftRadio ? shiftRadio.value : null;
  }
  
  // Get current date from form
  function getCurrentDate() {
    const dateInput = document.getElementById('date');
    return dateInput ? dateInput.value : null;
  }

  function shiftCodeOf(v){ if (!v) return ''; const s = String(v).trim(); return s.slice(0,2).toUpperCase(); }

  function getAllowedCodes(dateStr, shift){
    const set = shift === 'day' ? DAY_SET : NIGHT_SET;
  // When STRICT_WEEK enabled, we intersect weekday-allowed codes with the shift's core set.
  if (!STRICT_WEEK) return Array.from(set);
    const d = parseInputDate(dateStr);
    if (!d) return Array.from(set);
    const wk = dayNames[d.getDay()] || 'Monday';
    const base = WEEK_ALLOWED[wk] || [];
    return base.filter(c => set.has(c));
  }

  function parseCsv(file){
    return new Promise((resolve, reject) => {
      console.log('[DEBUG] Parsing CSV file:', file.name);
      
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }
      
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          console.log('[DEBUG] CSV parsing complete for', file.name, '- rows:', res.data?.length);
          if (res.errors && res.errors.length > 0) {
            console.warn('[DEBUG] CSV parsing warnings:', res.errors);
          }
          resolve(res.data || []);
        },
        error: (err) => {
          console.error('[DEBUG] CSV parsing error for', file.name, ':', err);
          reject(err);
        }
      });
    });
  }

  // Special parser for upload files that can handle tab-separated or comma-separated values
  function parseUploadFile(file){
    return new Promise((resolve, reject) => {
      console.log('[DEBUG] Parsing upload file:', file.name);
      
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }

      // First, read the file as text to detect delimiter
      const reader = new FileReader();
      reader.onload = function(e) {
        const content = e.target.result;
        console.log('[DEBUG] File content preview:', content.substring(0, 200));
        const firstLine = content.split('\n')[0];
        
        // Detect if it's tab-separated or comma-separated
        const tabCount = (firstLine.match(/\t/g) || []).length;
        const commaCount = (firstLine.match(/,/g) || []).length;
        const delimiter = tabCount > commaCount ? '\t' : ',';
        
        console.log('[DEBUG] First line:', firstLine.substring(0, 100));
        console.log('[DEBUG] Tab count:', tabCount, 'Comma count:', commaCount);
        console.log('[DEBUG] Detected delimiter:', delimiter === '\t' ? 'TAB' : 'COMMA', 'in file:', file.name);

        // Parse with detected delimiter
        Papa.parse(file, {
          header: true,
          delimiter: delimiter,
          skipEmptyLines: true,
          complete: (res) => {
            console.log('[DEBUG] Upload file parsing complete for', file.name, '- rows:', res.data?.length);
            if (res.errors && res.errors.length > 0) {
              console.warn('[DEBUG] Upload file parsing warnings:', res.errors);
            }
            resolve(res.data || []);
          },
          error: (err) => {
            console.error('[DEBUG] Upload file parsing error for', file.name, ':', err);
            reject(err);
          }
        });
      };
      
      reader.onerror = function() {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    });
  }


      // -------- Adjustments processing (runs AFTER roster is built) --------
      function processAdjustments(adjustments, combinedRoster, opts = {}){
        try{
          if (!Array.isArray(combinedRoster)) combinedRoster = [];
          if (!Array.isArray(adjustments) || adjustments.length === 0) {
            return { combinedRoster, stats: { SWAPIN:0, SWAPOUT:0, VET:0, VTO:0, LS_IN:0, LS_OUT:0, added:0, removed:0, unknown:0 }, forceIds: new Set() };
          }

          const { date: resolvedDate = '', shift: resolvedShift = 'day', site: resolvedSite = 'YHM2' } = opts;
          const normalize = (d) => String(d || '').trim().replace(/\s+/g,'');

          console.log(`[ADJUST] Processing ${adjustments.length} rows against roster size ${combinedRoster.length}`);

          const stats = { SWAPIN:0, SWAPOUT:0, VET:0, VTO:0, LS_IN:0, LS_OUT:0, added:0, removed:0, unknown:0 };
          const forceIds = new Set();

          // Build quick index for roster by User ID and Employee ID
          const rosterIndex = new Map();
          combinedRoster.forEach(r => {
            const uid = String(r['User ID'] || r['UserID'] || r['Login'] || r['Associate'] || r['Employee Login'] || r['Handle'] || '').trim();
            const eid = String(r['Employee ID'] || r['ID'] || r['EID'] || r['Employee Number'] || '').trim();
            if (uid) rosterIndex.set(uid.toLowerCase(), r);
            if (eid) rosterIndex.set(eid.toLowerCase(), r);
          });

          const todayKey = normalize(resolvedDate);

          adjustments.forEach(row => {
            const userId = String(row['User ID'] || row['UserID'] || row['Login'] || row['Associate'] || '').trim();
            const action = String(row['Action'] || row['Type'] || '').trim().toUpperCase();
            const dateVal = normalize(row['Date'] || row['date'] || '');
            if (!userId || !action) { stats.unknown++; return; }
            
            // Strict Date Matching for Adjustments
            // If the adjustment row has a date, it MUST match the selected date.
            // If the adjustment row has NO date, we assume it applies to the current upload (legacy behavior),
            // but for safety, we should probably warn or skip if strict mode is desired.
            // Here we allow empty dates to pass (assuming file is for today), but if a date IS present, it must match.
            if (todayKey && dateVal && dateVal !== todayKey) { 
              // console.log(`[ADJUST] Skipping ${userId} - Date mismatch (${dateVal} vs ${todayKey})`);
              return; 
            } 
            
            // Strict Shift Matching (Optional but recommended)
            // If the adjustment has a 'Shift' column, check it against resolvedShift
            const rowShift = String(row['Shift'] || row['shift'] || '').trim().toLowerCase();
            if (rowShift && resolvedShift && rowShift !== resolvedShift) {
               // console.log(`[ADJUST] Skipping ${userId} - Shift mismatch (${rowShift} vs ${resolvedShift})`);
               return;
            }
            
            // Strict Shift Code Matching (if provided)
            // If the adjustment has a 'Shift Pattern' or 'ShiftCode' column, check if it matches the current shift type (Day/Night)
            const rowShiftCode = String(row['Shift Pattern'] || row['ShiftCode'] || row['Shift Code'] || '').trim().toUpperCase();
            if (rowShiftCode) {
              const isDayCode = DAY_SET.has(rowShiftCode);
              const isNightCode = NIGHT_SET.has(rowShiftCode);
              const isDayShift = resolvedShift === 'day';
              
              if (isDayShift && !isDayCode && isNightCode) {
                // console.log(`[ADJUST] Skipping ${userId} - Shift Code mismatch (Day shift vs ${rowShiftCode})`);
                return;
              }
              if (!isDayShift && !isNightCode && isDayCode) {
                // console.log(`[ADJUST] Skipping ${userId} - Shift Code mismatch (Night shift vs ${rowShiftCode})`);
                return;
              }
            }

            if (!['SWAPIN','SWAPOUT','VET','VTO','LS_IN','LS_OUT'].includes(action)) { stats.unknown++; return; }
            stats[action]++;

            const key = userId.toLowerCase();
            let existing = rosterIndex.get(key);

            if (action === 'SWAPIN' || action === 'VET' || action === 'LS_IN') {
              forceIds.add(key);
              if (!existing) {
                const dbEmp = (window.DATABASE && typeof DATABASE.getEmployee==='function') ? DATABASE.getEmployee(userId) : null;
                const synthetic = {
                  'Employee Name': (dbEmp && dbEmp.name) || userId,
                  'Employee ID': (dbEmp && (dbEmp.eid||dbEmp.id)) || userId,
                  'Employee Status': 'Active',
                  'Shift Pattern': (dbEmp && (dbEmp.shiftPattern || dbEmp.scode)) || ((resolvedShift || 'day') === 'day' ? 'DA' : 'NA'),
                  'User ID': (dbEmp && (dbEmp.userId || dbEmp.id)) || userId,
                  'Department ID': (dbEmp && dbEmp.departmentId) || undefined,
                  'Management Area ID': (dbEmp && dbEmp.managementAreaId) || undefined,
                  site: (dbEmp && dbEmp.site) || ((resolvedSite || 'YHM2') === 'YHM2' ? 'YHM2' : 'YDD_SHARED'),
                  '_isUploaded': true,
                  '_forceInclude': true,
                  '_adjustmentDate': resolvedDate,
                  '_adjustmentShift': resolvedShift
                };
                combinedRoster.push(synthetic);
                rosterIndex.set(key, synthetic);
                const eidKey = String(synthetic['Employee ID']||'').trim().toLowerCase();
                if (eidKey) rosterIndex.set(eidKey, synthetic);
                stats.added++;
                console.log(`[ADJUST] Added synthetic entry for ${userId} via ${action}`);
              } else {
                existing['Employee Status'] = 'Active';
                existing._forceInclude = true;
                existing._adjustmentDate = resolvedDate;
                existing._adjustmentShift = resolvedShift;
                console.log(`[ADJUST] Marked existing ${userId} active via ${action}`);
              }
            } else if (action === 'SWAPOUT' || action === 'VTO' || action === 'LS_OUT') {
              if (existing) {
                existing['Employee Status'] = 'Removed'; // to be filtered out
                stats.removed++;
                console.log(`[ADJUST] Flagged ${userId} for removal via ${action}`);
              } else {
                console.warn(`[ADJUST] ${action} for user ${userId} not in roster; applying count only`);
              }
            }
          });

          // Remove employees flagged as Removed
          combinedRoster = combinedRoster.filter(r => String(r['Employee Status'] ?? r.Status ?? 'Active').toLowerCase() !== 'removed');

          return { combinedRoster, stats, forceIds };
        }catch(err){
          console.error('[ADJUST] Failed applying adjustments:', err);
          return { combinedRoster, stats: { SWAPIN:0, SWAPOUT:0, VET:0, VTO:0, LS_IN:0, LS_OUT:0, added:0, removed:0, unknown:0 }, forceIds: new Set() };
        }
      }
  // small helper used for diagnostics: did parse rows exist but active filter remove them all?
  function filteredPreviewNeeded(roster, activeRows){
    return Array.isArray(roster) && roster.length > 0 && Array.isArray(activeRows) && activeRows.length === 0;
  }

  function updateActualHC(){
    const count = Object.values(STATE.badges).reduce((acc,b) => acc + (b.present ? 1 : 0), 0);
    elActual.textContent = String(count);
  }

  function setCounts(){
    const counts = {};
    TILES.forEach(([id,key]) => counts[key] = 0);
    
    // Count badges, but exclude 'assigned-elsewhere' and 'hidden' from all counts
    Object.values(STATE.badges).forEach(b => { 
      if (b.loc !== 'assigned-elsewhere' && b.loc !== 'hidden') {
        counts[b.loc] = (counts[b.loc] || 0) + 1; 
      }
    });
    
    TILES.forEach(([id,key]) => {
      const el = document.getElementById(id);
      if (el){
        if (el.tagName === 'INPUT') el.value = String(counts[key] || 0);
        else el.textContent = String(counts[key] || 0);
        
        // Update capacity indicators
        updateCapacityIndicator(id, key, counts[key] || 0);
      }
    });
    
    // Count truly unassigned badges (not assigned anywhere and not hidden)
    const trulyUnassigned = Object.values(STATE.badges).filter(b => {
      if (b.loc !== 'unassigned' || b.loc === 'hidden') return false;
      // Check if assigned in any site
      return !Object.values(STATE.sites).some(site => 
        site.assignments && site.assignments[b.id]
      );
    }).length;
    
    unassignedCountEl.textContent = String(trulyUnassigned);
  }
  
  // Capacity indicator system
  function updateCapacityIndicator(tileId, tileKey, currentCount) {
    const tileElement = document.getElementById(tileId);
    if (!tileElement) return;
    
    const parentCard = tileElement.closest('.board-card');
    if (!parentCard) return;
    
    // Remove existing indicator
    const existingIndicator = parentCard.querySelector('.capacity-indicator');
    if (existingIndicator) existingIndicator.remove();
    
    // Get target count from input
    const targetInput = parentCard.querySelector('.board-count-input');
    const targetCount = targetInput ? parseInt(targetInput.value) || 0 : 0;
    
    if (targetCount === 0) return; // No indicator if no target set
    
    // Create indicator
    const indicator = document.createElement('div');
    indicator.className = 'capacity-indicator';
    
    let status = '';
    let icon = '';
    
    if (currentCount === targetCount) {
      status = 'optimal';
      icon = '✓';
    } else if (currentCount > targetCount) {
      status = 'over-capacity';
      icon = '⚠';
    } else {
      status = 'under-capacity';
      icon = '!';
    }
    
    indicator.classList.add(status);
    indicator.innerHTML = `
      <span class="capacity-icon">${icon}</span>
      <span>${currentCount}/${targetCount}</span>
    `;
    
    // Position relative to parent card
    parentCard.style.position = 'relative';
    parentCard.appendChild(indicator);
  }

  function makeDropTarget(container, key){
    // container is the element that will receive dropped badges (.path-box or #unassignedStack)
    container.addEventListener('dragover', (e) => { 
      e.preventDefault(); 
      container.classList && container.classList.add('ring','ring-indigo-300');
      console.log(`[DEBUG] Drag over target: ${key}`);
    });
    container.addEventListener('dragleave', () => { container.classList && container.classList.remove('ring','ring-indigo-300'); });
    container.addEventListener('drop', (e) => {
      e.preventDefault(); container.classList && container.classList.remove('ring','ring-indigo-300');
      // If quarter is locked, ask if user wants to override
      let isOverride = false;
      if (STATE.quarterLocks && STATE.quarterLocks[STATE.currentQuarter]){
        const ok = confirm(`Quarter ${STATE.currentQuarter} is locked. Override previous assignments with this change?`);
        if (!ok) return;
        isOverride = true;
      }
      const payload = e.dataTransfer.getData('text/plain');
      console.log(`[DEBUG] Drop payload: "${payload}"`);
      if (!payload) {
        console.log('[DEBUG] No payload found in drop event');
        return;
      }
      // payload may be employee id (preferred) or DOM id
      let node = document.getElementById(payload) || document.querySelector(`.badge[data-id="${payload}"]`);
      console.log(`[DEBUG] Found node:`, node);
      let badgeId = node && node.id;
      // if no DOM badge exists yet, try to find the badge in STATE by eid and create a badge node
      if (!node){
        const found = Object.values(STATE.badges).find(b => String(b.eid) === String(payload));
        if (found){
          node = renderBadge(found);
          badgeId = found.id;
          // append into container (will be moved again below)
          document.body.appendChild(node);
        }
      }
      if (!node) {
        console.log('[DEBUG] No node found for payload:', payload);
        return; // unknown drag payload
      }
      if (!badgeId || !STATE.badges[badgeId]) {
        console.log('[DEBUG] Invalid badgeId or missing badge:', badgeId, !!STATE.badges[badgeId]);
        return;
      }
      
      // Track assignment change for analytics
      const oldLocation = STATE.badges[badgeId].loc;
      const newLocation = key || 'unassigned';
      
      // Conflict Detection - Check for duplicate assignments
      if (newLocation !== 'unassigned') {
        const conflictBadges = Object.values(STATE.badges).filter(b => 
          b.id !== badgeId && 
          b.loc === newLocation && 
          !b.hidden &&
          b.site === STATE.badges[badgeId].site
        );
        
        if (conflictBadges.length > 0) {
          const conflictNames = conflictBadges.map(b => b.name).join(', ');
          const tileName = getTileDisplayName(newLocation);
          
          TOAST.warning(
            `${conflictNames} already assigned to ${tileName}. Consider redistributing assignments.`,
            'Assignment Conflict Detected'
          );
        }
      }
      
      // Multi-site assignment logic
      const isUploadedBadge = STATE.badges[badgeId].isUploaded;
      console.log(`[DEBUG] Processing drop for badge ${badgeId}, isUploaded: ${isUploadedBadge}, oldLoc: ${oldLocation}, newLoc: ${newLocation}`);
      
      if (newLocation === 'unassigned') {
        // Remove from ALL site assignments (badge becomes globally unassigned)
        Object.keys(STATE.sites).forEach(siteCode => {
          delete STATE.sites[siteCode].assignments[badgeId];
        });
        STATE.badges[badgeId].loc = 'unassigned';
        console.log(`[MULTISITE] Badge ${badgeId} moved to global unassigned pool`);
      } else {
        // Ensure current site is properly synchronized before assignment
        MULTISITE.ensureCurrentSiteSync();
        const currentSite = STATE.currentSite;
        console.log(`[DEBUG] Assigning to site: ${currentSite}, location: ${newLocation}`);
        
        // Check if badge was assigned elsewhere for logging
        const previousSiteAssignment = Object.keys(STATE.sites).find(siteCode => 
          siteCode !== currentSite && STATE.sites[siteCode].assignments[badgeId]
        );
        
        // Remove from ALL sites first (ensures one assignment per associate)
        Object.keys(STATE.sites).forEach(siteCode => {
          delete STATE.sites[siteCode].assignments[badgeId];
        });
        
        // Add to current site
        STATE.sites[currentSite].assignments[badgeId] = newLocation;
        STATE.badges[badgeId].loc = newLocation;
        
        // Enhanced logging for cross-site moves
        if (previousSiteAssignment) {
          console.log(`[MULTISITE] Cross-site move: badge ${badgeId} moved from ${previousSiteAssignment} to ${currentSite}/${newLocation}`);
        } else {
          console.log(`[MULTISITE] New assignment: badge ${badgeId} assigned to ${currentSite}/${newLocation}`);
        }
        
        // Special debugging for YDD4 assignments
        if (currentSite === 'YDD4') {
          console.log(`[YDD4-DEBUG] Assignment made - Badge: ${badgeId}, Location: ${newLocation}`);
          console.log(`[YDD4-DEBUG] YDD4 assignments now:`, STATE.sites.YDD4.assignments);
          console.log(`[YDD4-DEBUG] Badge loc set to:`, STATE.badges[badgeId].loc);
        }
      }
      
      // Save change into current quarter snapshot
      try{
        STATE.quarterAssignments[STATE.currentQuarter] = STATE.quarterAssignments[STATE.currentQuarter] || {};
        STATE.quarterAssignments[STATE.currentQuarter][badgeId] = newLocation;
        // Save quarter assignments to localStorage immediately
        localStorage.setItem('vlab:quarterAssignments', JSON.stringify(STATE.quarterAssignments));
      }catch(_){ }
      
      // Log the assignment (override when applicable)
      // Only log actual user-initiated assignments, not internal state changes
      if (!STATE.suppressAnalytics && newLocation !== 'assigned-elsewhere' && oldLocation !== 'assigned-elsewhere') {
        const logLocation = newLocation === 'unassigned' ? newLocation : `${STATE.currentSite}/${newLocation}`;
        const logOldLocation = oldLocation === 'unassigned' ? oldLocation : `${STATE.currentSite}/${oldLocation}`;
        
        if (isOverride) addOverrideLog(badgeId, logOldLocation, logLocation);
        else ANALYTICS.logAssignment(badgeId, logOldLocation, logLocation);
        
        // Record in history for undo/redo
        HISTORY.recordAssignment(badgeId, oldLocation, newLocation);
      }
      
      // Save multi-site state to localStorage
      MULTISITE.saveToStorage();
      
      // Show toast notification for assignment
      const badge = STATE.badges[badgeId];
      if (badge) {
        if (newLocation === 'unassigned') {
          TOAST.info(`${badge.name} moved to unassigned pool`, 'Assignment Updated');
        } else {
          const tileName = getTileDisplayName(newLocation);
          const siteDisplay = STATE.currentSite;
          TOAST.success(`${badge.name} assigned to ${tileName}`, `${siteDisplay} Assignment`);
        }
      }
      
      // Also save a complete roster snapshot to ensure ALL assignments persist across refreshes
      try {
        const snap = {
          badges: STATE.badges,
          sites: STATE.sites,
          currentSite: STATE.currentSite,
          meta: {
            date: document.getElementById('date')?.value || '',
            shift: document.querySelector('input[name="shift"]:checked')?.value || 'day',
            site: STATE.currentSite,
            quarter: STATE.currentQuarter || 'Q1'
          }
        };
        localStorage.setItem('vlab:lastRoster', JSON.stringify(snap));
        console.log('[DRAG-DROP] Saved complete roster snapshot with ALL assignments after assignment change');
        
        // Debug: Count total assignments being saved
        const totalAssigned = Object.values(STATE.badges).filter(b => 
          b.loc !== 'unassigned' && b.loc !== 'assigned-elsewhere' && b.loc !== 'hidden'
        ).length;
        console.log('[DRAG-DROP] Total assignments saved:', totalAssigned);
      } catch (saveError) {
        console.warn('[DRAG-DROP] Failed to save roster snapshot:', saveError);
      }
      
      // move DOM node into container (append will move, not clone)
      if ((key || 'unassigned') === 'unassigned') unassignedStack.appendChild(node);
      else container.appendChild(node);
      restack(node.parentElement);
      setCounts();
    });
  }

  function restack(container){
    if (!container) return;
    const children = Array.from(container.children);
    children.forEach((c,i) => {
      const isLeft = container.id === 'unassignedStack';
      if (isLeft){
        // left panel: normal vertical list (no overlap)
        c.style.marginTop = i === 0 ? '0px' : '8px';
        c.style.display = 'block';
        c.style.marginLeft = '0px';
      } else {
        // in tiles, use grid layout; clear any previous overlap/inline styles
        c.style.marginTop = '0px';
        c.style.marginLeft = '0px';
        c.style.display = 'block';
      }
      c.style.pointerEvents = 'auto';
    });
  }

  // renderBadge: returns a DOM node for a person (name-only, data-id, data-shift, draggable)
  function renderBadge(p){
    // Card-style badge: compact layout
    const wrap = document.createElement('div');
    wrap.id = p.id;
    let badgeClasses = `badge ${(p.scode||'').trim()}`;
    if (p.isUploaded) badgeClasses += ' uploaded';
    wrap.className = badgeClasses.trim();
    wrap.setAttribute('draggable','true');
    if (p.eid) wrap.setAttribute('data-id', String(p.eid));
    if (p.scode) wrap.setAttribute('data-shift', String(p.scode));
    wrap.title = p.name || '';
    // accessibility: make badges focusable/clickable via keyboard
    wrap.setAttribute('role','button');
    wrap.setAttribute('tabindex','0');
    wrap.setAttribute('aria-pressed', p.present ? 'true' : 'false');

    // left avatar placeholder
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    // show photo thumbnail when available, otherwise initials
    if (p.photo){
      const img = document.createElement('img');
      img.src = p.photo;
      img.alt = p.name || '';
      img.className = 'avatar-photo';
      // loading & decoding hints for better UX
      img.loading = 'lazy';
      img.decoding = 'async';
      avatar.appendChild(img);
    } else {
      avatar.textContent = (p.name || '').split(' ').map(s => s[0] || '').slice(0,2).join('').toUpperCase();
    }
    wrap.appendChild(avatar);

    // info column
    const info = document.createElement('div');
    info.className = 'info';
    const nameEl = document.createElement('div'); nameEl.className = 'name'; 
    
    // Add revolt symbol (⚡) for uploaded/adjusted associates
    if (p.isUploaded) {
      nameEl.innerHTML = `<span style="color:#f59e0b; margin-right:4px;">⚡</span>${p.name || ''}`;
    } else {
      nameEl.textContent = p.name || '';
    }
    
    const shiftEl = document.createElement('div'); shiftEl.className = 'shiftmeta';
    const sc = p.scode || '';
    const stype = sc.toUpperCase().startsWith('N') ? 'Night' : 'Day';
    shiftEl.textContent = `${sc} • ${stype}`;
    const eidEl = document.createElement('div'); eidEl.className = 'eid'; eidEl.textContent = p.eid || '';
    info.appendChild(nameEl); info.appendChild(shiftEl); info.appendChild(eidEl);

    // alias / handle (smaller, optional)
    if (p.handle){ const h = document.createElement('div'); h.className = 'alias'; h.textContent = p.handle; info.appendChild(h); }

    // barcode / handle area (ID card style)
    if (p.barcode){
      const bcWrap = document.createElement('div'); bcWrap.className = 'barcodeWrap';
      const bcImg = document.createElement('div'); bcImg.className = 'barcode';
      // show barcode text as fallback inside mock bars; real barcode images can replace this later
      bcImg.textContent = p.barcode;
      const bcText = document.createElement('div'); bcText.className = 'barcodeText'; bcText.textContent = p.handle || '';
      bcWrap.appendChild(bcImg); bcWrap.appendChild(bcText);
      info.appendChild(bcWrap);
    }

    wrap.appendChild(info);

    // Add selection checkbox (only for unassigned badges)
    if (p.loc === 'unassigned') {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'badge-checkbox';
      checkbox.setAttribute('data-badge-id', p.id);
      checkbox.addEventListener('change', handleBadgeSelection);
      wrap.appendChild(checkbox);
    }

    // upload indicator (for uploaded associates)
    if (p.isUploaded) {
      const uploadIndicator = document.createElement('div');
      uploadIndicator.className = 'upload-indicator';
      uploadIndicator.textContent = '📤';
      uploadIndicator.style.cssText = `
        position: absolute;
        top: 4px;
        right: 4px;
        font-size: 12px;
        background: #3b82f6;
        color: white;
        border-radius: 50%;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        z-index: 10;
      `;
      uploadIndicator.title = 'Uploaded associate';
      wrap.appendChild(uploadIndicator);
    }

    // presence tick (right)
    const tick = document.createElement('div'); tick.className = 'tick'; tick.textContent = '✓';
    if (!p.present) tick.style.display = 'none';
    wrap.appendChild(tick);

    // rotation status indicator
    if (ANALYTICS.ROTATION && p.eid) {
      const rotationScore = ANALYTICS.ROTATION.calculateRotationScore(p.eid);
      if (rotationScore && rotationScore.status) {
        const rotationIndicator = document.createElement('div');
        rotationIndicator.className = 'rotation-indicator';
        
        const rotationConfig = {
          'excellent': { icon: '🌟', color: '#059669', title: 'Excellent rotation variety' },
          'good': { icon: '✨', color: '#10b981', title: 'Good rotation balance' },
          'needs_improvement': { icon: '⚠️', color: '#f59e0b', title: 'Needs more variety' },
          'poor': { icon: '🔄', color: '#dc2626', title: 'Limited rotation - needs variety' }
        };
        
        const config = rotationConfig[rotationScore.status] || rotationConfig['good'];
        rotationIndicator.textContent = config.icon;
        rotationIndicator.style.cssText = `
          position: absolute;
          bottom: 4px;
          left: 4px;
          font-size: 10px;
          background: white;
          border-radius: 50%;
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          z-index: 10;
        `;
        rotationIndicator.title = `${config.title} (Score: ${rotationScore.score})`;
        wrap.appendChild(rotationIndicator);
      }
    }

    // drag payload uses employee id when possible
    wrap.addEventListener('dragstart', (e) => {
      const emp = String(p.eid || p.id || '');
      console.log(`[DEBUG] Drag started for badge ${p.name} (${emp})`);
      console.log(`[DEBUG] Badge data:`, { id: p.id, eid: p.eid, name: p.name, loc: p.loc });
      try{ 
        e.dataTransfer.setData('text/plain', emp);
        console.log(`[DEBUG] Set drag payload: "${emp}"`);
      }catch(err){ 
        console.log(`[DEBUG] Drag error:`, err);
        e.dataTransfer.setData('text/plain', p.id); 
      }
      try{
        const crt = wrap.cloneNode(true);
        crt.style.opacity = '0.9'; crt.style.position = 'absolute'; crt.style.top = '-9999px';
        document.body.appendChild(crt);
        e.dataTransfer.setDragImage(crt, 20, 20);
        setTimeout(() => document.body.removeChild(crt), 0);
      }catch(_){ }
    });

    // toggle presence on click (and update aria state)
    function togglePresent(){
      p.present = !p.present;
      if (p.present){ wrap.classList.add('present'); tick.style.display = ''; }
      else { wrap.classList.remove('present'); tick.style.display = 'none'; }
      wrap.setAttribute('aria-pressed', p.present ? 'true' : 'false');
      updateActualHC();
    }

    wrap.addEventListener('click', (ev) => {
      // avoid toggling when starting a drag
      if (ev?.detail === 0) return;
      togglePresent();
    });

    // keyboard accessibility: Enter or Space toggles presence
    wrap.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar'){
        ev.preventDefault(); togglePresent();
      }
    });

    return wrap;
  }

  function renderAllBadges(){
    // clear
    if (unassignedStack) unassignedStack.innerHTML = '';
    Object.values(tileBadgeLayers).forEach(layer => { if (layer) layer.innerHTML = ''; });

    // Debug YDD4 rendering
    if (STATE.currentSite === 'YDD4') {
      console.log('[YDD4-RENDER] Starting renderAllBadges for YDD4');
      const ydd4Assignments = STATE.sites.YDD4 ? Object.keys(STATE.sites.YDD4.assignments || {}) : [];
      console.log('[YDD4-RENDER] YDD4 site assignments to render:', ydd4Assignments.length);
    }

    // Check if badge is assigned in ANY site (not just current site)
    const isAssignedAnywhere = (badgeId) => {
      const assigned = Object.values(STATE.sites).some(site => 
        site.assignments && site.assignments[badgeId]
      );
      return assigned;
    };

    // Render unassigned as a compact list in the left panel (preview), and full list in overlay when open.
    const overlayOpen = !!document.getElementById('unassignedOverlay');
    const unassigned = Object.values(STATE.badges).filter(b => 
      b.loc === 'unassigned' && !isAssignedAnywhere(b.id) && b.loc !== 'hidden'
    );
    const previewCount = overlayOpen ? Infinity : 6;
    let rendered = 0;

    Object.values(STATE.badges).forEach(b => {
      // Debug YDD4 badges specifically
      if (STATE.currentSite === 'YDD4' && (b.site === 'YDD4' || b.site === 'YDD_SHARED') && b.loc !== 'unassigned') {
        console.log(`[YDD4-RENDER] Processing badge ${b.id} (${b.name}): loc=${b.loc}, hidden=${b.hidden}, site=${b.site}`);
        const isAssigned = isAssignedAnywhere(b.id);
        console.log(`[YDD4-RENDER] Badge ${b.id} isAssignedAnywhere: ${isAssigned}`);
        if (STATE.sites.YDD4 && STATE.sites.YDD4.assignments[b.id]) {
          console.log(`[YDD4-RENDER] Badge ${b.id} found in YDD4 assignments:`, STATE.sites.YDD4.assignments[b.id]);
        }
      }
      
      // Skip hidden badges (not for current site)
      if (b.loc === 'hidden') return;
      
      // Only show as unassigned if not assigned anywhere
      if (b.loc === 'unassigned' && !isAssignedAnywhere(b.id)){
        if (rendered < previewCount){
          const item = document.createElement('div');
          item.className = 'unassigned-item';
          item.setAttribute('draggable','true');
          item.setAttribute('data-eid', String(b.eid));
          item.textContent = b.name || b.eid || '';
          item.addEventListener('dragstart', (e) => { try{ e.dataTransfer.setData('text/plain', String(b.eid || b.id)); }catch(_){ e.dataTransfer.setData('text/plain', String(b.eid || b.id)); } });
          unassignedStack.appendChild(item);
          rendered++;
        }
        // otherwise skip rendering in preview mode; overlay will render full list when open
      } else if (b.loc !== 'assigned-elsewhere' && b.loc !== 'hidden') {
        // Only render if assigned to current site (not assigned elsewhere or hidden)
        const node = renderBadge(b);
        if (b.present){ node.classList.add('present'); const t = document.createElement('div'); t.className='tick'; t.textContent='✓'; node.appendChild(t); }
        tileBadgeLayers[b.loc]?.appendChild(node);
      }
      // Skip rendering badges that are assigned-elsewhere
    });

    // If there are more unassigned than previewCount and overlay is closed, show a "Show all" control
    if (!overlayOpen && unassigned.length > previewCount){
      const more = document.createElement('button'); more.className = 'more-link'; more.textContent = `Show all (${unassigned.length})`;
      more.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (typeof openUnassignedOverlay === 'function') openUnassignedOverlay(); else toggleUnassignedBtn && toggleUnassignedBtn.click(); });
      unassignedStack.appendChild(more);
    }
    restack(unassignedStack);
    Object.values(tileBadgeLayers).forEach(restack);
    // tiles use CSS grid by default; ensure any legacy grid-mode class is removed
    try{ Object.values(tileBadgeLayers).forEach(layer => layer && layer.classList.remove('grid-mode')); }catch(_){ }
    setCounts(); updateActualHC();
    
    // Update filter options and apply current filters
    if (typeof BULK !== 'undefined') {
      BULK.populateFilterOptions();
      BULK.applyFilters();
    }
  }

  // change preview
  form.addEventListener('change', () => {
    // Controls may live outside the form now; resolve from document scope
    const date = document.getElementById('date')?.value || document.getElementById('date_roster')?.value || '';
    const shift = document.querySelector('input[name="shift"]:checked')?.value || document.querySelector('input[name="shift_roster"]:checked')?.value || 'day';
    const d = parseInputDate(date);
    if (!d){ elType.textContent = '-'; return; }
    elType.textContent = shiftTypeMap[shift][d.getDay()];
  });

  // Multi-site switching functionality - both form and header selectors
  const setupSiteSwitching = function() {
    const formSiteSelect = document.getElementById('site');
    const headerSiteSelect = document.getElementById('headerSiteSelector');
    const shiftRadios = document.querySelectorAll('input[name="shift"]');
    const dateInput = document.getElementById('date');
    
    const handleSiteSwitch = (newSite) => {
      // Only proceed if we have existing badges (board is already loaded)
      if (Object.keys(STATE.badges).length === 0) return;
      
      console.log('[MULTISITE] Switching to site:', newSite);
      MULTISITE.switchToSite(newSite);
      
      // Update unassigned header with new site
      const unassignedSiteLabel = document.getElementById('unassignedSiteLabel');
      if (unassignedSiteLabel) {
        unassignedSiteLabel.textContent = `${newSite} Unassigned`;
      }
      
      // Apply filtering after site switch
      applySiteFilter();
      renderAllBadges();
      setCounts();
      try{ renderHeadcountOverview(); }catch(_){ }
      setScheduleChips();
    };
    
    const handleFilterChange = () => {
      // Only apply filtering if we have badges loaded
      if (Object.keys(STATE.badges).length === 0) return;
      
      console.log('[FILTER] Shift/date changed, reapplying filters');
      applySiteFilter();
      renderAllBadges();
      setCounts();
      try{ renderHeadcountOverview(); }catch(_){ }
      setScheduleChips();
    };
    
    // Form site selector handler
    formSiteSelect?.addEventListener('change', (e) => {
      // When site changes on Roster tab, we want to trigger a full reload (handleFilterChange)
      // instead of just a visual switch (handleSiteSwitch), because the roster composition might change
      handleFilterChange();
    });
    
    // Header site selector handler  
    headerSiteSelect?.addEventListener('change', (e) => {
      // Header selector is just a visual switch for the board view
      handleSiteSwitch(e.target.value);
      // Also sync the main site selector if it exists
      if (formSiteSelect) formSiteSelect.value = e.target.value;
    });
    
    // Shift change handlers
    shiftRadios.forEach(radio => {
      radio.addEventListener('change', handleFilterChange);
    });
    
    // Date change handler
    dateInput?.addEventListener('change', handleFilterChange);
  };
  
  // Initialize site switching after DOM is ready
  setupSiteSwitching();
  
  // Ensure header site selector is synchronized with form on page load
  const initializeHeaderSiteSelector = function() {
    const formSite = document.getElementById('site')?.value;
    const headerSite = document.getElementById('headerSiteSelector');
    
    if (formSite && headerSite && headerSite.value !== formSite) {
      headerSite.value = formSite;
      STATE.currentSite = formSite;
      console.log('[MULTISITE] Initialized header selector to match form:', formSite);
    }
  };
  
  // Initialize on DOM ready
  setTimeout(initializeHeaderSiteSelector, 100);

  // Button event handlers
  const loadLastBtn = document.getElementById('loadLastBtn');
  const clearSavedBtn = document.getElementById('clearSavedBtn');
  
  // Load last roster button
  if (loadLastBtn) {
    loadLastBtn.addEventListener('click', () => {
      simpleAutoLoad();
      output.textContent = 'Loaded last saved roster and assignments (simple mode).';
      
      // Ensure analytics session is started
      try {
        const raw = localStorage.getItem('vlab:lastRoster');
        if (raw) {
          const snap = JSON.parse(raw);
          if (snap.meta) {
            ANALYTICS.endSession();
            ANALYTICS.startSession({
              date: snap.meta.date,
              shift: snap.meta.shift,
              site: snap.meta.site,
              plannedHC: snap.meta.plannedHC || 0,
              notes: 'Manually loaded roster'
            });
            console.log('[LOAD-ROSTER] Started analytics session');
          }
        }
      } catch (error) {
        console.warn('[LOAD-ROSTER] Failed to start analytics session:', error);
      }
    });
  }
  
  // Clear Board button
  if (clearSavedBtn) {
    clearSavedBtn.addEventListener('click', () => {
      if (confirm('Clear all assignments and move everyone back to unassigned?')) {
        // Clear all assignments
        Object.values(STATE.badges).forEach(badge => {
          badge.loc = 'unassigned';
        });
        
        // Clear multi-site assignments
        Object.keys(STATE.sites).forEach(siteCode => {
          STATE.sites[siteCode].assignments = {};
        });
        
        // Save the cleared state
        MULTISITE.saveToStorage();
        
        // Re-render the board
        renderAllBadges();
        setCounts();
        
        // Log the board clear action
        ANALYTICS.logAssignment(null, 'Board Clear', 'All Unassigned');
        
        output.textContent = 'Board cleared - all associates moved to unassigned.';
        console.log('[CLEAR-BOARD] All assignments cleared');
      }
    });
  }

  // File input handling to update labels
  const rosterInput = document.getElementById('roster');
  const loginsInput = document.getElementById('logins');
  const adjustmentsInput = document.getElementById('adjustments');
  
  if (rosterInput) {
    rosterInput.addEventListener('change', (e) => {
      const label = document.getElementById('label-roster');
      if (label) {
        if (e.target.files.length > 0) {
          label.textContent = e.target.files[0].name;
          label.style.color = '#374151';
        } else {
          label.textContent = '';
        }
      }
    });
  }
  
  if (loginsInput) {
    loginsInput.addEventListener('change', (e) => {
      const label = document.getElementById('label-logins');
      if (label) {
        if (e.target.files.length > 0) {
          label.textContent = e.target.files[0].name;
          label.style.color = '#374151';
        } else {
          label.textContent = '';
        }
      }
    });
  }

  if (adjustmentsInput) {
    adjustmentsInput.addEventListener('change', async (e) => {
      const label = document.getElementById('label-adjustments');
      const file = e.target.files && e.target.files[0];
      if (!label) return;
      if (!file){ label.textContent=''; return; }
      label.textContent = file.name; label.style.color = '#a16207';
      // Live preview: parse the CSV immediately to show +adds/-removals for the selected date
      try {
        const rows = await parseCsv(file);
        const todayKey = (document.getElementById('date')?.value || document.getElementById('date_roster')?.value || '').trim();
        const stats = { SWAPIN:0, SWAPOUT:0, VET:0, VTO:0 };
        rows.forEach(r => {
          const action = String(r.Action || r.Type || '').toUpperCase().trim();
          const d = String(r.Date || r.date || '').trim();
          if (todayKey && d && d !== todayKey) return; // only for selected date in preview
          if (action === 'SWAPIN' || action === 'VET') stats[action]++;
          else if (action === 'SWAPOUT' || action === 'VTO') stats[action]++;
        });
        const plus = (stats.SWAPIN||0) + (stats.VET||0);
        const minus = (stats.SWAPOUT||0) + (stats.VTO||0);
        window.VLAB_ADJUST_PREVIEW = stats;
        label.textContent = `${file.name} (+${plus}/-${minus}${todayKey?` for ${todayKey}`:''})`;
        if (plus===0 && minus===0 && Array.isArray(rows) && rows.length>0){
          const msg = `Adjustments file parsed (${rows.length} rows) but none match the selected Date. They will apply only for ${todayKey}.`;
          try{ TOAST.info(msg); }catch(_){ console.info('[ADJUST-PREVIEW]', msg); }
        }

        // Auto-build: trigger the same flow as clicking Build Schedule Board
        // Use a small timeout to let label UI update first
        setTimeout(() => {
          try {
            const form = document.getElementById('rosterForm') || document.getElementById('laborForm');
            if (!form) return;
            // Give user feedback
            try { TOAST.show('Building with adjustments…', 'info'); } catch(_) {}
            const evt = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(evt);
          } catch(err){ console.warn('[AUTO-BUILD] Failed to trigger build from adjustments upload:', err); }
        }, 100);
      } catch(err){
        console.warn('[ADJUST-PREVIEW] Failed to parse adjustments for preview:', err);
      }
    });
  }

  // Undo/Redo buttons
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      HISTORY.undo();
    });
  }
  
  if (redoBtn) {
    redoBtn.addEventListener('click', () => {
      HISTORY.redo();
    });
  }

  // submit




  function setupVPH(hc){
    const volInput = document.getElementById('plannedVolumeStub');
    if (!volInput) return;
    const id = 'vph-inline';
    let node = document.getElementById(id);
    if (!node){ node = document.createElement('div'); node.id = id; node.className = 'text-sm text-gray-600 mt-1'; document.getElementById('output').appendChild(node); }
    const update = () => { const planned = Number(volInput.value || 0); node.textContent = `Volume per Head: ${hc > 0 ? (planned / hc).toFixed(2) : '0'}`; };
    volInput.removeEventListener('input', update);
    volInput.addEventListener('input', update);
    update();
  }

  document.getElementById('exportLogBtn')?.addEventListener('click', () => {
    const payload = { date: elDate.textContent, day: elDay.textContent, shift: elShift.textContent, site: elSite.textContent, shiftType: elType.textContent, plannedHC: elPlan.textContent, actualHC: elActual.textContent, ts: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `vlab-shift-summary-${payload.date || 'NA'}.json`; a.click();
  });

  // Publish / Unpublish flow: show assignments-only fullscreen view
  const publishBtn = document.getElementById('publishBtn');
  const exitPublishBtn = document.getElementById('exitPublishBtn');
  function enterPublish(){
    // If an unassigned overlay is open, close it and ensure the unassigned stack lives in the left panel
    try{ if (typeof closeUnassignedOverlay === 'function') closeUnassignedOverlay(); }catch(_){ }
    try{ const lp = document.getElementById('leftPanel'); if (lp && unassignedStack && unassignedStack.parentElement !== lp) lp.appendChild(unassignedStack); }catch(_){ }
    document.body.classList.add('published');
    if (publishBtn) publishBtn.classList.add('hidden');
    if (exitPublishBtn) exitPublishBtn.classList.remove('hidden');
    // focus the exit button for accessibility
    exitPublishBtn && exitPublishBtn.focus();
  }
  function exitPublish(){
    document.body.classList.remove('published');
    if (publishBtn) publishBtn.classList.remove('hidden');
    if (exitPublishBtn) exitPublishBtn.classList.add('hidden');
    publishBtn && publishBtn.focus();
  }
  publishBtn?.addEventListener('click', (ev) => {
    // quick confirmation to avoid accidental publish
    if (!confirm('Publish assignments: this will hide controls and show a fullscreen assignments-only view. Proceed?')) return;
    enterPublish();
  });
  exitPublishBtn?.addEventListener('click', (ev) => { exitPublish(); });

  // ESC key exits publish mode
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('published')) exitPublish(); });

  // Analytics Dashboard Management (tab-only; header button removed)
  const exportAnalyticsBtn = document.getElementById('exportAnalyticsBtn');
  const clearAnalyticsBtn = document.getElementById('clearAnalyticsBtn');

  // Analytics tab management (elements are embedded inside Analytics tab)
  const analyticsTabs = document.querySelectorAll('.analytics-tab');
  const analyticsTabContents = document.querySelectorAll('.analytics-tab-content');
  const analyticsSearchInput = document.getElementById('analyticsSearchInput');
  const analyticsSearchResults = document.getElementById('analyticsSearchResults');
  
  // Header Analytics button was removed; navigation via burger menu only

  // ----- Quarter helpers -----
  function nextProcessKey(key){
    const ring = TILES.map(t => t[1]).filter(k => k !== 'unassigned');
    const idx = ring.indexOf(key);
    if (idx === -1) return key;
    return ring[(idx + 1) % ring.length];
  }

  function snapshotCurrentQuarter(){
    const q = STATE.currentQuarter || 'Q1';
    // Preserve existing assignments, don't wipe them
    STATE.quarterAssignments[q] = STATE.quarterAssignments[q] || {};
    Object.values(STATE.badges).forEach(b => { STATE.quarterAssignments[q][b.id] = b.loc; });
    try{ localStorage.setItem('vlab:quarterAssignments', JSON.stringify(STATE.quarterAssignments)); }catch(_){ }
    console.log(`[QUARTER] Snapshotted current quarter ${q} with ${Object.keys(STATE.quarterAssignments[q]).length} assignments`);
  }

  function applyQuarterAssignments(q){
    const snap = (STATE.quarterAssignments && STATE.quarterAssignments[q]) || null;
    if (!snap) return;
    Object.entries(snap).forEach(([bid, loc]) => { if (STATE.badges[bid]) STATE.badges[bid].loc = loc; });
    renderAllBadges();
  }

  function rotateFromTo(prevQ, newQ){
    // Simple round-robin rotation across process ring
    const prevSnap = STATE.quarterAssignments[prevQ] || null;
    if (!prevSnap) { snapshotCurrentQuarter(); return; }
    // Preserve existing assignments in new quarter, don't wipe them
    STATE.quarterAssignments[newQ] = STATE.quarterAssignments[newQ] || {};
    Object.entries(prevSnap).forEach(([bid, prevLoc]) => {
      if (!STATE.badges[bid]) return;
      if (prevLoc && prevLoc !== 'unassigned'){
        const newLoc = nextProcessKey(prevLoc);
        const oldLoc = STATE.badges[bid].loc;
        STATE.badges[bid].loc = newLoc;
        STATE.quarterAssignments[newQ][bid] = newLoc;
        // Log as reassignment under new quarter
        ANALYTICS.logAssignment(bid, oldLoc, newLoc);
      } else {
        STATE.quarterAssignments[newQ][bid] = 'unassigned';
      }
    });
    renderAllBadges();
    try{ localStorage.setItem('vlab:quarterAssignments', JSON.stringify(STATE.quarterAssignments)); }catch(_){ }
  }

  function isQuarterLocked(q){ return !!(STATE.quarterLocks && STATE.quarterLocks[q]); }
  function handleQuarterChange(){
    const newQ = (quarterSelect && quarterSelect.value) || 'Q1';
    const prevQ = STATE.currentQuarter;
    if (newQ === prevQ) return;
    
    console.log(`[QUARTER-CHANGE] ============ SWITCHING FROM ${prevQ} TO ${newQ} ============`);
    console.log(`[QUARTER-CHANGE] 🔧 CORE FIX: Employees stay constant, only assignments change`);
    
    // Save current quarter assignments before switching
    if (prevQ) {
      console.log(`[QUARTER-CHANGE] 💾 Saving assignments for quarter ${prevQ}`);
      const currentAssignments = {};
      Object.values(STATE.badges).forEach(badge => {
        if (badge.loc !== 'unassigned') {
          currentAssignments[badge.id] = badge.loc;
        }
      });
      
      STATE.quarterAssignments = STATE.quarterAssignments || {};
      STATE.quarterAssignments[prevQ] = currentAssignments;
      
      console.log(`[QUARTER-CHANGE] 📋 Saved ${Object.keys(currentAssignments).length} assignments for ${prevQ}`);
    }
    
    // Switch quarter
    STATE.currentQuarter = newQ;
    console.log(`[QUARTER-CHANGE] 🔄 Current quarter is now: ${newQ}`);
    
    // CRITICAL FIX: Keep same employee pool, just change assignments
    console.log(`[QUARTER-CHANGE] 🎫 Keeping same ${Object.keys(STATE.badges).length} employees across quarters`);
    
    // Reset all badges to unassigned first
    Object.values(STATE.badges).forEach(badge => {
      badge.loc = 'unassigned';
    });
    
    // Load assignments for the new quarter (if any exist)
    if (STATE.quarterAssignments && STATE.quarterAssignments[newQ]) {
      const quarterAssignments = STATE.quarterAssignments[newQ];
      console.log(`[QUARTER-CHANGE] 📂 Loading ${Object.keys(quarterAssignments).length} assignments for quarter ${newQ}`);
      
      Object.entries(quarterAssignments).forEach(([badgeId, location]) => {
        if (STATE.badges[badgeId]) {
          STATE.badges[badgeId].loc = location;
          console.log(`[QUARTER-CHANGE] 📌 Restored: ${STATE.badges[badgeId].name} → ${location}`);
        }
      });
    } else {
      console.log(`[QUARTER-CHANGE] 📝 No existing assignments for quarter ${newQ} - starting fresh`);
    }
    
    // Save quarter assignments to localStorage
    try {
      localStorage.setItem('vlab:quarterAssignments', JSON.stringify(STATE.quarterAssignments));
      console.log(`[QUARTER-CHANGE] 💾 Saved quarter assignments to localStorage`);
    } catch (e) {
      console.warn('[QUARTER-CHANGE] Failed to save quarter assignments:', e);
    }
    
    // Update the UI
    renderAllBadges();
    setCounts();
    
    // Persist meta with quarter
    try{
      const raw = localStorage.getItem('vlab:lastRoster');
      if (raw){ 
        const snap = JSON.parse(raw); 
        if (snap && snap.meta){ 
          snap.meta.quarter = newQ; 
          localStorage.setItem('vlab:lastRoster', JSON.stringify(snap)); 
        } 
      }
    }catch(_){ }
    
    console.log(`[QUARTER-CHANGE] ✅ Quarter switch complete: ${Object.keys(STATE.badges).length} employees in ${newQ}`);
    console.log(`[QUARTER-CHANGE] ============ QUARTER SWITCH COMPLETE ============`);
  }
  quarterSelect && quarterSelect.addEventListener('change', handleQuarterChange);

  analyticsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and contents
      analyticsTabs.forEach(t => t.classList.remove('active'));
      analyticsTabContents.forEach(content => content.classList.add('hidden'));
      
      // Add active class to clicked tab and show corresponding content
      tab.classList.add('active');
      const tabName = tab.getAttribute('data-tab');
      document.getElementById(`tab-${tabName}`).classList.remove('hidden');
      
      // Load content for the selected tab
      loadAnalyticsContent(tabName);
      
      // Set up quarter filter for assignments tab
      if (tabName === 'assignments') {
        setTimeout(setupQuarterFilter, 50);
      }
    });
  });

  // Modal-based analytics handlers removed; analytics now lives in-tab

  // --- Analytics Search (Associate history across quarters) ---
  function ensureEmployeeIndex(){
    // Rebuild employee index from analytics history on each call to ensure freshness
    if (!STATE.analytics) STATE.analytics = {};
    STATE.analytics.employees = {};
    (STATE.analytics.history || []).forEach(h => {
      const login = h.employeeId || h.badgeId || h.eid;
      if (!login) return;
      if (!STATE.analytics.employees[login]){
        STATE.analytics.employees[login] = {
          login: login,
          name: h.employeeName || '',
          history: []
        };
      }
      // Map into expected fields with sensible fallbacks
      const rec = {
        date: h.date || h.timestamp || '',
        shiftType: h.shiftCode ? (String(h.shiftCode).toUpperCase().startsWith('N') ? 'Night' : 'Day') : '',
        quarter: h.quarter || '',
        ls: (typeof h.ls !== 'undefined') ? (h.ls ? 'Yes' : 'No') : 'No',
        assigned: (h.action === 'assign' || h.action === 'reassign' || h.action === 'lock') ? 'Yes' : 'No',
        process: h.toLocation || '',
        employeeId: h.employeeId || '',
        employeeName: h.employeeName || STATE.analytics.employees[login].name || ''
      };
      STATE.analytics.employees[login].history.push(rec);
    });
  }

  function parseQuarterValue(q){
    const s = String(q || '').toUpperCase();
    if (s === 'Q1') return 1; if (s === 'Q2') return 2; if (s === 'Q3') return 3; if (s === 'Q4') return 4;
    return 99;
  }

  function normalizeDateToYMD(v){
    if (!v) return '';
    if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10);
    if (typeof v === 'string'){
      const d = parseInputDate(v);
      if (d) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    if (v instanceof Date){
      return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
    }
    return String(v);
  }

  function renderSearchResults(query){
    if (!analyticsSearchResults) return;
    const q = String(query || '').trim();
    if (!q){
      analyticsSearchResults.classList.add('hidden');
      analyticsSearchResults.innerHTML = '';
      return;
    }
    
    const lower = q.toLowerCase();
    let rows = [];
    
    // Ensure multi-site assignments are up to date
    MULTISITE.syncCurrentAssignments();
    
    // Search through current badges for matching employees
    console.log('[Analytics Search] STATE.sites:', STATE.sites);
    console.log('[Analytics Search] Current site:', STATE.currentSite);
    
    Object.values(STATE.badges).forEach(badge => {
      const name = badge.name || '';
      const eid = badge.eid || '';
      
      if (String(name).toLowerCase().includes(lower) || String(eid).toLowerCase().includes(lower)) {
        console.log('[Analytics Search] Checking badge:', badge.id, name, 'loc:', badge.loc);
        
        // Find current assignment info
        let currentSite = 'Unassigned';
        let currentProcess = 'UNASSIGNED';
        let isAssigned = 'No';
        
        // Check each site for current assignment
        Object.entries(STATE.sites).forEach(([siteCode, siteData]) => {
          console.log(`[Analytics Search] Checking site ${siteCode}:`, siteData.assignments);
          if (siteData.assignments && siteData.assignments[badge.id]) {
            currentSite = siteCode;
            currentProcess = siteData.assignments[badge.id].toUpperCase();
            isAssigned = 'Yes';
            console.log(`[Analytics Search] Found assignment: ${badge.name} -> ${siteCode}/${currentProcess}`);
          }
        });
        
        // Also check badge.loc as fallback
        if (currentSite === 'Unassigned' && badge.loc && badge.loc !== 'unassigned' && badge.loc !== 'assigned-elsewhere') {
          currentSite = STATE.currentSite; // Use current site as fallback
          currentProcess = badge.loc.toUpperCase();
          isAssigned = 'Yes';
          console.log(`[Analytics Search] Using badge.loc fallback: ${badge.name} -> ${currentSite}/${currentProcess}`);
        }
        
        console.log(`[Analytics Search] Final result: ${badge.name} -> Site: ${currentSite}, Process: ${currentProcess}, Assigned: ${isAssigned}`);
        
        // Get the actual date from the form
        const formDate = document.getElementById('date')?.value || new Date().toISOString().split('T')[0];
        
        // Get the actual shift type from the form
        const formShift = document.querySelector('input[name="shift"]:checked')?.value || 'day';
        const shiftType = formShift.charAt(0).toUpperCase() + formShift.slice(1); // Capitalize
        
        rows.push({
          date: formDate, // Use form date instead of current date
          shiftType: shiftType, // Use form shift type
          quarter: STATE.currentQuarter || 'Q1',
          site: currentSite,
          ls: 'No', // Default
          assigned: isAssigned,
          process: currentProcess,
          employeeId: eid,
          employeeName: name
        });
      }
    });

    if (rows.length === 0){
      analyticsSearchResults.innerHTML = '<div class="muted">No matching employees found.</div>';
      analyticsSearchResults.classList.remove('hidden');
      return;
    }

    // Sort by name
    rows.sort((a,b) => {
      return (a.employeeName || '').localeCompare(b.employeeName || '');
    });

  const total = rows.length;
  // Render header + table
  const header = `<div class="results-header"><span>Current Status - Matches: <strong>${total}</strong></span></div>`;
    const tableHead = `
      <thead><tr>
        <th>Date</th>
        <th>Shift Type</th>
        <th>Quarter</th>
        <th>Site</th>
        <th>LS</th>
        <th>Assigned</th>
        <th>Process</th>
        <th>Employee ID</th>
        <th>Employee Name</th>
      </tr></thead>`;
    const tableBody = `<tbody>${rows.map(r => `
      <tr>
        <td>${r.date || ''}</td>
        <td>${r.shiftType || ''}</td>
        <td>${r.quarter || ''}</td>
        <td><span class="site-badge site-${(r.site||'').toLowerCase()}">${r.site || 'N/A'}</span></td>
        <td>${r.ls}</td>
        <td>${r.assigned}</td>
        <td>${(r.process||'').toString().toUpperCase()}</td>
        <td>${r.employeeId || ''}</td>
        <td>${r.employeeName || ''}</td>
      </tr>
    `).join('')}</tbody>`;

    analyticsSearchResults.innerHTML = header + `<table>${tableHead}${tableBody}</table>`;
    analyticsSearchResults.classList.remove('hidden');
  }

  // Bind search input (responsive updates)
  analyticsSearchInput && analyticsSearchInput.addEventListener('input', (e) => {
    renderSearchResults(e.target.value);
  });

  function loadAnalyticsContent(tabName) {
    switch(tabName) {
      case 'overview':
        loadOverviewContent();
        break;
      case 'performance':
        loadPerformanceContent();
        break;
      case 'assignments':
        // Check if quarter filter exists and use its value
        const quarterFilter = document.getElementById('quarterFilter');
        const selectedQuarter = quarterFilter ? quarterFilter.value : 'all';
        loadAssignmentsContent(selectedQuarter);
        break;
      case 'rotation':
        loadRotationContent();
        break;
    }
  }

  function loadOverviewContent() {
    // Session Summary — total associates, active assignments, current site
    const sessionSummary = document.getElementById('sessionSummary');
    const totalEmployees = Object.keys(STATE.badges).length;
    const activeAssignments = Object.values(STATE.badges).filter(b => b.loc && b.loc !== 'unassigned' && b.loc !== 'assigned-elsewhere').length;
    const currentSite = STATE.currentSite || document.getElementById('site')?.value || '—';
    sessionSummary.innerHTML = `
      <div class="metric-row">
        <span class="metric-label">Total Associates</span>
        <span class="metric-value">${totalEmployees}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Active Assignments</span>
        <span class="metric-value">${activeAssignments}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Current Site</span>
        <span class="metric-value">${currentSite}</span>
      </div>
    `;

    // Assignment Activity — per current session (fallback to today)
    const sessionId = ANALYTICS.getCurrentSessionId && ANALYTICS.getCurrentSessionId();
    let scope = [];
    if (sessionId) {
      scope = (STATE.analytics.history || []).filter(h => h.sessionId === sessionId);
    } else {
      const today = new Date().toDateString();
      scope = (STATE.analytics.history || []).filter(h => h.date === today);
    }
    const assignedCount = scope.filter(h => h.action === 'assign').length;
    const unassignedCount = scope.filter(h => h.action === 'unassign').length;
    const swappedCount = scope.filter(h => h.action === 'reassign').length;
    const assignmentActivity = document.getElementById('assignmentActivity');
    assignmentActivity.innerHTML = `
      <div class="metric-row"><span class="metric-label">Assigned</span><span class="metric-value">${assignedCount}</span></div>
      <div class="metric-row"><span class="metric-label">Unassigned</span><span class="metric-value">${unassignedCount}</span></div>
      <div class="metric-row"><span class="metric-label">Swapped</span><span class="metric-value">${swappedCount}</span></div>
    `;

    // Process Distribution — grouped to Pick/Sort/Dock
    const processDistribution = document.getElementById('processDistribution');
    const groupCounts = { PICK: 0, SORT: 0, DOCK: 0 };
    (STATE.analytics.history || []).forEach(h => {
      if (h.toLocation && h.toLocation !== 'unassigned') {
        const g = mapProcessToPath(h.toLocation);
        if (groupCounts[g] != null) groupCounts[g] += 1;
      }
    });
    processDistribution.innerHTML = `
      <div class="metric-row"><span class="metric-label">Pick</span><span class="metric-value">${groupCounts.PICK}</span></div>
      <div class="metric-row"><span class="metric-label">Sort</span><span class="metric-value">${groupCounts.SORT}</span></div>
      <div class="metric-row"><span class="metric-label">Dock</span><span class="metric-value">${groupCounts.DOCK}</span></div>
    `;

    // Efficiency Metrics — placeholders for UPH/CPLH + utilization
    const efficiencyMetrics = document.getElementById('efficiencyMetrics');
    const utilizationRate = totalEmployees > 0 ? ((activeAssignments / totalEmployees) * 100).toFixed(1) : 0;
    efficiencyMetrics.innerHTML = `
      <div class="metric-row"><span class="metric-label">UPH (Avg)</span><span class="metric-value">—</span></div>
      <div class="metric-row"><span class="metric-label">CPLH (Avg)</span><span class="metric-value">—</span></div>
      <div class="metric-row"><span class="metric-label">Utilization Rate</span><span class="metric-value ${utilizationRate >= 85 ? 'positive' : utilizationRate < 60 ? 'negative' : ''}">${utilizationRate}%</span></div>
    `;
  }

  function loadPerformanceContent() {
    const elPlannedActual = document.getElementById('perfPlannedActual');
    const elAttendance = document.getElementById('perfAttendance');
    const elVetVto = document.getElementById('perfVetVto');
    const elProcessPerf = document.getElementById('perfProcessPerformance');

    // Filters
    const shiftSel = document.getElementById('performanceShiftFilter');
    const procSel = document.getElementById('performanceProcessFilter');
    const dateSel = document.getElementById('performanceDateFilter');

    // Default filter values
    if (dateSel && !dateSel.value) {
      const d = document.getElementById('date')?.value; if (d) dateSel.value = d;
    }
    const shift = (shiftSel && shiftSel.value !== 'auto') ? shiftSel.value : (document.querySelector('input[name="shift"]:checked')?.value || 'day');
    const proc = (procSel && procSel.value) || 'all';

    // Planned vs Actual Headcount
    const planned = Number(document.getElementById('plannedVolumeStub')?.value || 0);
    const actual = Object.values(STATE.badges).filter(b => b.loc && b.loc !== 'unassigned' && b.loc !== 'assigned-elsewhere').length;
    const pct = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;
    elPlannedActual.innerHTML = `
      <div class="metric-row"><span class="metric-label">Planned</span><span class="metric-value">${planned}</span></div>
      <div class="metric-row"><span class="metric-label">Actual</span><span class="metric-value">${actual}</span></div>
      <div class="performance-bar"><div class="performance-fill" style="width:${pct}%"></div></div>
      <div class="text-xs text-gray-500 mt-1">${pct}% of plan</div>
    `;

    // Attendance Rate (placeholder: assigned/total)
    const total = Object.keys(STATE.badges).length;
    const attendance = total > 0 ? Math.round((actual / total) * 100) : 0;
    elAttendance.innerHTML = `
      <div class="metric-row"><span class="metric-label">Attendance Rate</span><span class="metric-value ${attendance >= 85 ? 'positive' : attendance < 60 ? 'negative' : ''}">${attendance}%</span></div>
      <div class="text-xs text-gray-500">Derived from active assignments vs total roster</div>
    `;

    // VET / VTO Participation (placeholder)
    elVetVto.innerHTML = `
      <div class="metric-row"><span class="metric-label">VET Participation</span><span class="metric-value">—</span></div>
      <div class="metric-row"><span class="metric-label">VTO Participation</span><span class="metric-value">—</span></div>
      <div class="text-xs text-gray-500">Bind to future VET/VTO data source</div>
    `;

    // Process-level Performance (Pick/Sort/Dock grouped rates)
    const grouped = { PICK: 0, SORT: 0, DOCK: 0 };
    Object.values(STATE.badges).forEach(b => {
      const g = mapProcessToPath(b.loc);
      if (g && grouped[g] != null) grouped[g] += (b.loc && b.loc !== 'unassigned') ? 1 : 0;
    });
    const rows = ['PICK','SORT','DOCK']
      .filter(g => proc === 'all' || proc === g)
      .map(g => `<div class="metric-row"><span class="metric-label">${g.charAt(0) + g.slice(1).toLowerCase()}</span><span class="metric-value">${grouped[g]}</span></div>`)
      .join('');
    elProcessPerf.innerHTML = rows || '<p>No data</p>';

    // Re-bind filter listeners once
    if (!loadPerformanceContent._bound) {
      loadPerformanceContent._bound = true;
      shiftSel && shiftSel.addEventListener('change', () => loadPerformanceContent());
      procSel && procSel.addEventListener('change', () => loadPerformanceContent());
      dateSel && dateSel.addEventListener('change', () => loadPerformanceContent());
    }
  }

  function loadAssignmentsContent(selectedQuarter = null) {
    const tbody = document.getElementById('assignmentsTableBody');
    const assignmentPatterns = document.getElementById('assignmentPatterns');
    const assignmentRecommendations = document.getElementById('assignmentRecommendations');

    if (!tbody) return;

    // Filter by quarter
    const filterQuarter = selectedQuarter || (document.getElementById('quarterFilter')?.value || 'all');
    let rows = (STATE.analytics.history || []).slice();
    if (filterQuarter !== 'all') rows = rows.filter(r => r.quarter === filterQuarter);

    // Render table
    const toRow = (r) => {
      const path = mapProcessToPath(r.toLocation || '').toUpperCase();
      return `
        <tr>
          <td class="px-3 py-1">${r.employeeId || ''}</td>
          <td class="px-3 py-1">${r.employeeName || ''}</td>
          <td class="px-3 py-1">${path}</td>
          <td class="px-3 py-1">${r.action || ''}</td>
          <td class="px-3 py-1">${new Date(r.timestamp).toLocaleString()}</td>
          <td class="px-3 py-1">${r.quarter || ''}</td>
        </tr>`;
    };
    tbody.innerHTML = rows.slice(-200).reverse().map(toRow).join('');

    // Bind local search for assignments log
    const search = document.getElementById('assignmentsSearch');
    if (search && !search._bound) {
      search._bound = true;
      search.addEventListener('input', () => {
        const q = (search.value || '').toLowerCase();
        Array.from(tbody.children).forEach(tr => {
          tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      });
    }

    // Patterns (quick summary)
    const patternStats = analyzeAssignmentPatterns();
    if (assignmentPatterns) {
      assignmentPatterns.innerHTML = `
        <div class="metric-row"><span class="metric-label">Peak Assignment Hour</span><span class="metric-value">${patternStats.peakHour}:00</span></div>
        <div class="metric-row"><span class="metric-label">Most Active Process</span><span class="metric-value">${patternStats.mostActiveProcess}</span></div>
        <div class="metric-row"><span class="metric-label">Avg Time Between Moves</span><span class="metric-value">${patternStats.avgTimeBetweenMoves} min</span></div>
      `;
    }

    // Recommendations (reuse existing engine, show few)
    if (assignmentRecommendations) {
      const processOptions = ['cb', 'ibws', 'lineloaders', 'trickle', 'dm'];
      let allRec = [];
      processOptions.forEach(p => {
        const recs = ANALYTICS.getRecommendations(p, { fairRotation: true }).slice(0, 2);
        recs.forEach(r => { r.targetProcess = p.toUpperCase(); allRec.push(r); });
      });
      allRec.sort((a,b)=> b.score - a.score);
      assignmentRecommendations.innerHTML = allRec.slice(0,5).map(r => `
        <div class="recommendation-item">
          <div class="recommendation-header">${r.name} → ${r.targetProcess}</div>
          <div class="recommendation-reason">${r.fullReason || r.reason} (Score: ${r.score.toFixed(1)})</div>
        </div>
      `).join('') || '<p>No recommendations available</p>';
    }
  }

  function loadRotationContent() {
    const elSummary = document.getElementById('rotationSummary');
    const elIndex = document.getElementById('rotationFairnessIndex');
    const qSel = document.getElementById('rotationQuarterToggle');

    // Generate fairness alerts
    const alerts = ANALYTICS.ROTATION.generateFairnessAlerts();
    
    // Generate path recommendations
    const currentSite = STATE.currentSite || 'YDD2';
    const currentShift = document.querySelector('input[name="shift"]:checked')?.value || 'day';
    const pathRecs = ANALYTICS.ROTATION.generatePathRecommendations({
      site: currentSite,
      shift: currentShift
    });

    // Render rotation recommendations by path
    let summaryHTML = '<div class="space-y-4">';
    
    // Show alerts first
    if (alerts.length > 0) {
      summaryHTML += `
        <div class="bg-yellow-50 border border-yellow-200 rounded p-3">
          <h4 class="font-bold text-sm mb-2 text-yellow-900">⚠️ Fairness Alerts</h4>
          <div class="space-y-1">
            ${alerts.slice(0, 5).map(alert => `
              <div class="text-xs ${alert.severity === 'high' ? 'text-red-600' : 'text-yellow-700'}">
                <span class="font-semibold">${alert.severity.toUpperCase()}:</span> ${alert.message}
              </div>
            `).join('')}
            ${alerts.length > 5 ? `<div class="text-xs text-gray-500 italic">+${alerts.length - 5} more alerts...</div>` : ''}
          </div>
        </div>
      `;
    }
    
    // Show top recommendations per path
    summaryHTML += '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">';
    
    // Show top 6 paths
    const topPaths = Object.entries(pathRecs).slice(0, 6);
    topPaths.forEach(([pathKey, pathData]) => {
      const topCandidates = pathData.topCandidates.slice(0, 5);
      summaryHTML += `
        <div class="border border-gray-200 rounded p-3 bg-white">
          <h5 class="font-bold text-sm mb-2 text-gray-800">${pathData.pathName} Recommendations</h5>
          <div class="space-y-1">
            ${topCandidates.map((candidate, idx) => {
              const scoreColor = candidate.priorityScore > 5 ? 'text-green-600' : candidate.priorityScore > 2 ? 'text-blue-600' : 'text-gray-600';
              return `
                <div class="text-xs flex items-center justify-between">
                  <div class="flex-1">
                    <span class="font-medium">${idx + 1}. ${candidate.name}</span>
                    <span class="text-gray-500 text-[10px] ml-1">(${candidate.scode})</span>
                  </div>
                  <span class="${scoreColor} font-bold" title="Priority Score: ${candidate.priorityScore.toFixed(2)}">${candidate.priorityScore.toFixed(1)}</span>
                </div>
                ${idx === 0 && candidate.scoreDetails.daysSinceLast !== 'Never' ? `
                  <div class="text-[10px] text-gray-500 ml-2">
                    Last: ${candidate.scoreDetails.daysSinceLast} days ago | Recent: ${candidate.scoreDetails.recentCount14d} (14d)
                  </div>
                ` : ''}
              `;
            }).join('')}
          </div>
          ${pathData.totalEligible > 5 ? `<div class="text-[10px] text-gray-400 mt-1">+${pathData.totalEligible - 5} more eligible</div>` : ''}
        </div>
      `;
    });
    
    summaryHTML += '</div>';
    
    // Add explanation panel
    summaryHTML += `
      <div class="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-gray-700">
        <h5 class="font-bold text-sm mb-1 text-blue-900">📊 Rotation Scoring Model</h5>
        <p><strong>Priority Score</strong> = Gap Bonus - (Recency Penalty + Frequency Penalty)</p>
        <ul class="list-disc list-inside mt-1 space-y-0.5">
          <li><strong>Higher score</strong> = assign first (fair rotation priority)</li>
          <li><strong>Recency Penalty:</strong> Penalizes recent assignments (1 / days since last)</li>
          <li><strong>Frequency Penalty:</strong> Penalizes over-assignment (0.5 × count in last 14 days)</li>
          <li><strong>Gap Bonus:</strong> Rewards long absence from path (log(1 + days))</li>
          <li><strong>Special Rules:</strong> +5 penalty if same path yesterday, +5 if >3x this week</li>
        </ul>
      </div>
    `;
    
    summaryHTML += '</div>';
    elSummary.innerHTML = summaryHTML;

    // Fairness Index — calculate overall fairness across all associates
    const fairnessScores = Object.values(STATE.analytics.performance || {}).map(emp => {
      const fairness = ANALYTICS.ROTATION.calculateFairnessScore(emp.employeeId);
      return fairness.fairnessScore;
    });
    
    const overall = fairnessScores.length ? Math.round(fairnessScores.reduce((s,v)=>s+v,0)/fairnessScores.length) : 100;
    const poorCount = fairnessScores.filter(s => s < 50).length;
    const goodCount = fairnessScores.filter(s => s >= 70).length;
    
    elIndex.innerHTML = `
      <div class="metric-row"><span class="metric-label">Overall Fairness Index</span><span class="metric-value ${overall >= 70 ? 'positive' : overall < 50 ? 'negative' : ''}">${overall}</span></div>
      <div class="performance-bar"><div class="performance-fill" style="width:${overall}%"></div></div>
      <div class="text-xs text-gray-600 mt-2 space-y-1">
        <div>📊 Based on variance of work distribution across paths</div>
        <div>✅ Balanced Associates: <strong>${goodCount}</strong></div>
        <div>⚠️ Unbalanced Associates: <strong>${poorCount}</strong></div>
        <div class="text-gray-500 mt-1">${fairnessScores.length} associates tracked</div>
      </div>
    `;

    if (!loadRotationContent._bound) {
      loadRotationContent._bound = true;
      qSel && qSel.addEventListener('change', () => loadRotationContent());
    }
  }

  // --- Helpers: Map granular process keys to Pick/Sort/Dock groups ---
  function mapProcessToPath(key) {
    if (!key) return 'SORT';
    const k = String(key).toLowerCase();
    // Note: This grouping is a placeholder; adjust based on your site's taxonomy
    const PICK = new Set(['pick','pa','ps']);
    const SORT = new Set(['e2s','e2sws','tws','sap','dm','idrt','each to sort']);
    const DOCK = new Set(['dock','dockws','pb','tpb','lineloaders','pallet build','line loaders']);
    if (PICK.has(k)) return 'PICK';
    if (SORT.has(k)) return 'SORT';
    if (DOCK.has(k)) return 'DOCK';
    // Try prefix/contains matching
    if (k.includes('dock')) return 'DOCK';
    if (k.includes('pick')) return 'PICK';
    if (k.includes('sort') || k.includes('e2s') || k.includes('tote') || k.includes('sap') || k.includes('dm')) return 'SORT';
    return 'SORT';
  }

  function loadInsightsContent() {
    const workforceInsights = document.getElementById('workforceInsights');
    const trainingOpportunities = document.getElementById('trainingOpportunities');
    const productivityTrends = document.getElementById('productivityTrends');

    // Workforce Insights
    const insights = generateWorkforceInsights();
    workforceInsights.innerHTML = insights.map(insight => `
      <div class="insight-item">
        <div class="insight-title">${insight.title}</div>
        <div class="insight-description">${insight.description}</div>
      </div>
    `).join('');

    // Training Opportunities
    const trainingNeeds = getAllTrainingNeeds();
    trainingOpportunities.innerHTML = trainingNeeds.map(need => `
      <div class="metric-row">
        <span class="metric-label">${need.employee}</span>
        <span class="metric-value">${need.process}</span>
      </div>
    `).join('') || '<p>No specific training needs identified</p>';

    // Productivity Trends
    const trends = calculateProductivityTrends();
    productivityTrends.innerHTML = `
      <div class="metric-row">
        <span class="metric-label">Trend Direction</span>
        <span class="metric-value ${trends.direction === 'up' ? 'positive' : trends.direction === 'down' ? 'negative' : ''}">${trends.direction === 'up' ? '↗ Improving' : trends.direction === 'down' ? '↘ Declining' : '→ Stable'}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Change Rate</span>
        <span class="metric-value">${trends.changeRate.toFixed(1)}%</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Peak Performance</span>
        <span class="metric-value">${trends.peakScore.toFixed(1)}</span>
      </div>
    `;
  }

  // Helper functions for analytics
  function getMostExperiencedProcess() {
    const processExp = {};
    Object.values(STATE.analytics.performance).forEach(emp => {
      Object.entries(emp.processExperience).forEach(([process, count]) => {
        processExp[process] = (processExp[process] || 0) + count;
      });
    });
    const topProcess = Object.entries(processExp).sort((a, b) => b[1] - a[1])[0];
    return topProcess ? topProcess[0].toUpperCase() : 'None';
  }

  function getTrainingOpportunityCount() {
    return Object.values(STATE.analytics.performance)
      .reduce((sum, emp) => sum + emp.trainingNeeds.length, 0);
  }

  function analyzeAssignmentPatterns() {
    const hours = {};
    const processes = {};
    const timeBetweenMoves = [];
    
    let lastTimestamp = null;
    STATE.analytics.history.forEach(entry => {
      const hour = new Date(entry.timestamp).getHours();
      hours[hour] = (hours[hour] || 0) + 1;
      
      if (entry.toLocation !== 'unassigned') {
        processes[entry.toLocation] = (processes[entry.toLocation] || 0) + 1;
      }
      
      if (lastTimestamp) {
        const diffMinutes = (new Date(entry.timestamp) - new Date(lastTimestamp)) / (1000 * 60);
        timeBetweenMoves.push(diffMinutes);
      }
      lastTimestamp = entry.timestamp;
    });
    
    const peakHour = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];
    const mostActive = Object.entries(processes).sort((a, b) => b[1] - a[1])[0];
    const avgTime = timeBetweenMoves.length > 0 ? 
      timeBetweenMoves.reduce((sum, time) => sum + time, 0) / timeBetweenMoves.length : 0;
    
    return {
      peakHour: peakHour ? peakHour[0] : 'N/A',
      mostActiveProcess: mostActive ? mostActive[0].toUpperCase() : 'N/A',
      avgTimeBetweenMoves: avgTime.toFixed(1)
    };
  }

  function generateWorkforceInsights() {
    const insights = [];
    const employees = Object.values(STATE.analytics.performance);
    
    if (employees.length === 0) {
      return [{ title: 'Getting Started', description: 'Start assigning employees to generate workforce insights' }];
    }
    
    const avgScore = employees.reduce((sum, emp) => sum + emp.performanceScore, 0) / employees.length;
    const topPerformer = employees.sort((a, b) => b.performanceScore - a.performanceScore)[0];
    
    insights.push({
      title: 'Workforce Performance',
      description: `Average performance score is ${avgScore.toFixed(1)}. ${topPerformer.name} leads with ${topPerformer.performanceScore.toFixed(1)} points.`
    });
    
    const versatilityLevels = employees.map(emp => emp.versatility);
    const avgVersatility = versatilityLevels.reduce((sum, v) => sum + v, 0) / versatilityLevels.length;
    
    insights.push({
      title: 'Skill Distribution',
      description: `Average employee versatility is ${avgVersatility.toFixed(1)} processes. Consider cross-training to improve flexibility.`
    });
    
    if (STATE.analytics.history.length > 50) {
      insights.push({
        title: 'Assignment Efficiency',
        description: 'Rich assignment history detected. Use the recommendations engine to optimize future assignments based on historical performance patterns.'
      });
    }
    
    return insights;
  }

  function getAllTrainingNeeds() {
    const trainingNeeds = [];
    Object.values(STATE.analytics.performance).forEach(emp => {
      emp.trainingNeeds.forEach(process => {
        trainingNeeds.push({
          employee: emp.name,
          process: process.toUpperCase()
        });
      });
    });
    return trainingNeeds.slice(0, 10); // Limit to top 10
  }

  function calculateProductivityTrends() {
    const allTrends = [];
    Object.values(STATE.analytics.performance).forEach(emp => {
      allTrends.push(...emp.productivityTrends);
    });
    
    if (allTrends.length < 10) {
      return { direction: 'stable', changeRate: 0, peakScore: 0 };
    }
    
    const sortedTrends = allTrends.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const recent = sortedTrends.slice(-10);
    const earlier = sortedTrends.slice(-20, -10);
    
    const recentAvg = recent.reduce((sum, t) => sum + t.score, 0) / recent.length;
    const earlierAvg = earlier.length > 0 ? earlier.reduce((sum, t) => sum + t.score, 0) / earlier.length : recentAvg;
    
    const changeRate = ((recentAvg - earlierAvg) / earlierAvg) * 100;
    const direction = changeRate > 5 ? 'up' : changeRate < -5 ? 'down' : 'stable';
    const peakScore = Math.max(...sortedTrends.map(t => t.score));
    
    return { direction, changeRate: Math.abs(changeRate), peakScore };
  }

  // No modal analytics event listeners; navigation via burger -> Analytics tab

  // Quarter filter event listener
  function setupQuarterFilter() {
    const quarterFilter = document.getElementById('quarterFilter');
    if (quarterFilter) {
      // Set current quarter as default if not already set
      if (!quarterFilter.value || quarterFilter.value === 'all') {
        quarterFilter.value = STATE.currentQuarter || 'Q1';
      }
      
      // Remove existing listener to prevent duplicates
      quarterFilter.replaceWith(quarterFilter.cloneNode(true));
      const newQuarterFilter = document.getElementById('quarterFilter');
      
      newQuarterFilter.addEventListener('change', (e) => {
        const selectedQuarter = e.target.value;
        console.log(`[Analytics] Quarter filter changed to: ${selectedQuarter}`);
        loadAssignmentsContent(selectedQuarter);
      });
      
      console.log(`[Analytics] Quarter filter setup complete, current selection: ${newQuarterFilter.value}`);
    }
  }

  // Quarter filter setup is now handled after analytics tab content loads

  // Enhanced export analytics with multiple formats
  exportAnalyticsBtn?.addEventListener('click', () => {
    // Export only Assignment History as CSV (with Quarter)
    const currentDate = new Date().toISOString().split('T')[0];
    const assignmentCSV = generateAssignmentHistoryCSV();
    const assignmentBlob = new Blob([assignmentCSV], {type: 'text/csv'});
    const assignmentLink = document.createElement('a');
    assignmentLink.href = URL.createObjectURL(assignmentBlob);
    assignmentLink.download = `vlab-assignment-history-${currentDate}.csv`;
    assignmentLink.click();
    alert('Assignment history exported as CSV.');
  });

  // Generate CSV export for performance data
  function generatePerformanceCSV() {
    const employees = Object.values(STATE.analytics.performance);
    if (employees.length === 0) return 'No performance data available';
    
    const headers = [
      'Employee ID', 'Employee Name', 'Performance Score', 'Total Assignments',
      'Versatility', 'Adaptability Score', 'Consistency Score', 'Collaboration Score',
      'Last Active', 'Top Skill 1', 'Top Skill 2', 'Top Skill 3', 'Training Needs'
    ];
    
    const rows = employees.map(emp => {
      const topSkills = Object.entries(emp.processExperience)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([process, count]) => `${process}(${count})`);
      
      while (topSkills.length < 3) topSkills.push('');
      
      return [
        emp.employeeId,
        emp.name,
        emp.performanceScore.toFixed(1),
        emp.totalAssignments,
        emp.versatility,
        emp.adaptabilityScore.toFixed(1),
        emp.consistencyScore.toFixed(1),
        emp.collaborationScore.toFixed(1),
        emp.lastActive || 'Never',
        topSkills[0],
        topSkills[1],
        topSkills[2],
        emp.trainingNeeds.join('; ')
      ];
    });
    
    return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }

  // Generate CSV export for assignment history
  function generateAssignmentHistoryCSV() {
    // Always produce a CSV header; include Quarter column
    const headers = [
      'Timestamp', 'Date', 'Employee ID', 'Employee Name', 'Shift Code',
      'Site', 'Quarter', 'Action', 'From Location', 'To Location', 'Session ID'
    ];

    const rows = (STATE.analytics.history || []).map(entry => [
      entry.timestamp,
      entry.date,
      entry.employeeId,
      entry.employeeName,
      entry.shiftCode,
      entry.site,
      entry.quarter || '',
      entry.action,
      entry.fromLocation,
      entry.toLocation,
      entry.sessionId
    ]);

    return [headers, ...rows].map(row => row.map(cell => `"${cell || ''}"`).join(',')).join('\n');
  }

  // Generate executive HTML report
  function generateExecutiveReport() {
    const employees = Object.values(STATE.analytics.performance);
    const totalAssignments = STATE.analytics.history.length;
    const activeSessions = STATE.analytics.sessions.length;
    const avgPerformance = employees.length > 0 ? 
      employees.reduce((sum, emp) => sum + emp.performanceScore, 0) / employees.length : 0;
    
    const topPerformers = employees
      .sort((a, b) => b.performanceScore - a.performanceScore)
      .slice(0, 5);
    
    const processStats = generateProcessStatistics();
    const insights = generateWorkforceInsights();
    const recommendations = ANALYTICS.getOptimizationSuggestions();
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>VLAB Workforce Analytics - Executive Summary</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #3b82f6; padding-bottom: 20px; }
            .header h1 { color: #1f2937; margin: 0; font-size: 28px; }
            .header p { color: #6b7280; margin: 10px 0 0 0; }
            .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 30px 0; }
            .metric-card { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; text-align: center; }
            .metric-value { font-size: 32px; font-weight: bold; color: #3b82f6; margin-bottom: 5px; }
            .metric-label { color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
            .section { margin: 40px 0; }
            .section h2 { color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
            .performers-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .performers-table th, .performers-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
            .performers-table th { background: #f8fafc; font-weight: 600; }
            .insight-item { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 10px 0; border-radius: 4px; }
            .recommendation-item { background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 10px 0; border-radius: 4px; }
            .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Virtual Labor Board Analytics</h1>
                <p>Executive Summary Report - ${new Date().toLocaleDateString()}</p>
            </div>
            
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-value">${totalAssignments}</div>
                    <div class="metric-label">Total Assignments</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${employees.length}</div>
                    <div class="metric-label">Employees Tracked</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${activeSessions}</div>
                    <div class="metric-label">Active Sessions</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${avgPerformance.toFixed(1)}</div>
                    <div class="metric-label">Avg Performance Score</div>
                </div>
            </div>
            
            <div class="section">
                <h2>Top Performers</h2>
                <table class="performers-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Employee Name</th>
                            <th>Performance Score</th>
                            <th>Versatility</th>
                            <th>Total Assignments</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${topPerformers.map((emp, index) => `
                            <tr>
                                <td>#${index + 1}</td>
                                <td>${emp.name}</td>
                                <td>${emp.performanceScore.toFixed(1)}</td>
                                <td>${emp.versatility} processes</td>
                                <td>${emp.totalAssignments}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <div class="section">
                <h2>Process Performance</h2>
                ${Object.entries(processStats).map(([process, stats]) => `
                    <div style="margin: 15px 0; padding: 15px; background: #f8fafc; border-radius: 6px;">
                        <strong>${process.toUpperCase()}</strong>: ${stats.totalAssignments} assignments, 
                        ${stats.uniqueEmployees} unique employees, 
                        Avg experience: ${stats.avgExperience.toFixed(1)}
                    </div>
                `).join('')}
            </div>
            
            <div class="section">
                <h2>Key Insights</h2>
                ${insights.map(insight => `
                    <div class="insight-item">
                        <strong>${insight.title}</strong><br>
                        ${insight.description}
                    </div>
                `).join('')}
            </div>
            
            <div class="section">
                <h2>Optimization Recommendations</h2>
                ${recommendations.slice(0, 5).map(rec => `
                    <div class="recommendation-item">
                        <strong>${rec.type === 'reassignment' ? 'Reassignment' : 'Assignment'} Suggestion</strong><br>
                        ${rec.reason} (Priority: ${rec.priority})
                    </div>
                `).join('')}
            </div>
            
            <div class="footer">
                Generated by VLAB Virtual Labor Board Analytics System<br>
                Report Date: ${new Date().toISOString()}
            </div>
        </div>
    </body>
    </html>`;
  }

  // Generate process statistics
  function generateProcessStatistics() {
    const processStats = {};
    
    STATE.analytics.history.forEach(entry => {
      if (entry.toLocation !== 'unassigned') {
        if (!processStats[entry.toLocation]) {
          processStats[entry.toLocation] = {
            totalAssignments: 0,
            uniqueEmployees: new Set(),
            experienceLevels: []
          };
        }
        
        processStats[entry.toLocation].totalAssignments++;
        processStats[entry.toLocation].uniqueEmployees.add(entry.employeeId);
        
        const empPerformance = STATE.analytics.performance[entry.employeeId];
        if (empPerformance) {
          const processExp = empPerformance.processExperience[entry.toLocation] || 0;
          processStats[entry.toLocation].experienceLevels.push(processExp);
        }
      }
    });
    
    // Calculate averages
    Object.entries(processStats).forEach(([process, stats]) => {
      stats.uniqueEmployees = stats.uniqueEmployees.size;
      stats.avgExperience = stats.experienceLevels.length > 0 ? 
        stats.experienceLevels.reduce((sum, exp) => sum + exp, 0) / stats.experienceLevels.length : 0;
    });
    
    return processStats;
  }

  // Calculate overall productivity metrics
  function calculateOverallProductivityMetrics() {
    const employees = Object.values(STATE.analytics.performance);
    if (employees.length === 0) return null;
    
    return {
      avgPerformanceScore: employees.reduce((sum, emp) => sum + emp.performanceScore, 0) / employees.length,
      avgVersatility: employees.reduce((sum, emp) => sum + emp.versatility, 0) / employees.length,
      avgAdaptability: employees.reduce((sum, emp) => sum + emp.adaptabilityScore, 0) / employees.length,
      avgConsistency: employees.reduce((sum, emp) => sum + emp.consistencyScore, 0) / employees.length,
      totalTrainingNeeds: employees.reduce((sum, emp) => sum + emp.trainingNeeds.length, 0),
      highPerformers: employees.filter(emp => emp.performanceScore >= 85).length,
      experiencedEmployees: employees.filter(emp => emp.versatility >= 5).length
    };
  }

  // Clear analytics data
  clearAnalyticsBtn?.addEventListener('click', () => {
    if (!confirm('Clear all analytics data? This action cannot be undone.')) return;
    try {
      STATE.analytics = { history: [], sessions: [], performance: {}, patterns: {} };
      if (typeof TOAST !== 'undefined' && TOAST.show) TOAST.show('Analytics data cleared','info');
      console.log('[ANALYTICS] Cleared all analytics structures');
    } catch(err){ console.warn('[ANALYTICS] Clear failed', err); }
  });

  // Lock Assignments functionality
  const lockAssignmentsBtn = document.getElementById('lockAssignmentsBtn');
  lockAssignmentsBtn?.addEventListener('click', () => {
    if (lockAssignmentsBtn.disabled) return;
    
    // Check if there are any assignments to lock
    const assignedBadges = Object.values(STATE.badges).filter(b => b.loc !== 'unassigned');
    if (assignedBadges.length === 0) {
      alert('No assignments to lock. Please assign employees to processes first.');
      return;
    }
    
    // Confirm quarter lock action
    // Always read the live quarter select to avoid stale state
    const quarterEl = document.getElementById('quarter');
    const selectedQuarter = (quarterEl && quarterEl.value) ? quarterEl.value : (STATE.currentQuarter || 'Q1');
    // Sync state if user changed dropdown but handler didn't fire yet
    if (selectedQuarter !== STATE.currentQuarter) {
      console.log(`[LOCK] Syncing currentQuarter from '${STATE.currentQuarter}' to '${selectedQuarter}' before lock`);
      STATE.currentQuarter = selectedQuarter;
    }
    const currQ = STATE.currentQuarter || 'Q1';
    if (STATE.quarterLocks && STATE.quarterLocks[currQ]){ alert(`Quarter ${currQ} is already locked.`); return; }
    const confirmMessage = `Lock ${assignedBadges.length} assignments for ${currQ}?\n\nThis will:\n• Freeze current quarter assignments\n• Include quarter in analytics logs\n• Generate smart rotation recommendations\n\nProceed?`;
    
    if (!confirm(confirmMessage)) return;
    
    try {
  // Lock only current quarter and activate rotation insights without disabling UI globally
  const lockRecord = ANALYTICS.ROTATION.lockQuarter(currQ);
      
      if (lockRecord) {
  alert(`✅ ${currQ} Locked!\n\n• Assignments frozen for ${currQ}\n• Rotation insights updated\n• Use Quarter dropdown to work on other quarters.`);
      }
    } catch (error) {
      console.error('[LOCK] Error locking assignments:', error);
      alert('Error locking assignments: ' + error.message);
    }
  });

  // Add debugging functions to window for console access
  window.debugUpload = function() {
  const form = document.getElementById('rosterForm') || document.getElementById('laborForm');
    const rosterInput = document.getElementById('roster');
    const loginsInput = document.getElementById('logins');
    
    console.log('=== UPLOAD DEBUG INFO ===');
    console.log('Form element:', form);
    console.log('Roster input:', rosterInput);
    console.log('Roster files:', rosterInput?.files);
    console.log('Logins input:', loginsInput);
    console.log('Logins files:', loginsInput?.files);
    console.log('Papa Parse available:', typeof Papa !== 'undefined');
    console.log('==========================');
    
    if (rosterInput?.files?.length > 0) {
      console.log('Roster file details:', {
        name: rosterInput.files[0].name,
        size: rosterInput.files[0].size,
        type: rosterInput.files[0].type,
        lastModified: new Date(rosterInput.files[0].lastModified)
      });
    }
  };
  
  window.testFormSubmission = function() {
  const form = document.getElementById('rosterForm') || document.getElementById('laborForm');
    if (form) {
      console.log('Triggering form submission manually...');
      const submitEvent = new Event('submit');
      form.dispatchEvent(submitEvent);
    } else {
      console.error('Form not found!');
    }
  };

  window.debugAssignmentPersistence = function() {
    console.log('=== ASSIGNMENT PERSISTENCE DEBUG ===');
    
    // Check localStorage
    const raw = localStorage.getItem('vlab:lastRoster');
    console.log('localStorage data exists:', !!raw);
    
    if (raw) {
      try {
        const snap = JSON.parse(raw);
        console.log('Parsed snapshot:', {
          hasBadges: !!snap.badges,
          badgeCount: snap.badges ? Object.keys(snap.badges).length : 0,
          hasSites: !!snap.sites,
          currentSite: snap.currentSite,
          siteKeys: snap.sites ? Object.keys(snap.sites) : []
        });
        
        if (snap.badges) {
          const assigned = Object.values(snap.badges).filter(b => 
            b.loc !== 'unassigned' && b.loc !== 'assigned-elsewhere'
          );
          console.log(`Badges with assignments in localStorage: ${assigned.length}`);
          assigned.forEach(b => console.log(`  - ${b.name} → ${b.loc} (site: ${b.site})`));
        }
        
        if (snap.sites) {
          Object.keys(snap.sites).forEach(siteKey => {
            const assignments = snap.sites[siteKey].assignments || {};
            const count = Object.keys(assignments).length;
            console.log(`${siteKey} site assignments: ${count}`);
            if (count > 0) {
              Object.entries(assignments).forEach(([badgeId, loc]) => {
                const badge = snap.badges[badgeId];
                console.log(`  - ${badge?.name || badgeId} → ${loc}`);
              });
            }
          });
        }
      } catch (error) {
        console.error('Error parsing localStorage data:', error);
      }
    }
    
    // Check current STATE
    console.log('\nCurrent STATE:');
    console.log('Current site:', STATE.currentSite);
    console.log('Badges count:', Object.keys(STATE.badges || {}).length);
    console.log('Sites:', Object.keys(STATE.sites || {}));
    
    if (STATE.badges) {
      const assigned = Object.values(STATE.badges).filter(b => 
        b.loc !== 'unassigned' && b.loc !== 'assigned-elsewhere'
      );
      console.log(`Current badges with assignments: ${assigned.length}`);
      assigned.forEach(b => console.log(`  - ${b.name} → ${b.loc} (site: ${b.site}, hidden: ${b.hidden})`));
    }
    
    console.log('====================================');
  };

  window.forceRestoreAssignments = function() {
    console.log('=== FORCE RESTORE ASSIGNMENTS ===');
    
    const raw = localStorage.getItem('vlab:lastRoster');
    if (!raw) {
      console.log('No saved data found');
      return;
    }
    
    try {
      const snap = JSON.parse(raw);
      if (snap.badges) {
        console.log('Forcing restoration of all assignments...');
        
        // Simple restore: just copy all assignments from snapshot
        Object.keys(snap.badges).forEach(badgeId => {
          if (STATE.badges[badgeId]) {
            const savedBadge = snap.badges[badgeId];
            const currentBadge = STATE.badges[badgeId];
            
            if (savedBadge.loc !== 'unassigned') {
              console.log(`Restoring ${currentBadge.name}: ${currentBadge.loc} → ${savedBadge.loc}`);
              currentBadge.loc = savedBadge.loc;
            }
          }
        });
        
        // Re-render everything
        renderAllBadges();
        setCounts();
        
        console.log('Force restore completed');
      }
    } catch (error) {
      console.error('Error in force restore:', error);
    }
  };

  // ================================================================================
  // MANUAL SCAN ASSIGNMENT MODE
  // ================================================================================
  // Purpose: Allow managers to scan process path barcodes + associate badges
  // to record real-time floor assignments without using drag-and-drop board.
  // This mode works even after board lock and feeds directly into rotation analytics.
  // ================================================================================

  const MANUAL_SCAN = {
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
      const mainSite = document.getElementById('site')?.value || STATE.currentSite;
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

      // Search in STATE.badges first
      for (const badgeId in STATE.badges) {
        const badge = STATE.badges[badgeId];
        if (badge.id.toLowerCase() === search || 
            badge.eid.toLowerCase() === search ||
            badge.name.toLowerCase().includes(search)) {
          return badge;
        }
      }

      // Search in DATABASE
      if (window.DATABASE) {
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
      if (typeof renderAllBadges === 'function') {
        renderAllBadges();
      }
      if (typeof setCounts === 'function') {
        setCounts();
      }

      // Persist to storage
      if (typeof saveToLocalStorage === 'function') {
        saveToLocalStorage();
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

  // Initialize manual scan mode
  MANUAL_SCAN.init();

  // Expose for debugging
  window.MANUAL_SCAN = MANUAL_SCAN;
  window.debugManualScan = function() {
    console.log('=== Manual Scan Debug ===');
    console.log('Current Path:', MANUAL_SCAN.currentPath);
    console.log('Session Context:', MANUAL_SCAN.sessionContext);
    console.log('Scan History:', MANUAL_SCAN.scanHistory);
    console.log('Total Scans:', MANUAL_SCAN.scanHistory.length);
    return {
      currentPath: MANUAL_SCAN.currentPath,
      context: MANUAL_SCAN.sessionContext,
      history: MANUAL_SCAN.scanHistory
    };
  };

}); // End of DOMContentLoaded
