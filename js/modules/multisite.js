// Multisite Module
// Extracted from app.js

window.MULTISITE = {
  // Ensure current site is synchronized with form
  ensureCurrentSiteSync: function() {
    const STATE = window.STATE;
    const formSite = document.getElementById('site')?.value;
    const headerSite = document.getElementById('headerSiteSelector')?.value;
    
    if (formSite && formSite !== STATE.currentSite) {
      console.log(`[MULTISITE] Syncing currentSite from form: ${STATE.currentSite} -> ${formSite}`);
      STATE.currentSite = formSite;
    } else if (headerSite && headerSite !== STATE.currentSite) {
      console.log(`[MULTISITE] Syncing currentSite from header: ${STATE.currentSite} -> ${headerSite}`);
      STATE.currentSite = headerSite;
    }
    
    return STATE.currentSite;
  },
  
  // Load associates from database for a specific site
  loadAssociatesFromDatabase: function(siteCode) {
    const STATE = window.STATE;
    const DATABASE = window.DATABASE;
    const classifySite = window.classifySite;
    const shiftCodeOf = window.shiftCodeOf;

    if (!DATABASE || DATABASE.database.size === 0) {
      console.warn('[MULTISITE] Database is empty, cannot load associates for site:', siteCode);
      return;
    }
    
    console.log(`[MULTISITE] Loading associates from database for site: ${siteCode}`);
    
    // Get current form settings for filtering
    const currentShift = document.querySelector('input[name="shift"]:checked')?.value || 'day';
    const currentDate = document.getElementById('date')?.value || '';
    
    // Load all associates from database and filter for current site
    const allAssociates = Array.from(DATABASE.database.values());
    const siteAssociates = allAssociates.filter(associate => {
      const site = classifySite(associate);
      
      // Site filtering logic
      if (siteCode === 'YHM2') {
        return site === 'YHM2';
      } else if (siteCode === 'YDD2' || siteCode === 'YDD4') {
        return site === 'YDD_SHARED' || site === 'YDD2' || site === 'YDD4';
      }
      return false;
    });
    
    console.log(`[MULTISITE] Found ${siteAssociates.length} associates for site ${siteCode} in database`);
    
    // Clear badges that don't belong to the current site
    Object.keys(STATE.badges).forEach(badgeId => {
      const badge = STATE.badges[badgeId];
      const belongsToCurrentSite = this.badgeBelongsToSite(badge, siteCode);
      if (!belongsToCurrentSite) {
        // Hide badges that don't belong to this site
        badge.hidden = true;
        console.log(`[MULTISITE] Hiding badge ${badgeId} (${badge.site}) - doesn't belong to ${siteCode}`);
      }
    });
    
    // Create badges for the associates
    siteAssociates.forEach(associate => {
      const badgeId = `b_${associate['Employee ID'] || associate.ID || associate.EID}`;
      
      // Create or update badge for this associate
      if (!STATE.badges[badgeId]) {
        STATE.badges[badgeId] = {
          id: badgeId,
          name: associate['Employee Name'] || associate.Name || 'Unknown',
          eid: associate['Employee ID'] || associate.ID || associate.EID || '',
          scode: shiftCodeOf(associate['Shift Pattern'] || associate.ShiftCode || ''),
          site: classifySite(associate),
          present: true,
          loc: 'unassigned'
        };
        console.log(`[MULTISITE] Created badge for ${badgeId} (${STATE.badges[badgeId].name})`);
      } else {
        // Badge exists - make sure it's visible and belongs to current site
        STATE.badges[badgeId].hidden = false;
        console.log(`[MULTISITE] Showing existing badge ${badgeId} (${STATE.badges[badgeId].name}) for ${siteCode}`);
      }
    });
    
    console.log(`[MULTISITE] Database load complete for ${siteCode}. Total badges: ${Object.keys(STATE.badges).length}`);
  },
  
  // Switch to a different site view
  switchToSite: function(siteCode) {
    const STATE = window.STATE;
    const DATABASE = window.DATABASE;
    const ANALYTICS = window.ANALYTICS;
    const renderAllBadges = window.renderAllBadges;
    const renderHeadcountOverview = window.renderHeadcountOverview;

    if (!STATE.sites[siteCode]) {
      console.warn('[MULTISITE] Unknown site:', siteCode);
      return false;
    }
    
    // Save current site assignments before switching (for site-specific assignments)
    this.saveCurrentSiteAssignments();
    
    // Update current site
    const oldSite = STATE.currentSite;
    STATE.currentSite = siteCode;
    console.log(`[MULTISITE] Updated STATE.currentSite from ${oldSite} to ${siteCode}`);
    
    // Clear current tile displays
    this.clearAllTiles();
    
    // Load associates from database for the new site
    console.log(`[MULTISITE] Loading associates from database for site: ${siteCode}`);
    this.loadAssociatesFromDatabase(siteCode);
    
    // Apply site filtering without changing assignments - preserve ALL assignments
    Object.values(STATE.badges).forEach(badge => {
      const belongsToCurrentSite = this.badgeBelongsToSite(badge, siteCode);
      if (!belongsToCurrentSite) {
        // Badge doesn't belong to this site - hide it but preserve its assignment
        badge.hidden = true;
      } else {
        // Badge belongs to this site - show it
        badge.hidden = false;
        
        // For YDD2/YDD4: Use site-specific assignments
        // For other sites: Keep existing assignments
        if ((siteCode === 'YDD2' || siteCode === 'YDD4') && STATE.sites[siteCode].assignments[badge.id]) {
          badge.loc = STATE.sites[siteCode].assignments[badge.id];
        } else if (siteCode !== 'YDD2' && siteCode !== 'YDD4') {
          // For non-YDD sites, preserve the existing assignment
          // badge.loc stays as is
        } else if ((siteCode === 'YDD2' || siteCode === 'YDD4') && !STATE.sites[siteCode].assignments[badge.id]) {
          // YDD2/YDD4 badge with no assignment in current site - show as unassigned
          badge.loc = 'unassigned';
        }
      }
    });
    
    // Update header display
    const headerSelector = document.getElementById('headerSiteSelector');
    if (headerSelector) headerSelector.value = siteCode;
    
    // Update form site selector to match
    const formSelector = document.getElementById('site');
    if (formSelector) formSelector.value = siteCode;
    
    // Update site display
    const elSite = document.getElementById('displaySite');
    if (elSite) elSite.textContent = siteCode;
    
    // Update unassigned section header with site code
    const unassignedSiteLabel = document.getElementById('unassignedSiteLabel');
    if (unassignedSiteLabel) {
      unassignedSiteLabel.textContent = `${siteCode} Unassigned`;
    }
    
    // Re-render all badges (unassigned + site assignments)
    if (typeof renderAllBadges === 'function') renderAllBadges();
    // Update roster overview/filters after site change
    try{ if (typeof renderHeadcountOverview === 'function') renderHeadcountOverview(); }catch(_){ }
    
    // Save complete state to ensure all assignments persist across refreshes
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
      console.log('[SITE-SWITCH] Saved complete state after site switch');
    } catch (saveError) {
      console.warn('[SITE-SWITCH] Failed to save complete state:', saveError);
    }
    
    console.log(`[MULTISITE] Switched from ${oldSite} to ${siteCode}`);
    
    // Update database status display
    if (DATABASE) {
      DATABASE.updateStatus();
    }
    
    // Log the site switch
    if (ANALYTICS) {
      ANALYTICS.logAssignment(null, `Site Switch: ${oldSite}`, `Site Switch: ${siteCode}`);
    }
    
    return true;
  },
  
  // Save current assignments to the current site
  saveCurrentSiteAssignments: function() {
    const STATE = window.STATE;
    const currentSite = STATE.currentSite;
    if (!STATE.sites[currentSite]) return;
    
    // Clear existing assignments for this site
    STATE.sites[currentSite].assignments = {};
    
    // Save only assignments for badges that belong to current site AND are currently visible
    Object.values(STATE.badges).forEach(badge => {
      if (badge.loc !== 'unassigned' && 
          badge.loc !== 'hidden' && 
          badge.loc !== 'assigned-elsewhere' &&
          this.badgeBelongsToSite(badge, currentSite)) {
        STATE.sites[currentSite].assignments[badge.id] = badge.loc;
        
        // Special debugging for YDD4 saves
        if (currentSite === 'YDD4') {
          console.log(`[YDD4-SAVE] Saving ${badge.name} → ${badge.loc} to YDD4 assignments`);
        }
      }
    });
    
    console.log(`[MULTISITE] Saved ${Object.keys(STATE.sites[currentSite].assignments).length} assignments for ${currentSite}`);
    
    // Special debugging for YDD4 saves
    if (currentSite === 'YDD4') {
      console.log(`[YDD4-SAVE] Final YDD4 assignments:`, STATE.sites[currentSite].assignments);
    }
  },
  
  // Check if a badge belongs to the current site based on classification
  badgeBelongsToSite: function(badge, targetSite) {
    const badgeSite = badge.site; // This is the classified site from when badge was created
    
    // YHM2 is separate - only YHM2 badges show in YHM2  
    if (targetSite === 'YHM2') {
      return badgeSite === 'YHM2';
    }
    
    // YDD2 and YDD4 share the same associate pool (YDD_SHARED badges can appear in both)
    // but have separate assignments
    if (targetSite === 'YDD2' || targetSite === 'YDD4') {
      return badgeSite === 'YDD2' || badgeSite === 'YDD4' || badgeSite === 'YDD_SHARED';
    }
    
    // Exact match for other sites
    return badgeSite === targetSite;
  },
  
  // Load assignments for a specific site with proper badge filtering
  loadSiteAssignments: function(siteCode) {
    const STATE = window.STATE;
    if (!STATE.sites[siteCode]) return;
    
    // Suppress analytics during internal site loading
    const oldSuppressFlag = STATE.suppressAnalytics;
    STATE.suppressAnalytics = true;
    
    const siteAssignments = STATE.sites[siteCode].assignments || {};
    
    // Filter and set badge states based on site classification
    let visibleBadges = 0;
    let hiddenBadges = 0;
    let restoredAssignments = 0;
    
    Object.values(STATE.badges).forEach(badge => {
      const belongsToCurrentSite = this.badgeBelongsToSite(badge, siteCode);
      
      if (!belongsToCurrentSite) {
        // Badge doesn't belong to this site - hide it completely
        badge.loc = 'hidden';
        hiddenBadges++;
        return;
      }
      
      visibleBadges++;
      
      // Badge belongs to this site - preserve existing assignment if it exists
      const savedAssignmentLocation = badge.loc; // This is the assignment from saved state
      const isAssignedInCurrentSite = siteAssignments[badge.id];
      const isAssignedInOtherSites = Object.keys(STATE.sites).some(otherSite => 
        otherSite !== siteCode && 
        STATE.sites[otherSite].assignments && 
        STATE.sites[otherSite].assignments[badge.id]
      );
      
      // For YDD2/YDD4 sites: use site-specific assignments only
      // For other sites: prefer saved badge location if it's a valid process assignment
      if ((siteCode === 'YDD2' || siteCode === 'YDD4') && isAssignedInCurrentSite) {
        // YDD2/YDD4: Use site-specific assignment data only
        badge.loc = siteAssignments[badge.id];
        restoredAssignments++;
      } else if ((siteCode === 'YDD2' || siteCode === 'YDD4') && !isAssignedInCurrentSite) {
        // YDD2/YDD4: No assignment for this site - show as unassigned
        badge.loc = 'unassigned';
      } else if (savedAssignmentLocation && 
          savedAssignmentLocation !== 'unassigned' && 
          savedAssignmentLocation !== 'assigned-elsewhere' && 
          savedAssignmentLocation !== 'hidden') {
        // Other sites: Keep the saved assignment
        badge.loc = savedAssignmentLocation;
        restoredAssignments++;
      } else if (isAssignedInCurrentSite) {
        // Other sites: Use site assignment data
        badge.loc = siteAssignments[badge.id];
        restoredAssignments++;
      } else if (isAssignedInOtherSites) {
        // Assigned in another site but belongs to current site - show as assigned elsewhere
        badge.loc = 'assigned-elsewhere';
      } else {
        // Not assigned anywhere - show as unassigned
        badge.loc = 'unassigned';
      }
    });
    
    // Restore previous suppress flag
    STATE.suppressAnalytics = oldSuppressFlag;
    
    console.log(`[MULTISITE] Loaded site ${siteCode}: ${visibleBadges} visible badges, ${hiddenBadges} hidden, ${restoredAssignments} assignments restored`);
  },
  
  // Clear all tile displays
  clearAllTiles: function() {
    const tileBadgeLayers = window.tileBadgeLayers;
    if (tileBadgeLayers) {
      Object.values(tileBadgeLayers).forEach(layer => {
        if (layer) layer.innerHTML = '';
      });
    }
  },
  
  // Move badge between sites
  moveBadgeToSite: function(badgeId, targetSite, targetLocation) {
    const STATE = window.STATE;
    const badge = STATE.badges[badgeId];
    if (!badge || !STATE.sites[targetSite]) return false;
    
    // Remove from current site assignments
    Object.keys(STATE.sites).forEach(siteCode => {
      delete STATE.sites[siteCode].assignments[badgeId];
    });
    
    // Add to target site
    STATE.sites[targetSite].assignments[badgeId] = targetLocation;
    
    // If target site is current site, update badge location
    if (targetSite === STATE.currentSite) {
      badge.loc = targetLocation;
    }
    
    console.log(`[MULTISITE] Moved badge ${badgeId} to ${targetSite}/${targetLocation}`);
    return true;
  },
  
  // Sync current badge locations to multi-site assignments
  syncCurrentAssignments: function() {
    const STATE = window.STATE;
    console.log('[MULTISITE] Syncing current badge locations to multi-site system...');
    
    // Clear all existing assignments
    Object.keys(STATE.sites).forEach(siteCode => {
      STATE.sites[siteCode].assignments = {};
    });
    
    // Rebuild assignments from current badge locations
    Object.values(STATE.badges).forEach(badge => {
      if (badge.loc && badge.loc !== 'unassigned' && badge.loc !== 'assigned-elsewhere') {
        // Assign to current site
        const currentSite = STATE.currentSite;
        STATE.sites[currentSite].assignments[badge.id] = badge.loc;
        console.log(`[MULTISITE] Synced: ${badge.name} -> ${currentSite}/${badge.loc}`);
      }
    });
    
    console.log('[MULTISITE] Sync complete. STATE.sites:', STATE.sites);
  },
  
  // Get which site a badge is currently assigned to
  getBadgeAssignmentSite: function(badgeId) {
    const STATE = window.STATE;
    for (const [siteCode, siteData] of Object.entries(STATE.sites)) {
      if (siteData.assignments && siteData.assignments[badgeId]) {
        return siteCode;
      }
    }
    return null; // Not assigned to any site
  },
  
  // Get current assignment info for a badge
  getBadgeAssignmentInfo: function(badgeId) {
    const STATE = window.STATE;
    for (const [siteCode, siteData] of Object.entries(STATE.sites)) {
      if (siteData.assignments && siteData.assignments[badgeId]) {
        return {
          site: siteCode,
          location: siteData.assignments[badgeId]
        };
      }
    }
    return null; // Not assigned anywhere
  },
  
  // Save current multi-site state to localStorage
  saveToStorage: function() {
    const STATE = window.STATE;
    try {
      const raw = localStorage.getItem('vlab:lastRoster');
      if (raw) {
        const snap = JSON.parse(raw);
        
        // Update multi-site data
        snap.sites = STATE.sites;
        snap.currentSite = STATE.currentSite;
        
        // Update badge states (assignments)
        snap.badges = STATE.badges;
        
        localStorage.setItem('vlab:lastRoster', JSON.stringify(snap));
        
        // Debug: Count assignments being saved
        const assignedCount = Object.values(STATE.badges).filter(b => b.loc !== 'unassigned' && b.loc !== 'assigned-elsewhere').length;
        console.debug('[MULTISITE] Saved multi-site state with', assignedCount, 'assigned badges to localStorage');
        
        // Specific YDD4 debugging
        if (STATE.sites.YDD4) {
          const ydd4AssignmentCount = Object.keys(STATE.sites.YDD4.assignments || {}).length;
          console.log('[YDD4-SAVE] Saved YDD4 assignments:', ydd4AssignmentCount);
          console.log('[YDD4-SAVE] YDD4 assignments data:', STATE.sites.YDD4.assignments);
        }
      } else {
        console.warn('[MULTISITE] No existing roster snapshot found to update');
      }
    } catch(e) {
      console.warn('[MULTISITE] Failed to save to localStorage:', e);
    }
  }
};
