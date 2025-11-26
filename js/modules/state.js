// State Module
// Extracted from app.js

window.STATE = { 
  badges: {},
  analytics: {
    history: [], // Assignment history log
    sessions: [], // Work sessions data
    performance: {}, // Employee performance metrics
    patterns: {} // Assignment pattern analysis
  },
  currentQuarter: 'Q1',
  quarterAssignments: { Q1: {}, Q2: {}, Q3: {}, Q4: {} },
  quarterLocks: { Q1: false, Q2: false, Q3: false, Q4: false },
  // Multi-site support
  currentSite: 'YDD2', // Active site being viewed
  suppressAnalytics: false, // Flag to prevent analytics during internal operations
  sites: {
    YDD2: { 
      assignments: {},  // badgeId -> location mapping for this site
      processes: ['cb','ibws','lineloaders','trickle','dm','idrt','pb','e2s','dockws','e2sws','tpb','tws','sap','ao5s','pa','ps','laborshare']
    },
    YDD4: { 
      assignments: {},  // badgeId -> location mapping for this site
      processes: ['cb','ibws','lineloaders','trickle','dm','idrt','pb','e2s','dockws','e2sws','tpb','tws','sap','ao5s','pa','ps','laborshare']
    },
    YHM2: { 
      assignments: {},  // badgeId -> location mapping for this site
      processes: ['cb','ibws','lineloaders','trickle','dm','idrt','pb','e2s','dockws','e2sws','tpb','tws','sap','ao5s','pa','ps','laborshare']
    }
  }
};
