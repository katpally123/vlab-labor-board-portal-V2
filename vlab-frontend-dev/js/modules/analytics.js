// Analytics Module
// Extracted from app.js

window.ANALYTICS = {
  // Track assignment changes
  logAssignment: function(badgeId, fromLoc, toLoc, timestamp = new Date()) {
    const STATE = window.STATE;
    const MULTISITE = window.MULTISITE;
    
    const badge = STATE.badges[badgeId];
    if (!badge) {
      console.warn('[Analytics] No badge found for logAssignment:', badgeId);
      return;
    }
    
    // Ensure current site is synchronized
    if (MULTISITE && typeof MULTISITE.ensureCurrentSiteSync === 'function') {
      MULTISITE.ensureCurrentSiteSync();
    }
    
    // Get the site for this assignment - use current site for new assignments
    let assignmentSite = STATE.currentSite;
    if (toLoc === 'unassigned') {
      // If moving to unassigned, record the site they're being removed from
      if (MULTISITE && typeof MULTISITE.getBadgeAssignmentSite === 'function') {
        assignmentSite = MULTISITE.getBadgeAssignmentSite(badgeId) || STATE.currentSite;
      }
    }
    
    console.log(`[Analytics] Logging assignment: badge=${badgeId}, from=${fromLoc}, to=${toLoc}, site=${assignmentSite}`);
    
    // Fallback if site is still undefined
    if (!assignmentSite || assignmentSite === 'undefined') {
      assignmentSite = 'Unknown';
      console.warn('[Analytics] Site was undefined, using fallback:', assignmentSite);
    }
    
    const logEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: timestamp.toISOString(),
      date: timestamp.toDateString(),
      badgeId: badgeId,
      employeeId: badge.eid,
      employeeName: badge.name,
      shiftCode: badge.scode,
      site: assignmentSite,
      quarter: STATE.currentQuarter || 'Q1',
      fromLocation: fromLoc,
      toLocation: toLoc,
      action: fromLoc === 'unassigned' ? 'assign' : (toLoc === 'unassigned' ? 'unassign' : 'reassign'),
      duration: null, // Will be calculated when assignment ends
      sessionId: this.getCurrentSessionId()
    };
    
    // Check for recent duplicate entries (within last 5 seconds)
    const recent = STATE.analytics.history.filter(entry => {
      const entryTime = new Date(entry.timestamp).getTime();
      const currentTime = timestamp.getTime();
      return (currentTime - entryTime) < 5000 && // within 5 seconds
             entry.badgeId === badgeId && 
             entry.employeeId === badge.eid &&
             entry.toLocation === toLoc &&
             entry.site === assignmentSite;
    });
    
    // Only add if not a recent duplicate
    if (recent.length === 0) {
      STATE.analytics.history.push(logEntry);
    } else {
      console.log('[Analytics] Skipping duplicate log entry for', badge.name, toLoc);
    }
    this.updatePerformanceMetrics(badge.eid, logEntry);
    this.saveAnalyticsData();
    console.debug('[Analytics] Logged assignment:', logEntry);
  },

  // Track work sessions (full shifts)
  startSession: function(metadata = {}) {
    const STATE = window.STATE;
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session = {
      id: sessionId,
      startTime: new Date().toISOString(),
      endTime: null,
      date: metadata.date || new Date().toDateString(),
      shift: metadata.shift || 'day',
      site: metadata.site || 'Other',
      plannedHC: metadata.plannedHC || 0,
      actualHC: 0,
      assignments: 0,
      reassignments: 0,
      efficiency: null,
      notes: metadata.notes || ''
    };
    
    STATE.analytics.sessions.push(session);
    this.currentSessionId = sessionId;
    this.saveAnalyticsData();
    console.debug('[Analytics] Started session:', session);
    return sessionId;
  },

  // End current work session
  endSession: function() {
    const STATE = window.STATE;
    if (!this.currentSessionId) return;
    
    const session = STATE.analytics.sessions.find(s => s.id === this.currentSessionId);
    if (!session) return;
    
    session.endTime = new Date().toISOString();
    session.actualHC = Object.values(STATE.badges).filter(b => b.loc !== 'unassigned').length;
    
    // Calculate session metrics
    const sessionHistory = STATE.analytics.history.filter(h => h.sessionId === this.currentSessionId);
    session.assignments = sessionHistory.filter(h => h.action === 'assign').length;
    session.reassignments = sessionHistory.filter(h => h.action === 'reassign').length;
    session.efficiency = session.plannedHC > 0 ? (session.actualHC / session.plannedHC * 100).toFixed(2) : 0;
    
    this.saveAnalyticsData();
    console.debug('[Analytics] Ended session:', session);
    this.currentSessionId = null;
  },

  getCurrentSessionId: function() {
    return this.currentSessionId || null;
  },

  // Update employee performance metrics
  updatePerformanceMetrics: function(employeeId, logEntry) {
    const STATE = window.STATE;
    if (!employeeId || !logEntry) return;
    
    if (!STATE.analytics.performance[employeeId]) {
      STATE.analytics.performance[employeeId] = {
        employeeId: employeeId,
        name: logEntry.employeeName,
        totalAssignments: 0,
        processExperience: {}, // Track which processes they've worked
        shiftPreference: {}, // Track shift performance
        avgAssignmentDuration: 0,
        performanceScore: 0,
        reliability: 0,
        versatility: 0,
        lastActive: null,
        weeklyStats: {}, // Track performance by week
        productivityTrends: [], // Track assignment frequency over time
        collaborationScore: 0, // How well they work in teams
        adaptabilityScore: 0, // How quickly they learn new processes
        consistencyScore: 0, // How consistent their performance is
        peakPerformanceHours: {}, // Best performance times
        trainingNeeds: [], // Identified skills gaps
        strengths: [] // Identified strengths
      };
    }
    
    const metrics = STATE.analytics.performance[employeeId];
    metrics.totalAssignments++;
    metrics.lastActive = logEntry.timestamp;
    
    // Track process experience and calculate proficiency
    if (logEntry.toLocation && logEntry.toLocation !== 'unassigned') {
      if (!metrics.processExperience[logEntry.toLocation]) {
        metrics.processExperience[logEntry.toLocation] = 0;
      }
      metrics.processExperience[logEntry.toLocation]++;
      
      // Update process proficiency levels
      const assignments = metrics.processExperience[logEntry.toLocation];
      let proficiencyLevel = 'Beginner';
      if (assignments >= 20) proficiencyLevel = 'Expert';
      else if (assignments >= 10) proficiencyLevel = 'Intermediate';
      else if (assignments >= 5) proficiencyLevel = 'Competent';
      
      // Track strengths (processes with high proficiency)
      if (proficiencyLevel === 'Expert' && !metrics.strengths.includes(logEntry.toLocation)) {
        metrics.strengths.push(logEntry.toLocation);
      }
    }
    
    // Track shift patterns and peak hours
    if (logEntry.shiftCode) {
      if (!metrics.shiftPreference[logEntry.shiftCode]) {
        metrics.shiftPreference[logEntry.shiftCode] = 0;
      }
      metrics.shiftPreference[logEntry.shiftCode]++;
      
      // Track peak performance hours
      const hour = new Date(logEntry.timestamp).getHours();
      if (!metrics.peakPerformanceHours[hour]) {
        metrics.peakPerformanceHours[hour] = 0;
      }
      metrics.peakPerformanceHours[hour]++;
    }
    
    // Update weekly statistics
    const weekKey = this.getWeekKey(new Date(logEntry.timestamp));
    if (!metrics.weeklyStats[weekKey]) {
      metrics.weeklyStats[weekKey] = {
        assignments: 0,
        processes: new Set(),
        efficiency: 0,
        reliability: 0
      };
    }
    
    // Ensure processes is always a Set (fix for deserialization issues)
    if (!(metrics.weeklyStats[weekKey].processes instanceof Set)) {
      const existingProcesses = metrics.weeklyStats[weekKey].processes || [];
      metrics.weeklyStats[weekKey].processes = new Set(Array.isArray(existingProcesses) ? existingProcesses : Object.keys(existingProcesses));
    }
    
    metrics.weeklyStats[weekKey].assignments++;
    if (logEntry.toLocation !== 'unassigned') {
      metrics.weeklyStats[weekKey].processes.add(logEntry.toLocation);
    }
    
    // Calculate dynamic scores
    metrics.versatility = Object.keys(metrics.processExperience).length;
    metrics.adaptabilityScore = this.calculateAdaptabilityScore(metrics);
    metrics.consistencyScore = this.calculateConsistencyScore(metrics);
    metrics.collaborationScore = this.calculateCollaborationScore(employeeId);
    
    // Enhanced performance score calculation
    metrics.performanceScore = Math.min(100, 
      (metrics.totalAssignments * 1.5) + 
      (metrics.versatility * 8) + 
      (metrics.reliability * 12) +
      (metrics.adaptabilityScore * 0.2) +
      (metrics.consistencyScore * 0.15) +
      (metrics.collaborationScore * 0.1)
    );
    
    // Identify training needs based on low-experience processes
    metrics.trainingNeeds = this.identifyTrainingNeeds(metrics);
    
    // Track productivity trends
    metrics.productivityTrends.push({
      timestamp: logEntry.timestamp,
      assignments: metrics.totalAssignments,
      score: metrics.performanceScore
    });
    
    // Keep only last 30 productivity data points
    if (metrics.productivityTrends.length > 30) {
      metrics.productivityTrends = metrics.productivityTrends.slice(-30);
    }
  },

  // Calculate adaptability score based on learning curve
  calculateAdaptabilityScore: function(metrics) {
    const processes = Object.entries(metrics.processExperience);
    if (processes.length === 0) return 0;
    
    let adaptabilitySum = 0;
    processes.forEach(([process, count]) => {
      // Higher score for quickly ramping up in new processes
      if (count <= 5) adaptabilitySum += count * 20; // Early learning bonus
      else adaptabilitySum += 100; // Full competency reached
    });
    
    return Math.min(100, adaptabilitySum / processes.length);
  },

  // Calculate consistency score based on assignment patterns
  calculateConsistencyScore: function(metrics) {
    const trends = metrics.productivityTrends;
    if (trends.length < 5) return 50; // Default for insufficient data
    
    // Calculate variance in performance
    const scores = trends.map(t => t.score);
    const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) / scores.length;
    
    // Lower variance = higher consistency
    return Math.max(0, 100 - variance);
  },

  // Calculate collaboration score based on team assignments
  calculateCollaborationScore: function(employeeId) {
    const STATE = window.STATE;
    // Calculate based on how often they work alongside others in same processes
    const employeeHistory = STATE.analytics.history.filter(h => h.employeeId === employeeId);
    let collaborationEvents = 0;
    
    employeeHistory.forEach(entry => {
      // Count assignments to processes where others are also assigned
      const sameTimeAssignments = STATE.analytics.history.filter(h => 
        h.toLocation === entry.toLocation && 
        Math.abs(new Date(h.timestamp) - new Date(entry.timestamp)) < 60000 && // Within 1 minute
        h.employeeId !== employeeId
      );
      collaborationEvents += sameTimeAssignments.length;
    });
    
    return Math.min(100, collaborationEvents * 5); // Scale to 0-100
  },

  // Identify training needs based on process gaps
  identifyTrainingNeeds: function(metrics) {
    const allProcesses = ['cb', 'ibws', 'lineloaders', 'trickle', 'dm', 'idrt', 'pb', 'e2s', 'dockws', 'e2sws', 'tpb', 'tws', 'sap', 'ao5s', 'pa', 'ps', 'laborshare'];
    const experienced = Object.keys(metrics.processExperience);
    const gaps = allProcesses.filter(process => !experienced.includes(process));
    
    return gaps.slice(0, 3); // Return top 3 training opportunities
  },

  // Get week key for grouping statistics
  getWeekKey: function(date) {
    const year = date.getFullYear();
    const week = Math.ceil((date - new Date(year, 0, 1)) / (7 * 24 * 60 * 60 * 1000));
    return `${year}-W${week}`;
  },

  // Save analytics data to localStorage
  saveAnalyticsData: function() {
    const STATE = window.STATE;
    try {
      // Create a deep copy and convert Set objects to arrays for serialization
      const analyticsToSave = JSON.parse(JSON.stringify(STATE.analytics, (key, value) => {
        if (value instanceof Set) {
          return Array.from(value);
        }
        return value;
      }));
      
      localStorage.setItem('vlab:analytics', JSON.stringify(analyticsToSave));
      console.debug('[Analytics] Saved analytics data to localStorage');
    } catch (error) {
      console.warn('[Analytics] Failed to save analytics data:', error);
    }
  },

  // Load analytics data from localStorage
  loadAnalyticsData: function() {
    const STATE = window.STATE;
    try {
      const data = localStorage.getItem('vlab:analytics');
      if (data) {
        const parsed = JSON.parse(data);
        STATE.analytics = {
          history: parsed.history || [],
          sessions: parsed.sessions || [],
          performance: parsed.performance || {},
          patterns: parsed.patterns || {}
        };
        
        // Fix Set objects that were serialized as arrays/objects
        Object.values(STATE.analytics.performance).forEach(perf => {
          if (perf.weeklyStats) {
            Object.values(perf.weeklyStats).forEach(weekStat => {
              if (weekStat.processes && !(weekStat.processes instanceof Set)) {
                // Convert back to Set if it was serialized as array or object
                weekStat.processes = new Set(Array.isArray(weekStat.processes) ? weekStat.processes : Object.keys(weekStat.processes));
              }
            });
          }
        });
        
        console.debug('[Analytics] Loaded analytics data from localStorage');
      }
    } catch (error) {
      console.warn('[Analytics] Failed to load analytics data:', error);
      STATE.analytics = {
        history: [],
        sessions: [],
        performance: {},
        patterns: {}
      };
    }
  },

  // Enhanced assignment recommendations with AI-like scoring
  getRecommendations: function(processPath, requirements = {}) {
    const STATE = window.STATE;
    const recommendations = [];
    const employees = Object.values(STATE.analytics.performance);
    const currentAssignments = Object.values(STATE.badges).filter(b => b.loc === processPath);
    
    employees.forEach(emp => {
      // Skip if employee is already assigned to this process
      if (currentAssignments.some(badge => badge.eid === emp.employeeId)) {
        return;
      }
      
      let score = 0;
      let reasoning = [];
      
      // 1. Process Experience (30% weight)
      const processExp = emp.processExperience[processPath] || 0;
      const experienceScore = Math.min(30, processExp * 3);
      score += experienceScore;
      
      if (processExp >= 10) reasoning.push('Highly experienced');
      else if (processExp >= 5) reasoning.push('Experienced');
      else if (processExp > 0) reasoning.push('Some experience');
      else reasoning.push('Cross-training opportunity');
      
      // 2. Performance Score (25% weight)
      const performanceWeight = (emp.performanceScore / 100) * 25;
      score += performanceWeight;
      
      if (emp.performanceScore >= 85) reasoning.push('Top performer');
      else if (emp.performanceScore >= 70) reasoning.push('Strong performer');
      
      // 3. Versatility and Adaptability (20% weight)
      const versatilityScore = Math.min(20, emp.versatility * 2);
      const adaptabilityScore = (emp.adaptabilityScore / 100) * 10;
      score += versatilityScore + adaptabilityScore;
      
      if (emp.versatility >= 8) reasoning.push('Highly versatile');
      if (emp.adaptabilityScore >= 80) reasoning.push('Quick learner');
      
      // 4. Recent Activity and Availability (15% weight)
      if (emp.lastActive) {
        const daysSinceActive = (new Date() - new Date(emp.lastActive)) / (1000 * 60 * 60 * 24);
        if (daysSinceActive < 1) score += 15; // Very recent
        else if (daysSinceActive < 7) score += 10;
        else if (daysSinceActive < 30) score += 5;
        
        if (daysSinceActive < 7) reasoning.push('Recently active');
      }
      
      // 5. Consistency and Reliability (10% weight)
      const consistencyScore = (emp.consistencyScore / 100) * 10;
      score += consistencyScore;
      
      if (emp.consistencyScore >= 80) reasoning.push('Highly consistent');
      
      // 6. Workload Balance Adjustment
      const currentLoad = Object.values(STATE.badges).filter(b => b.eid === emp.employeeId && b.loc !== 'unassigned').length;
      if (currentLoad === 0) score += 10; // Bonus for unassigned employees
      else if (currentLoad >= 2) score -= 5; // Penalty for overloaded employees
      
      if (currentLoad === 0) reasoning.push('Available');
      else if (currentLoad >= 2) reasoning.push('Currently busy');
      
      // 7. Time-based Performance Patterns
      const currentHour = new Date().getHours();
      const hourlyPerformance = emp.peakPerformanceHours[currentHour] || 0;
      if (hourlyPerformance > 0) {
        score += Math.min(5, hourlyPerformance * 0.5);
        reasoning.push('Peak performance time');
      }
      
      // 8. Team Synergy (if requirements specify team needs)
      if (requirements.teamSynergy && emp.collaborationScore >= 70) {
        score += 8;
        reasoning.push('Strong team player');
      }
      
      // 9. Skill Gap Analysis
      if (requirements.skillDevelopment && emp.trainingNeeds.includes(processPath)) {
        score += 12; // Bonus for addressing skill gaps
        reasoning.push('Skill development opportunity');
      }
      
      // 10. Fair Rotation Bonus
      if (this.ROTATION && emp.employeeId) {
        const rotationScore = this.ROTATION.calculateRotationScore(emp.employeeId);
        const processExp = emp.processExperience[processPath] || 0;
        
        // Bonus for employees with poor rotation who need variety
        if (rotationScore.status === 'poor' && processExp < 3) {
          score += 15;
          reasoning.push('Rotation fairness priority');
        } else if (rotationScore.status === 'needs_improvement' && processExp === 0) {
          score += 8;
          reasoning.push('Improve rotation variety');
        }
        
        // Slight penalty for employees with excellent rotation in processes they know well
        if (rotationScore.status === 'excellent' && processExp > 10) {
          score -= 3;
          reasoning.push('Consider rotation balance');
        }
      }
      
      // 11. Shift Preference Alignment
      const badge = Object.values(STATE.badges).find(b => b.eid === emp.employeeId);
      if (badge && badge.scode) {
        const shiftType = badge.scode.toUpperCase().startsWith('N') ? 'night' : 'day';
        const preferenceCount = emp.shiftPreference[badge.scode] || 0;
        if (preferenceCount > 5) {
          score += 5;
          reasoning.push('Preferred shift pattern');
        }
      }
      
      // Calculate confidence level
      let confidence = 'Low';
      if (score >= 80) confidence = 'Very High';
      else if (score >= 65) confidence = 'High';
      else if (score >= 45) confidence = 'Medium';
      
      // Risk assessment
      let riskLevel = 'Low';
      if (processExp === 0 && emp.adaptabilityScore < 50) riskLevel = 'High';
      else if (processExp < 3) riskLevel = 'Medium';
      
      recommendations.push({
        employeeId: emp.employeeId,
        name: emp.name,
        score: Math.round(score * 10) / 10, // Round to 1 decimal
        processExp: processExp,
        versatility: emp.versatility,
        confidence: confidence,
        riskLevel: riskLevel,
        reasoning: reasoning.slice(0, 3), // Top 3 reasons
        fullReason: reasoning.join(', '),
        performanceScore: emp.performanceScore,
        currentLoad: currentLoad,
        adaptabilityScore: emp.adaptabilityScore,
        consistencyScore: emp.consistencyScore
      });
    });
    
    // Sort by score and return top recommendations
    const sortedRecommendations = recommendations.sort((a, b) => b.score - a.score);
    
    // Add ranking information
    sortedRecommendations.forEach((rec, index) => {
      rec.rank = index + 1;
      rec.percentile = ((sortedRecommendations.length - index) / sortedRecommendations.length * 100).toFixed(0);
    });
    
    return sortedRecommendations.slice(0, 10); // Return top 10 recommendations
  },

  // Get bulk assignment recommendations for multiple processes
  getBulkRecommendations: function(processList, requirements = {}) {
    const STATE = window.STATE;
    const bulkRecommendations = {};
    const usedEmployees = new Set();
    
    // Prioritize processes by current need (fewer assigned employees = higher priority)
    const processNeeds = processList.map(process => ({
      process,
      currentCount: Object.values(STATE.badges).filter(b => b.loc === process).length,
      targetCount: requirements.targets ? requirements.targets[process] : 3
    })).sort((a, b) => (a.currentCount - a.targetCount) - (b.currentCount - b.targetCount));
    
    processNeeds.forEach(({ process, targetCount, currentCount }) => {
      const needed = Math.max(0, targetCount - currentCount);
      if (needed > 0) {
        // Get recommendations excluding already used employees
        const availableEmployees = Object.values(STATE.analytics.performance)
          .filter(emp => !usedEmployees.has(emp.employeeId));
        
        const processRecommendations = this.getRecommendations(process, requirements)
          .filter(rec => !usedEmployees.has(rec.employeeId))
          .slice(0, needed);
        
        bulkRecommendations[process] = processRecommendations;
        
        // Mark top recommendations as used to avoid conflicts
        processRecommendations.slice(0, Math.min(needed, 2)).forEach(rec => {
          usedEmployees.add(rec.employeeId);
        });
      }
    });
    
    return bulkRecommendations;
  },

  // Analyze assignment optimization opportunities
  getOptimizationSuggestions: function() {
    const STATE = window.STATE;
    const suggestions = [];
    const currentAssignments = {};
    
    // Group current assignments by location
    Object.values(STATE.badges).forEach(badge => {
      if (badge.loc && badge.loc !== 'unassigned') {
        if (!currentAssignments[badge.loc]) {
          currentAssignments[badge.loc] = [];
        }
        currentAssignments[badge.loc].push(badge);
      }
    });
    
    // Analyze each process for optimization opportunities
    Object.entries(currentAssignments).forEach(([process, badges]) => {
      badges.forEach(badge => {
        const empPerformance = STATE.analytics.performance[badge.eid];
        if (!empPerformance) return;
        
        const processExp = empPerformance.processExperience[process] || 0;
        const recommendations = this.getRecommendations(process);
        const currentEmployeeRank = recommendations.findIndex(rec => rec.employeeId === badge.eid) + 1;
        
        // Suggest optimization if current employee is not in top 3 recommendations
        if (currentEmployeeRank > 3 && recommendations[0] && recommendations[0].score > 60) {
          suggestions.push({
            type: 'reassignment',
            priority: currentEmployeeRank > 5 ? 'high' : 'medium',
            process: process,
            currentEmployee: badge.name,
            suggestedEmployee: recommendations[0].name,
            reason: `${recommendations[0].name} would be ${(recommendations[0].score - (empPerformance.performanceScore || 0)).toFixed(1)} points better for ${process}`,
            confidenceGain: recommendations[0].confidence,
            riskReduction: recommendations[0].riskLevel === 'Low' ? 'Yes' : 'No'
          });
        }
      });
    });
    
    // Suggest assignments for unassigned high performers
    const unassigned = Object.values(STATE.badges).filter(b => b.loc === 'unassigned');
    const highPerformers = unassigned.filter(badge => {
      const emp = STATE.analytics.performance[badge.eid];
      return emp && emp.performanceScore >= 75;
    });
    
    highPerformers.forEach(badge => {
      const emp = STATE.analytics.performance[badge.eid];
      const bestProcesses = Object.entries(emp.processExperience)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      if (bestProcesses.length > 0) {
        suggestions.push({
          type: 'assignment',
          priority: 'medium',
          employee: badge.name,
          suggestedProcess: bestProcesses[0][0],
          reason: `High performer with ${bestProcesses[0][1]} assignments in ${bestProcesses[0][0]}`,
          expectedImpact: 'Increase process efficiency'
        });
      }
    });
    
    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    }).slice(0, 8); // Return top 8 suggestions
  },

  currentSessionId: null,

  /* ═══════════════════════════════════════════════════════════════════════════
   * 🔄 FAIR ROTATION SYSTEM - Amazon-Style Assignment Fairness Engine
   * ═══════════════════════════════════════════════════════════════════════════ */
  
  ROTATION: {
    // Core rotation scoring engine - calculates priority for each associate-path pair
    calculateEnhancedRotationScore: function(employeeId, processPath) {
      const STATE = window.STATE;
      const emp = STATE.analytics.performance[employeeId];
      if (!emp) return { priorityScore: 0, details: {} };
      
      const now = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;
      
      // Get all assignments for this employee to this specific path
      const pathHistory = STATE.analytics.history.filter(h => 
        h.employeeId === employeeId && 
        h.toLocation === processPath &&
        h.action !== 'unassign'
      );
      
      // 1️⃣ RECENCY PENALTY - penalizes recent assignments
      let recencyPenalty = 0;
      if (pathHistory.length > 0) {
        const lastAssignment = pathHistory[pathHistory.length - 1];
        const daysSinceLastAssignment = Math.max(1, (now - new Date(lastAssignment.timestamp).getTime()) / DAY_MS);
        recencyPenalty = 1 / daysSinceLastAssignment;
        
        // Special Rule: No same path 2 days in a row (+5 huge penalty)
        if (daysSinceLastAssignment < 1.5) {
          recencyPenalty += 5;
        }
      }
      
      // 2️⃣ FREQUENCY PENALTY - penalizes over-assignment in recent window
      const LOOKBACK_DAYS = 14;
      const cutoffTime = now - (LOOKBACK_DAYS * DAY_MS);
      const recentAssignments = pathHistory.filter(h => new Date(h.timestamp).getTime() >= cutoffTime);
      const frequencyPenalty = recentAssignments.length * 0.5;
      
      // Weekly cap rule: >3 times in 7 days adds extra penalty
      const WEEK_LOOKBACK = 7;
      const weekCutoff = now - (WEEK_LOOKBACK * DAY_MS);
      const weeklyCount = pathHistory.filter(h => new Date(h.timestamp).getTime() >= weekCutoff).length;
      let weeklyCapPenalty = 0;
      if (weeklyCount >= 3) {
        weeklyCapPenalty = 5;
      }
      
      // 3️⃣ GAP BONUS - rewards long absence from path
      let gapBonus = 0;
      if (pathHistory.length > 0) {
        const lastAssignment = pathHistory[pathHistory.length - 1];
        const daysSinceLastAssignment = (now - new Date(lastAssignment.timestamp).getTime()) / DAY_MS;
        gapBonus = Math.log(1 + daysSinceLastAssignment);
      } else {
        // Never assigned to this path - huge bonus
        gapBonus = Math.log(1 + 30); // Equivalent to 30 days gap
      }
      
      // 4️⃣ NEW ASSOCIATE BOOST - cross-training priority
      const totalAssignments = emp.totalAssignments || 0;
      let newHireBoost = 0;
      if (totalAssignments < 10 && !pathHistory.length) {
        newHireBoost = 3; // Boost for untrained paths
      }
      
      // 5️⃣ SKILL CERTIFICATION (optional - can be enhanced with actual cert data)
      // For now, we'll use experience as proxy
      let skillBonus = 0;
      const pathExp = emp.processExperience[processPath] || 0;
      if (pathExp > 0 && pathExp < 5) {
        // Certified but under-used - bonus
        skillBonus = 1;
      }
      
      // FINAL PRIORITY SCORE (higher = assign first)
      const priorityScore = (gapBonus + newHireBoost + skillBonus) - (recencyPenalty + frequencyPenalty + weeklyCapPenalty);
      
      return {
        priorityScore: priorityScore,
        details: {
          recencyPenalty: recencyPenalty.toFixed(2),
          frequencyPenalty: frequencyPenalty.toFixed(2),
          weeklyCapPenalty: weeklyCapPenalty.toFixed(2),
          gapBonus: gapBonus.toFixed(2),
          newHireBoost: newHireBoost,
          skillBonus: skillBonus,
          daysSinceLast: pathHistory.length ? Math.round((now - new Date(pathHistory[pathHistory.length - 1].timestamp).getTime()) / DAY_MS) : 'Never',
          recentCount14d: recentAssignments.length,
          weeklyCount: weeklyCount,
          totalPathAssignments: pathHistory.length
        }
      };
    },
    
    // Get ranked candidates for a specific process path
    getRankedCandidatesForPath: function(processPath, options = {}) {
      const STATE = window.STATE;
      const candidates = [];
      
      // Get all badges eligible for this path
      const allBadges = Object.values(STATE.badges).filter(b => {
        // Filter by site if specified
        if (options.site && b.site !== options.site) return false;
        // Filter by shift if specified
        if (options.shift) {
          // Assuming DAY_SET and NIGHT_SET are available globally or we need to access them differently
          // For now, let's assume they are global or we skip this check if not available
          if (typeof window.DAY_SET !== 'undefined' && typeof window.NIGHT_SET !== 'undefined') {
             const shiftSet = options.shift === 'day' ? window.DAY_SET : window.NIGHT_SET;
             if (!shiftSet.has(b.scode)) return false;
          }
        }
        // Exclude already assigned (unless override)
        if (!options.includeAssigned && b.loc !== 'unassigned') return false;
        return true;
      });
      
      // Calculate priority score for each candidate
      allBadges.forEach(badge => {
        const score = this.calculateEnhancedRotationScore(badge.eid, processPath);
        candidates.push({
          badgeId: badge.id,
              employeeId: badge.eid,
          name: badge.name,
          scode: badge.scode,
          site: badge.site,
          currentLocation: badge.loc,
          priorityScore: score.priorityScore,
          scoreDetails: score.details
        });
      });
      
      // Sort by priority score DESC (highest first)
      candidates.sort((a, b) => b.priorityScore - a.priorityScore);
      
      return candidates;
    },
    
    // Generate rotation recommendations for all paths
    generatePathRecommendations: function(options = {}) {
      const allPaths = ['cb', 'ibws', 'lineloaders', 'trickle', 'dm', 'idrt', 'pb', 'e2s', 'dockws', 'e2sws', 'tpb', 'tws', 'sap', 'ao5s', 'pa', 'ps', 'laborshare'];
      const recommendations = {};
      
      allPaths.forEach(path => {
        const candidates = this.getRankedCandidatesForPath(path, options);
        recommendations[path] = {
          pathName: path.toUpperCase(),
          topCandidates: candidates.slice(0, 10), // Top 10 for each path
          totalEligible: candidates.length
        };
      });
      
      return recommendations;
    },
    
    // Calculate fairness variance for an associate
    calculateFairnessScore: function(employeeId) {
      const STATE = window.STATE;
      const emp = STATE.analytics.performance[employeeId];
      if (!emp) return { fairnessScore: 0, variance: 0, status: 'unknown' };
      
      const processExp = emp.processExperience || {};
      const counts = Object.values(processExp);
      
      if (counts.length === 0) {
        return { fairnessScore: 100, variance: 0, status: 'new', distribution: {} };
      }
      
      // Calculate mean
      const mean = counts.reduce((sum, c) => sum + c, 0) / counts.length;
      
      // Calculate variance
      const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
      
      // Normalize variance to 0-100 scale (lower variance = higher fairness)
      const fairnessScore = Math.max(0, 100 - (variance * 2));
      
      let status = 'balanced';
      if (variance > 20) status = 'unbalanced';
      else if (variance > 10) status = 'needs_attention';
      else if (variance < 3) status = 'excellent';
      
      return {
        fairnessScore: Math.round(fairnessScore),
        variance: variance.toFixed(2),
        status: status,
        distribution: processExp,
        mean: mean.toFixed(1)
      };
    },
    
    // Generate fairness alerts for all associates
    generateFairnessAlerts: function() {
      const STATE = window.STATE;
      const alerts = [];
      
      Object.values(STATE.analytics.performance).forEach(emp => {
        const fairness = this.calculateFairnessScore(emp.employeeId);
        const processExp = emp.processExperience || {};
        
        // Alert: High frequency in one path
        Object.entries(processExp).forEach(([path, count]) => {
          const WEEK_LOOKBACK = 7;
          const weekCutoff = Date.now() - (WEEK_LOOKBACK * 24 * 60 * 60 * 1000);
          const weeklyAssignments = STATE.analytics.history.filter(h =>
            h.employeeId === emp.employeeId &&
            h.toLocation === path &&
            new Date(h.timestamp).getTime() >= weekCutoff
          );
          
          if (weeklyAssignments.length >= 6) {
            alerts.push({
              type: 'overuse',
              severity: 'high',
              employeeId: emp.employeeId,
              employeeName: emp.name,
              message: `${emp.name} has done ${path.toUpperCase()} ${weeklyAssignments.length} times this week. Needs rotation.`,
              path: path,
              count: weeklyAssignments.length
            });
          }
        });
        
        // Alert: Long gap without assignment to a path
        const allPaths = ['cb', 'ibws', 'lineloaders', 'trickle', 'dm', 'idrt', 'pb', 'e2s', 'dockws', 'e2sws', 'tpb', 'tws', 'sap', 'ao5s', 'pa', 'ps'];
        allPaths.forEach(path => {
          const pathHistory = STATE.analytics.history.filter(h =>
            h.employeeId === emp.employeeId &&
            h.toLocation === path
          );
          
          if (pathHistory.length > 0) {
            const lastAssignment = pathHistory[pathHistory.length - 1];
            const daysSince = (Date.now() - new Date(lastAssignment.timestamp).getTime()) / (24 * 60 * 60 * 1000);
            
            if (daysSince > 21) {
              alerts.push({
                type: 'neglect',
                severity: 'medium',
                employeeId: emp.employeeId,
                employeeName: emp.name,
                message: `${emp.name} has not done ${path.toUpperCase()} in ${Math.round(daysSince)} days. High priority for rotation.`,
                path: path,
                daysSince: Math.round(daysSince)
              });
            }
          }
        });
        
        // Alert: Poor overall fairness
        if (fairness.status === 'unbalanced') {
          alerts.push({
            type: 'fairness',
            severity: 'medium',
            employeeId: emp.employeeId,
            employeeName: emp.name,
            message: `${emp.name} has unbalanced work distribution (variance: ${fairness.variance}). Review rotation.`,
            variance: fairness.variance
          });
        }
      });
      
      // Sort by severity
      const severityOrder = { high: 3, medium: 2, low: 1 };
      alerts.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
      
      return alerts;
    },
    
    // Lock current assignments and generate rotation reports
    lockAssignments: function() {
      const STATE = window.STATE;
      const ANALYTICS = window.ANALYTICS;
      const timestamp = new Date().toISOString();
      const currentSession = ANALYTICS.getCurrentSessionId();
      // Auto-start a session if none exists so locking always works without a warning
      let sessionId = currentSession;
      if (!sessionId) {
        console.warn('[ROTATION] No active session found. Auto-starting session for lock operation.');
        const dateVal = document.getElementById('date')?.value || new Date().toISOString().slice(0,10);
        const shiftVal = document.querySelector('input[name="shift"]:checked')?.value || 'day';
        const siteVal = document.getElementById('site')?.value || (STATE.currentSite || 'YHM2');
        sessionId = ANALYTICS.startSession({ date: dateVal, shift: shiftVal, site: siteVal, plannedHC: Object.values(STATE.badges).filter(b => b.loc !== 'unassigned').length, notes: 'Auto-started at lock' });
        console.log('[ROTATION] Auto-started session:', sessionId);
      }
      
      // Create assignment lock record
      const lockRecord = {
        id: `lock_${Date.now()}`,
        timestamp: timestamp,
        sessionId: sessionId,
        date: new Date().toDateString(),
        assignments: {},
        rotationScores: {},
        nextRecommendations: {}
      };
      
      // Capture current assignments
      Object.values(STATE.badges).forEach(badge => {
        if (badge.loc !== 'unassigned') {
          if (!lockRecord.assignments[badge.loc]) {
            lockRecord.assignments[badge.loc] = [];
          }
          lockRecord.assignments[badge.loc].push({
            employeeId: badge.eid,
            employeeName: badge.name,
            shiftCode: badge.scode,
            site: badge.site
          });
        }
      });
      
      // Calculate rotation scores for each employee
      Object.values(STATE.analytics.performance).forEach(emp => {
        lockRecord.rotationScores[emp.employeeId] = this.calculateRotationScore(emp.employeeId);
      });
      
      // Generate next assignment recommendations
      lockRecord.nextRecommendations = this.generateRotationRecommendations();
      
      // Save lock record
      if (!STATE.analytics.rotationLocks) {
        STATE.analytics.rotationLocks = [];
      }
      STATE.analytics.rotationLocks.push(lockRecord);
      ANALYTICS.saveAnalyticsData();
      
      // Process in integrated rotation system
      this.processRotationLock(lockRecord);
      
      // Update UI to show locked state and rotation management
      this.updateLockUI(true);
      this.showRotationManagementPanel();
      
      console.log('[ROTATION] Assignments locked and processed in-app:', lockRecord);
      return lockRecord;
    },

    // Lock assignments for a specific quarter without disabling UI globally
    lockQuarter: function(quarter) {
      const STATE = window.STATE;
      const ANALYTICS = window.ANALYTICS;
      const q = quarter || (STATE.currentQuarter || 'Q1');
      const timestamp = new Date().toISOString();
      let currentSession = ANALYTICS.getCurrentSessionId();
      if (!currentSession) {
        console.warn('[ROTATION] No active session for quarter lock. Auto-starting.');
        const dateVal = document.getElementById('date')?.value || new Date().toISOString().slice(0,10);
        const shiftVal = document.querySelector('input[name="shift"]:checked')?.value || 'day';
        const siteVal = document.getElementById('site')?.value || (STATE.currentSite || 'YHM2');
        currentSession = ANALYTICS.startSession({ date: dateVal, shift: shiftVal, site: siteVal, plannedHC: Object.values(STATE.badges).filter(b => b.loc !== 'unassigned').length, notes: 'Auto-started at quarter lock' });
      }

      // Build lock record similar to full lock, with quarter tag
      const lockRecord = {
        id: `lock_${q}_${Date.now()}`,
        quarter: q,
        timestamp,
        sessionId: currentSession,
        date: new Date().toDateString(),
        assignments: {},
        rotationScores: {},
        nextRecommendations: {}
      };

      // Capture current assignments snapshot into quarterAssignments (preserve existing)
      STATE.quarterAssignments[q] = STATE.quarterAssignments[q] || {};
      Object.values(STATE.badges).forEach(badge => {
        STATE.quarterAssignments[q][badge.id] = badge.loc;
        if (badge.loc !== 'unassigned') {
          if (!lockRecord.assignments[badge.loc]) lockRecord.assignments[badge.loc] = [];
          lockRecord.assignments[badge.loc].push({
            employeeId: badge.eid,
            employeeName: badge.name,
            shiftCode: badge.scode,
            site: badge.site
          });
        }
      });

      // Rotation scores and next recommendations
      Object.values(STATE.analytics.performance).forEach(emp => {
        lockRecord.rotationScores[emp.employeeId] = this.calculateRotationScore(emp.employeeId);
      });
      lockRecord.nextRecommendations = this.generateRotationRecommendations();

      // Persist quarter lock record
      STATE.analytics.quarterLocks = STATE.analytics.quarterLocks || [];
      STATE.analytics.quarterLocks.push(lockRecord);
      STATE.quarterLocks[q] = true;
        // Log a 'lock' entry per assignment so search reflects the locked quarter
        Object.entries(lockRecord.assignments).forEach(([process, employees]) => {
          (employees || []).forEach(emp => {
            const badge = Object.values(STATE.badges).find(b => b.eid === emp.employeeId);
            const logEntry = {
              id: `log_${q}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: new Date().toISOString(),
              date: new Date().toDateString(),
              badgeId: badge ? badge.id : `emp_${emp.employeeId}`,
              employeeId: emp.employeeId,
              employeeName: emp.employeeName,
              shiftCode: emp.shiftCode,
              site: emp.site,
              quarter: q,
              fromLocation: process,
              toLocation: process,
              action: 'lock',
              duration: null,
              sessionId: currentSession
            };
            STATE.analytics.history.push(logEntry);
          });
        });
        ANALYTICS.saveAnalyticsData();

      // Optionally open rotation management panel
      this.showRotationManagementPanel();
      // Do NOT disable the lock button globally; just provide lightweight feedback
      console.log(`[ROTATION] Quarter ${q} locked`, lockRecord);
      return lockRecord;
    },
    
    // Calculate fairness score for employee rotation
    calculateRotationScore: function(employeeId) {
      const STATE = window.STATE;
      const emp = STATE.analytics.performance[employeeId];
      if (!emp) return { score: 0, status: 'unknown' };
      
      const processes = Object.keys(emp.processExperience);
      const totalAssignments = emp.totalAssignments;
      const uniqueProcesses = processes.length;
      
      // Calculate assignment distribution
      const assignmentDistribution = {};
      let maxAssignments = 0;
      let minAssignments = Infinity;
      
      processes.forEach(process => {
        const count = emp.processExperience[process];
        assignmentDistribution[process] = count;
        maxAssignments = Math.max(maxAssignments, count);
        minAssignments = Math.min(minAssignments, count);
      });
      
      // Calculate fairness metrics
      const varietyScore = Math.min(100, uniqueProcesses * 10); // More processes = higher score
      const balanceScore = totalAssignments > 0 ? 
        Math.max(0, 100 - ((maxAssignments - minAssignments) / totalAssignments * 100)) : 50;
      
      // Recent rotation tracking
      const recentAssignments = STATE.analytics.history
        .filter(h => h.employeeId === employeeId)
        .slice(-10); // Last 10 assignments
      
      const recentProcesses = new Set(recentAssignments.map(h => h.toLocation));
      const recentVarietyScore = Math.min(100, recentProcesses.size * 20);
      
      // Overall rotation score (0-100, higher is better rotation)
      const overallScore = (varietyScore * 0.4) + (balanceScore * 0.4) + (recentVarietyScore * 0.2);
      
      let status = 'good';
      if (overallScore < 30) status = 'poor';
      else if (overallScore < 60) status = 'needs_improvement';
      else if (overallScore >= 85) status = 'excellent';
      
      return {
        score: Math.round(overallScore),
        status: status,
        varietyScore: Math.round(varietyScore),
        balanceScore: Math.round(balanceScore),
        recentVarietyScore: Math.round(recentVarietyScore),
        totalProcesses: uniqueProcesses,
        totalAssignments: totalAssignments,
        assignmentDistribution: assignmentDistribution,
        recommendedProcesses: this.getRecommendedProcessesForRotation(employeeId)
      };
    },
    
    // Get recommended processes for better rotation
    getRecommendedProcessesForRotation: function(employeeId) {
      const STATE = window.STATE;
      const emp = STATE.analytics.performance[employeeId];
      if (!emp) return [];
      
const allProcesses = ['cb', 'ibws', 'lineloaders', 'trickle', 'dm', 'idrt', 'pb', 'e2s', 'dockws', 'e2sws', 'tpb', 'tws', 'sap', 'ao5s', 'pa', 'ps', 'laborshare'];
      const experienced = Object.keys(emp.processExperience);
      const experienceCounts = emp.processExperience;
      
      // Find processes with low or no experience
      const recommendations = allProcesses.map(process => {
        const currentExp = experienceCounts[process] || 0;
        const priority = experienced.includes(process) ? 
          (currentExp < 3 ? 'expand' : 'maintain') : 'learn';
        
        return {
          process: process,
          currentExperience: currentExp,
          priority: priority,
          reason: priority === 'learn' ? 'New skill opportunity' : 
                 priority === 'expand' ? 'Build proficiency' : 'Maintain skills'
        };
      });
      
      // Sort by priority: learn > expand > maintain
      const priorityOrder = { learn: 3, expand: 2, maintain: 1 };
      return recommendations.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
    },
    
    // Generate rotation recommendations for all employees
    generateRotationRecommendations: function() {
      const STATE = window.STATE;
      const recommendations = {};
      
      Object.values(STATE.analytics.performance).forEach(emp => {
        const rotationScore = this.calculateRotationScore(emp.employeeId);
        const processRecommendations = rotationScore.recommendedProcesses.slice(0, 3);
        
        recommendations[emp.employeeId] = {
          name: emp.name,
          currentScore: rotationScore.score,
          status: rotationScore.status,
          recommendedProcesses: processRecommendations,
          reasoning: rotationScore.status === 'poor' ? 'Needs immediate rotation diversity' :
                    rotationScore.status === 'needs_improvement' ? 'Could benefit from more variety' :
                    rotationScore.status === 'excellent' ? 'Excellent rotation balance' : 'Good rotation variety'
        };
      });
      
      return recommendations;
    },
    
    // Process rotation lock and integrate into in-app system
    processRotationLock: function(lockRecord) {
      const STATE = window.STATE;
      const ANALYTICS = window.ANALYTICS;
      console.log('[ROTATION] Processing rotation lock in-app...');
      
      // Create rotation management data structure
      if (!STATE.analytics.rotationManagement) {
        STATE.analytics.rotationManagement = {
          lockHistory: [],
          rotationRules: {
            maxConsecutiveSameProcess: 3,
            minProcessVariety: 2,
            rotationCycleDays: 7,
            fairnessThreshold: 60
          },
          assignmentQueue: [],
          rotationAlerts: []
        };
      }
      
      const mgmt = STATE.analytics.rotationManagement;
      
      // Store lock record
      mgmt.lockHistory.push(lockRecord);
      
      // Generate smart assignment queue for next session
      this.generateSmartAssignmentQueue(lockRecord);
      
      // Create rotation alerts for employees who need attention
      this.generateRotationAlerts(lockRecord);
      
      // Update employee rotation profiles
      this.updateRotationProfiles(lockRecord);
      
      // Save to persistent storage
      ANALYTICS.saveAnalyticsData();
      
      console.log('[ROTATION] In-app rotation system updated successfully');
      return mgmt;
    },
    
    // Generate assignment lock CSV
    generateAssignmentLockCSV: function(lockRecord) {
      const headers = ['Process', 'Employee ID', 'Employee Name', 'Shift Code', 'Site', 'Lock Timestamp', 'Session ID'];
      const rows = [];
      
      Object.entries(lockRecord.assignments).forEach(([process, employees]) => {
        employees.forEach(emp => {
          rows.push([
            process.toUpperCase(),
            emp.employeeId,
            emp.employeeName,
            emp.shiftCode,
            emp.site,
            lockRecord.timestamp,
            lockRecord.sessionId
          ]);
        });
      });
      
      return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    },
    
    // Generate rotation analysis CSV
    generateRotationAnalysisCSV: function(lockRecord) {
      const STATE = window.STATE;
      const headers = [
        'Employee ID', 'Employee Name', 'Rotation Score', 'Status', 'Variety Score', 'Balance Score', 
        'Recent Variety Score', 'Total Processes', 'Total Assignments', 'Most Experienced Process', 
        'Least Experienced Process', 'Recommended Action'
      ];
      
      const rows = Object.entries(lockRecord.rotationScores).map(([empId, score]) => {
        const emp = STATE.analytics.performance[empId];
        const distribution = score.assignmentDistribution;
        const processes = Object.entries(distribution);
        
        const mostExp = processes.length > 0 ? 
          processes.reduce((max, curr) => curr[1] > max[1] ? curr : max) : ['N/A', 0];
        const leastExp = processes.length > 0 ? 
          processes.reduce((min, curr) => curr[1] < min[1] ? curr : min) : ['N/A', 0];
        
        let recommendedAction = 'Maintain current variety';
        if (score.status === 'poor') recommendedAction = 'Urgent: Assign to new processes';
        else if (score.status === 'needs_improvement') recommendedAction = 'Increase process variety';
        else if (score.status === 'excellent') recommendedAction = 'Continue balanced rotation';
        
        return [
          empId,
          emp ? emp.name : 'Unknown',
          score.score,
          score.status,
          score.varietyScore,
          score.balanceScore,
          score.recentVarietyScore,
          score.totalProcesses,
          score.totalAssignments,
          `${mostExp[0]} (${mostExp[1]})`,
          `${leastExp[0]} (${leastExp[1]})`,
          recommendedAction
        ];
      });
      
      return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    },
    
    // Generate recommendations CSV
    generateRecommendationsCSV: function(lockRecord) {
      const headers = ['Employee ID', 'Employee Name', 'Current Score', 'Recommended Process 1', 'Recommended Process 2', 'Recommended Process 3', 'Priority Reason'];
      
      const rows = Object.entries(lockRecord.nextRecommendations).map(([empId, rec]) => [
        empId,
        rec.name,
        rec.currentScore,
        rec.recommendedProcesses[0] ? rec.recommendedProcesses[0].process.toUpperCase() : 'N/A',
        rec.recommendedProcesses[1] ? rec.recommendedProcesses[1].process.toUpperCase() : 'N/A',
        rec.recommendedProcesses[2] ? rec.recommendedProcesses[2].process.toUpperCase() : 'N/A',
        rec.reasoning
      ]);
      
      return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    },
    
    // Generate HTML rotation summary
    generateRotationSummaryHTML: function(lockRecord) {
      const STATE = window.STATE;
      const totalEmployees = Object.keys(lockRecord.rotationScores).length;
      const avgRotationScore = Object.values(lockRecord.rotationScores)
        .reduce((sum, score) => sum + score.score, 0) / totalEmployees;
      
      const statusCounts = {};
      Object.values(lockRecord.rotationScores).forEach(score => {
        statusCounts[score.status] = (statusCounts[score.status] || 0) + 1;
      });
      
      const processAssignments = Object.keys(lockRecord.assignments).length;
      
      return `
<!DOCTYPE html>
<html>
<head>
  <title>VLAB Rotation Summary - ${new Date(lockRecord.timestamp).toDateString()}</title>
  <style>
      body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
      .container { max-width: 1000px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #f59e0b; padding-bottom: 15px; }
      .header h1 { color: #1f2937; margin: 0; }
      .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
      .metric-card { background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 15px; text-align: center; }
      .metric-value { font-size: 24px; font-weight: bold; color: #92400e; }
      .metric-label { color: #b45309; font-size: 12px; text-transform: uppercase; }
      .rotation-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      .rotation-table th, .rotation-table td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
      .rotation-table th { background: #fef3c7; font-weight: 600; }
      .status-poor { background: #fee2e2; color: #dc2626; }
      .status-needs_improvement { background: #fef3c7; color: #d97706; }
      .status-good { background: #d1fae5; color: #059669; }
      .status-excellent { background: #dbeafe; color: #2563eb; }
  </style>
</head>
<body>
  <div class="container">
      <div class="header">
          <h1>🔒 Assignment Lock & Rotation Report</h1>
          <p>${new Date(lockRecord.timestamp).toDateString()} - Session: ${lockRecord.sessionId}</p>
      </div>
      
      <div class="metrics">
          <div class="metric-card">
              <div class="metric-value">${totalEmployees}</div>
              <div class="metric-label">Total Employees</div>
          </div>
          <div class="metric-card">
              <div class="metric-value">${processAssignments}</div>
              <div class="metric-label">Active Processes</div>
          </div>
          <div class="metric-card">
              <div class="metric-value">${avgRotationScore.toFixed(1)}</div>
              <div class="metric-label">Avg Rotation Score</div>
          </div>
          <div class="metric-card">
              <div class="metric-value">${statusCounts.excellent || 0}</div>
              <div class="metric-label">Excellent Rotation</div>
          </div>
      </div>
      
      <h2>Employee Rotation Analysis</h2>
      <table class="rotation-table">
          <thead>
              <tr>
                  <th>Employee</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Processes</th>
                  <th>Total Assignments</th>
                  <th>Next Recommended</th>
              </tr>
          </thead>
          <tbody>
              ${Object.entries(lockRecord.rotationScores).map(([empId, score]) => {
                const emp = STATE.analytics.performance[empId];
                const rec = lockRecord.nextRecommendations[empId];
                return `
                  <tr class="status-${score.status}">
                      <td>${emp ? emp.name : 'Unknown'}</td>
                      <td>${score.score}</td>
                      <td>${score.status.replace('_', ' ')}</td>
                      <td>${score.totalProcesses}</td>
                      <td>${score.totalAssignments}</td>
                      <td>${rec && rec.recommendedProcesses[0] ? rec.recommendedProcesses[0].process.toUpperCase() : 'N/A'}</td>
                  </tr>
                `;
              }).join('')}
          </tbody>
      </table>
      
      <h2>Current Process Assignments</h2>
      ${Object.entries(lockRecord.assignments).map(([process, employees]) => `
          <h3>${process.toUpperCase()} (${employees.length} employees)</h3>
          <ul>
              ${employees.map(emp => `<li>${emp.employeeName} (${emp.employeeId}) - ${emp.shiftCode}</li>`).join('')}
          </ul>
      `).join('')}
      
      <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 11px;">
          Generated by VLAB Fair Rotation System - ${lockRecord.timestamp}
      </div>
  </div>
</body>
</html>`;
    },
    
    // Generate smart assignment queue for next session
    generateSmartAssignmentQueue: function(lockRecord) {
      const STATE = window.STATE;
      const mgmt = STATE.analytics.rotationManagement;
      mgmt.assignmentQueue = [];
      
      // Analyze current assignments and create balanced suggestions
      const processNeeds = this.analyzeProcessNeeds(lockRecord);
      const employeeRotationNeeds = this.analyzeEmployeeRotationNeeds();
      
      // Create assignment suggestions prioritizing rotation fairness
      Object.entries(employeeRotationNeeds).forEach(([empId, needs]) => {
        const employee = STATE.analytics.performance[empId];
        if (!employee) return;
        
        
        // Find best process match for this employee
        const bestMatch = this.findBestProcessMatch(empId, processNeeds, needs);
        
        if (bestMatch) {
          mgmt.assignmentQueue.push({
            employeeId: empId,
            employeeName: employee.name,
            recommendedProcess: bestMatch.process,
            priority: bestMatch.priority,
            reason: bestMatch.reason,
            rotationScore: needs.currentScore,
            expectedImprovement: bestMatch.expectedImprovement,
            timestamp: new Date().toISOString()
          });
        }
      });
      
      // Sort by priority and rotation need
      mgmt.assignmentQueue.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return (priorityOrder[b.priority] - priorityOrder[a.priority]) || 
               (a.rotationScore - b.rotationScore); // Lower rotation score = higher need
      });
      
      console.log('[ROTATION] Generated assignment queue:', mgmt.assignmentQueue);
    },

    // Analyze process staffing needs
    analyzeProcessNeeds: function(lockRecord) {
      const processNeeds = {};
      const allProcesses = ['cb', 'ibws', 'lineloaders', 'trickle', 'dm', 'idrt', 'pb', 'e2s', 'dockws', 'e2sws', 'tpb', 'tws', 'sap', 'ao5s', 'pa', 'ps', 'laborshare'];
      
      allProcesses.forEach(process => {
        const currentAssigned = lockRecord.assignments[process] ? lockRecord.assignments[process].length : 0;
        const targetStaffing = 2; // Default target, could be made configurable
        
        processNeeds[process] = {
          current: currentAssigned,
          target: targetStaffing,
          need: Math.max(0, targetStaffing - currentAssigned),
          priority: currentAssigned === 0 ? 'high' : (currentAssigned < targetStaffing ? 'medium' : 'low')
        };
      });
      
      return processNeeds;
    },

    // Analyze individual employee rotation needs
    analyzeEmployeeRotationNeeds: function() {
      const STATE = window.STATE;
      const employeeNeeds = {};
      
      Object.values(STATE.analytics.performance).forEach(emp => {
        const rotationScore = this.calculateRotationScore(emp.employeeId);
        const recentAssignments = STATE.analytics.history
          .filter(h => h.employeeId === emp.employeeId)
          .slice(-5);
        
        const recentProcesses = new Set(recentAssignments.map(h => h.toLocation));
        const isStuckInSameProcess = recentProcesses.size === 1 && recentAssignments.length >= 3;
        
        employeeNeeds[emp.employeeId] = {
          currentScore: rotationScore.score,
          status: rotationScore.status,
          needsVariety: rotationScore.score < 60,
          stuckInSameProcess: isStuckInSameProcess,
          preferredNewProcesses: rotationScore.recommendedProcesses.slice(0, 3),
          lastProcess: recentAssignments.length > 0 ? recentAssignments[recentAssignments.length - 1].toLocation : null
        };
      });
      
      return employeeNeeds;
    },

    // Find best process match for employee
    findBestProcessMatch: function(employeeId, processNeeds, employeeNeeds) {
      let bestMatch = null;
      let bestScore = 0;
      
      // Get employee's preferred new processes
      const preferredProcesses = employeeNeeds.preferredNewProcesses || [];
      
      preferredProcesses.forEach(preferred => {
        const process = preferred.process;
        const processNeed = processNeeds[process];
        
        if (!processNeed || processNeed.need === 0) return;
        
        let score = 0;
        let priority = 'low';
        let reason = '';
        
        // Score based on rotation need
        if (employeeNeeds.needsVariety) {
          score += 30;
          reason += 'Needs rotation variety. ';
        }
        
        // Score based on process need
        if (processNeed.priority === 'high') {
          score += 25;
          priority = 'high';
          reason += `${process.toUpperCase()} urgently needs staff. `;
        } else if (processNeed.priority === 'medium') {
          score += 15;
          priority = 'medium';
          reason += `${process.toUpperCase()} needs additional staff. `;
        }
        
        // Bonus for learning new skills
        if (preferred.priority === 'learn') {
          score += 20;
          reason += 'New skill learning opportunity. ';
        } else if (preferred.priority === 'expand') {
          score += 10;
          reason += 'Skill expansion opportunity. ';
        }
        
        // Avoid same process if stuck
        if (employeeNeeds.stuckInSameProcess && employeeNeeds.lastProcess === process) {
          score -= 50;
          reason += 'Avoiding repetitive assignment. ';
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            process: process,
            priority: priority,
            reason: reason.trim(),
            expectedImprovement: Math.min(15, score / 5),
            confidenceScore: Math.min(100, bestScore)
          };
        }
      });
      
      return bestMatch;
    },

    // Generate rotation alerts for management attention
    generateRotationAlerts: function(lockRecord) {
      const STATE = window.STATE;
      const mgmt = STATE.analytics.rotationManagement;
      mgmt.rotationAlerts = [];
      
      Object.entries(lockRecord.rotationScores).forEach(([empId, score]) => {
        const emp = STATE.analytics.performance[empId];
        if (!emp) return;
        
        let alert = null;
        
        if (score.status === 'poor') {
          alert = {
            type: 'urgent',
            employeeId: empId,
            employeeName: emp.name,
            message: `${emp.name} has very limited rotation variety (Score: ${score.score})`,
            action: 'Assign to new process immediately',
            priority: 'high'
          };
        } else if (score.status === 'needs_improvement') {
          alert = {
            type: 'warning',
            employeeId: empId,
            employeeName: emp.name,
            message: `${emp.name} could benefit from more process variety (Score: ${score.score})`,
            action: 'Consider rotation in next 2-3 assignments',
            priority: 'medium'
          };
        }
        
        // Check for process monopolization
        const maxProcess = Object.entries(score.assignmentDistribution)
          .reduce((max, curr) => curr[1] > max[1] ? curr : max, ['', 0]);
        
        if (maxProcess[1] > mgmt.rotationRules.maxConsecutiveSameProcess && score.totalAssignments > 5) {
          alert = {
            type: 'monopolization',
            employeeId: empId,
            employeeName: emp.name,
            message: `${emp.name} has been in ${maxProcess[0].toUpperCase()} for ${maxProcess[1]} assignments`,
            action: `Move away from ${maxProcess[0].toUpperCase()} for better balance`,
            priority: 'high'
          };
        }
        
        if (alert) {
          alert.timestamp = new Date().toISOString();
          mgmt.rotationAlerts.push(alert);
        }
      });
      
      console.log('[ROTATION] Generated alerts:', mgmt.rotationAlerts);
    },

    // Update employee rotation profiles
    updateRotationProfiles: function(lockRecord) {
      const STATE = window.STATE;
      Object.entries(lockRecord.rotationScores).forEach(([empId, score]) => {
        const emp = STATE.analytics.performance[empId];
        if (!emp) return;
        
        // Update rotation history
        if (!emp.rotationHistory) {
          emp.rotationHistory = [];
        }
        
        emp.rotationHistory.push({
          date: new Date().toDateString(),
          score: score.score,
          status: score.status,
          processesWorked: score.totalProcesses,
          assignments: score.totalAssignments
        });
        
        // Keep only last 30 records
        if (emp.rotationHistory.length > 30) {
          emp.rotationHistory = emp.rotationHistory.slice(-30);
        }
        
        // Calculate rotation trend
        if (emp.rotationHistory.length >= 3) {
          const recent = emp.rotationHistory.slice(-3);
          const avgRecentScore = recent.reduce((sum, r) => sum + r.score, 0) / recent.length;
          const older = emp.rotationHistory.slice(-6, -3);
          
          if (older.length > 0) {
            const avgOlderScore = older.reduce((sum, r) => sum + r.score, 0) / older.length;
            emp.rotationTrend = avgRecentScore > avgOlderScore ? 'improving' : 
                               avgRecentScore < avgOlderScore ? 'declining' : 'stable';
          }
        }
      });
    },
    
    // Update UI to show locked state
    updateLockUI: function(locked) {
      const lockBtn = document.getElementById('lockAssignmentsBtn');
      if (lockBtn) {
        if (locked) {
          lockBtn.textContent = '🔒 Locked';
          lockBtn.disabled = true;
          lockBtn.classList.add('opacity-50', 'cursor-not-allowed');
          lockBtn.title = 'Assignments are locked. Refresh to unlock.';
          
          // Add locked banner
          this.showLockedBanner();
        }
      }
    },
    
    // Show banner indicating assignments are locked
    showLockedBanner: function() {
      const existingBanner = document.getElementById('lockedBanner');
      if (existingBanner) return; // Don't create duplicate
      
      const banner = document.createElement('div');
      banner.id = 'lockedBanner';
      banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(90deg, #f59e0b, #d97706);
        color: white;
        text-align: center;
        padding: 8px;
        font-weight: 600;
        font-size: 14px;
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        animation: slideDown 0.3s ease-out;
      `;
      banner.innerHTML = '🔒 Assignments Locked - Rotation tracking active. Reports generated. Refresh page to unlock.';
      
      document.body.appendChild(banner);
      
      // Add CSS animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `;
      document.head.appendChild(style);
      
      // Adjust page content to account for banner
      document.body.style.paddingTop = '40px';
    },
    
    // Show rotation management panel
    showRotationManagementPanel: function() {
      const existingPanel = document.getElementById('rotationPanel');
      if (existingPanel) {
        existingPanel.style.display = 'block';
        return;
      }
      
      const panel = document.createElement('div');
      panel.id = 'rotationPanel';
      panel.className = 'rotation-management-panel';
      panel.innerHTML = `
        <div class="rotation-panel-header">
          <h3>🔄 Smart Rotation Management</h3>
          <button class="rotation-close-btn" onclick="document.getElementById('rotationPanel').style.display='none'">×</button>
        </div>
        <div class="rotation-panel-content">
          <div class="rotation-tabs">
            <button class="rotation-tab active" data-tab="queue">Assignment Queue</button>
            <button class="rotation-tab" data-tab="alerts">Rotation Alerts</button>
            <button class="rotation-tab" data-tab="trends">Employee Trends</button>
          </div>
          <div id="rotation-queue" class="rotation-tab-content">
            <div id="queueContent">Loading assignment queue...</div>
          </div>
          <div id="rotation-alerts" class="rotation-tab-content hidden">
            <div id="alertsContent">Loading rotation alerts...</div>
          </div>
          <div id="rotation-trends" class="rotation-tab-content hidden">
            <div id="trendsContent">Loading employee trends...</div>
          </div>
        </div>
      `;
      
      // Style the panel
      panel.style.cssText = `
        position: fixed;
        right: 20px;
        top: 80px;
        width: 400px;
        max-height: 600px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        z-index: 1001;
        overflow: hidden;
        border: 2px solid #f59e0b;
      `;
      
      document.body.appendChild(panel);
      
      // Add panel styles
      this.addRotationPanelStyles();
      
      // Setup tab functionality
      this.setupRotationTabs();
      
      // Load initial content
      this.loadRotationQueueContent();
    },
    
    // Add CSS styles for rotation panel
    addRotationPanelStyles: function() {
      if (document.getElementById('rotationPanelStyles')) return;
      
      const style = document.createElement('style');
      style.id = 'rotationPanelStyles';
      style.textContent = `
        .rotation-panel-header {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .rotation-panel-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }
        .rotation-close-btn {
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .rotation-close-btn:hover {
          background: rgba(255,255,255,0.2);
        }
        .rotation-panel-content {
          padding: 0;
        }
        .rotation-tabs {
          display: flex;
          background: #f3f4f6;
        }
        .rotation-tab {
          flex: 1;
          padding: 8px 12px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          color: #6b7280;
          transition: all 0.2s;
        }
        .rotation-tab.active {
          background: white;
          color: #1f2937;
          border-bottom: 2px solid #f59e0b;
        }
        .rotation-tab-content {
          padding: 16px;
          max-height: 400px;
          overflow-y: auto;
        }
        .rotation-tab-content.hidden {
          display: none;
        }
        .queue-item {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 8px;
          transition: all 0.2s;
        }
        .queue-item:hover {
          border-color: #f59e0b;
          background: #fef3c7;
        }
        .queue-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .queue-employee {
          font-weight: 600;
          color: #1f2937;
        }
        .queue-process {
          background: #3b82f6;
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
        }
        .queue-reason {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 6px;
        }
        .queue-actions {
          display: flex;
          gap: 6px;
        }
        .queue-btn {
          padding: 4px 8px;
          font-size: 10px;
          border-radius: 4px;
          border: none;
          cursor: pointer;
          font-weight: 500;
        }
        .queue-btn.assign {
          background: #10b981;
          color: white;
        }
        .queue-btn.skip {
          background: #6b7280;
          color: white;
        }
        .queue-btn:hover {
          opacity: 0.8;
        }
        .alert-item {
          padding: 12px;
          margin-bottom: 8px;
          border-radius: 6px;
          border-left: 4px solid;
        }
        .alert-urgent {
          background: #fef2f2;
          border-color: #dc2626;
        }
        .alert-warning {
          background: #fef3c7;
          border-color: #f59e0b;
        }
        .alert-monopolization {
          background: #f0f4ff;
          border-color: #3b82f6;
        }
        .alert-header {
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 4px;
        }
        .alert-message {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 6px;
        }
        .alert-action {
          font-size: 12px;
          font-weight: 500;
          color: #1f2937;
        }
      `;
      document.head.appendChild(style);
    },
    
    // Setup tab functionality for rotation panel
    setupRotationTabs: function() {
      const tabs = document.querySelectorAll('.rotation-tab');
      const contents = document.querySelectorAll('.rotation-tab-content');
      
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // Remove active from all tabs
          tabs.forEach(t => t.classList.remove('active'));
          contents.forEach(c => c.classList.add('hidden'));
          
          // Add active to clicked tab
          tab.classList.add('active');
          const tabName = tab.getAttribute('data-tab');
          const content = document.getElementById(`rotation-${tabName}`);
          if (content) {
            content.classList.remove('hidden');
            
            // Load content based on tab
            if (tabName === 'queue') this.loadRotationQueueContent();
            else if (tabName === 'alerts') this.loadRotationAlertsContent();
            else if (tabName === 'trends') this.loadRotationTrendsContent();
          }
        });
      });
    },
    
    // Load assignment queue content
    loadRotationQueueContent: function() {
      const STATE = window.STATE;
      const ANALYTICS = window.ANALYTICS;
      const queueContent = document.getElementById('queueContent');
      const mgmt = STATE.analytics.rotationManagement;
      
      if (!mgmt || !mgmt.assignmentQueue || mgmt.assignmentQueue.length === 0) {
        queueContent.innerHTML = '<p style="text-align: center; color: #6b7280;">No assignment recommendations available</p>';
        return;
      }
      
      queueContent.innerHTML = mgmt.assignmentQueue.map(item => `
        <div class="queue-item" data-employee-id="${item.employeeId}">
          <div class="queue-item-header">
            <span class="queue-employee">${item.employeeName}</span>
            <span class="queue-process">${item.recommendedProcess.toUpperCase()}</span>
          </div>
          <div class="queue-reason">${item.reason}</div>
          <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px;">
            Current rotation: ${item.rotationScore} | Priority: ${item.priority} | Expected improvement: +${item.expectedImprovement}
          </div>
          <div class="queue-actions">
            <button class="queue-btn assign" onclick="ANALYTICS.ROTATION.executeAssignment('${item.employeeId}', '${item.recommendedProcess}')">
              Assign Now
            </button>
            <button class="queue-btn skip" onclick="ANALYTICS.ROTATION.skipAssignment('${item.employeeId}')">
              Skip
            </button>
          </div>
        </div>
      `).join('');
    },
    
    // Load rotation alerts content
    loadRotationAlertsContent: function() {
      const STATE = window.STATE;
      const alertsContent = document.getElementById('alertsContent');
      const mgmt = STATE.analytics.rotationManagement;
      
      if (!mgmt || !mgmt.rotationAlerts || mgmt.rotationAlerts.length === 0) {
        alertsContent.innerHTML = '<p style="text-align: center; color: #6b7280;">No rotation alerts</p>';
        return;
      }
      
      alertsContent.innerHTML = mgmt.rotationAlerts.map(alert => `
        <div class="alert-item alert-${alert.type}">
          <div class="alert-header">${alert.employeeName}</div>
          <div class="alert-message">${alert.message}</div>
          <div class="alert-action">Action: ${alert.action}</div>
        </div>
      `).join('');
    },
    
    // Load rotation trends content
    loadRotationTrendsContent: function() {
      const STATE = window.STATE;
      const trendsContent = document.getElementById('trendsContent');
      const employees = Object.values(STATE.analytics.performance);
      
      if (employees.length === 0) {
        trendsContent.innerHTML = '<p style="text-align: center; color: #6b7280;">No employee data available</p>';
        return;
      }
      
      const employeesWithTrends = employees.filter(emp => emp.rotationHistory && emp.rotationHistory.length >= 2);
      
      if (employeesWithTrends.length === 0) {
        trendsContent.innerHTML = '<p style="text-align: center; color: #6b7280;">Not enough data for trends analysis</p>';
        return;
      }
      
      trendsContent.innerHTML = employeesWithTrends.map(emp => {
        const latest = emp.rotationHistory[emp.rotationHistory.length - 1];
        const trendIcon = emp.rotationTrend === 'improving' ? '📈' : 
                         emp.rotationTrend === 'declining' ? '📉' : '➡️';
        
        return `
          <div class="queue-item">
            <div class="queue-item-header">
              <span class="queue-employee">${emp.name}</span>
              <span style="font-size: 12px;">${trendIcon} ${emp.rotationTrend || 'stable'}</span>
            </div>
            <div style="font-size: 12px; color: #6b7280;">
              Current Score: ${latest.score} | Processes: ${latest.processesWorked} | Total Assignments: ${latest.assignments}
            </div>
          </div>
        `;
      }).join('');
    },
    
    // Execute assignment from queue
    executeAssignment: function(employeeId, processKey) {
      const STATE = window.STATE;
      const ANALYTICS = window.ANALYTICS;
      const badge = Object.values(STATE.badges).find(b => b.eid === employeeId);
      if (!badge) {
        alert('Employee badge not found');
        return;
      }
      
      // Move badge to the specified process
      const oldLocation = badge.loc;
      badge.loc = processKey;
      
      // Log the assignment
      ANALYTICS.logAssignment(badge.id, oldLocation, processKey);
      
      // Update DOM
      const badgeElement = document.getElementById(badge.id);
      const targetContainer = processKey === 'unassigned' ? 
        document.getElementById('unassignedStack') : 
        document.querySelector(`#tile-${processKey} .path-box`);
      
      if (badgeElement && targetContainer) {
        targetContainer.appendChild(badgeElement);
        if (typeof window.restack === 'function') window.restack(targetContainer);
        if (typeof window.setCounts === 'function') window.setCounts();
      }
      
      // Remove from queue
      const mgmt = STATE.analytics.rotationManagement;
      if (mgmt && mgmt.assignmentQueue) {
        mgmt.assignmentQueue = mgmt.assignmentQueue.filter(item => item.employeeId !== employeeId);
        ANALYTICS.saveAnalyticsData();
      }
      
      // Refresh queue display
      this.loadRotationQueueContent();
      
      alert(`✅ ${badge.name} assigned to ${processKey.toUpperCase()}`);
    },
    
    // Skip assignment from queue  
    skipAssignment: function(employeeId) {
      const STATE = window.STATE;
      const ANALYTICS = window.ANALYTICS;
      const mgmt = STATE.analytics.rotationManagement;
      if (mgmt && mgmt.assignmentQueue) {
        mgmt.assignmentQueue = mgmt.assignmentQueue.filter(item => item.employeeId !== employeeId);
        ANALYTICS.saveAnalyticsData();
        this.loadRotationQueueContent();
      }
    }
  }
};

// Load analytics data on startup
// Removed immediate call to ensure STATE is ready
// if (window.ANALYTICS) {
//   window.ANALYTICS.loadAnalyticsData();
// }
