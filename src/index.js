import express from 'express';
import { initializeFirebase } from './firebase.js';
import { 
  getUserProfile,
  getBodyStats,
  getStreak,
  getConsistency,
  getTrainingVolume,
  getTopExercises,
  getPRHistory,
  getRecentWorkouts, 
  getCoachSummary, 
  getAthleteProgress,
  getMaxLifts,
  getGoals,
} from './domains/benchpressonly/tools.js';
import {
  getRecentActivity,
  getCostSummary,
  getActivityStats,
} from './domains/activity/tools.js';

initializeFirebase();

const app = express();
const PORT = process.env.PORT || 3000;

// Tool definitions (used by both /tools JSON and landing page)
const TOOLS = {
  benchpressonly: {
    name: 'BenchPressOnly',
    description: 'Fitness tracking and coaching analytics',
    tools: [
      { name: 'get_user_profile', endpoint: '/benchpressonly/profile/:username', description: 'User profile and basic stats', params: ['username'] },
      { name: 'get_body_stats', endpoint: '/benchpressonly/body/:username', description: 'Body stats (weight, height, BMI)', params: ['username'] },
      { name: 'get_streak', endpoint: '/benchpressonly/streak/:username', description: 'Current and longest workout streak', params: ['username'] },
      { name: 'get_consistency', endpoint: '/benchpressonly/consistency/:username', description: 'Training consistency stats', params: ['username'], query: ['days'] },
      { name: 'get_training_volume', endpoint: '/benchpressonly/volume/:username', description: 'Training volume stats', params: ['username'], query: ['days'] },
      { name: 'get_top_exercises', endpoint: '/benchpressonly/exercises/:username', description: 'Most trained exercises', params: ['username'], query: ['limit'] },
      { name: 'get_pr_history', endpoint: '/benchpressonly/prs/:username', description: 'PR history for all exercises', params: ['username'], query: ['exercise'] },
      { name: 'get_recent_workouts', endpoint: '/benchpressonly/workouts/:username', description: 'Recent completed workouts', params: ['username'], query: ['limit'] },
      { name: 'get_coach_summary', endpoint: '/benchpressonly/coach/:username', description: 'Coaching overview', params: ['username'] },
      { name: 'get_athlete_progress', endpoint: '/benchpressonly/coach/:username/athletes', description: 'Athlete progress and completion rates', params: ['username'] },
      { name: 'get_max_lifts', endpoint: '/benchpressonly/maxes/:username', description: 'Estimated 1RMs for all exercises', params: ['username'] },
      { name: 'get_goals', endpoint: '/benchpressonly/goals/:username', description: 'Fitness goals and progress', params: ['username'], query: ['completed'] },
    ]
  },
  activity: {
    name: 'AI Activity',
    description: 'Cross-app AI activity feed and cost tracking',
    tools: [
      { name: 'get_recent_activity', endpoint: '/activity/recent', description: 'Recent AI activity across all apps', query: ['limit', 'source'] },
      { name: 'get_cost_summary', endpoint: '/activity/costs', description: 'AI cost breakdown by source, model, and type', query: ['days'] },
      { name: 'get_activity_stats', endpoint: '/activity/stats', description: 'Activity frequency and trends', query: ['days'] },
    ]
  }
};

// Landing page HTML
const landingPageHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Azoni MCP Server</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg viewBox='0 0 120 120' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='60' cy='60' r='16' fill='url(%23grad1)'/%3E%3Ccircle cx='60' cy='60' r='10' fill='%230a0a0f'/%3E%3Ccircle cx='60' cy='60' r='5' fill='%234ecdc4'/%3E%3Ccircle cx='25' cy='35' r='10' fill='%231a1a2e' stroke='%23ff7a5c' stroke-width='2'/%3E%3Ccircle cx='95' cy='35' r='10' fill='%231a1a2e' stroke='%23ff7a5c' stroke-width='2'/%3E%3Ccircle cx='25' cy='90' r='10' fill='%231a1a2e' stroke='%234ecdc4' stroke-width='2'/%3E%3Ccircle cx='95' cy='90' r='10' fill='%231a1a2e' stroke='%234ecdc4' stroke-width='2'/%3E%3Ccircle cx='60' cy='15' r='8' fill='%231a1a2e' stroke='%23ffb347' stroke-width='2'/%3E%3Ccircle cx='60' cy='105' r='8' fill='%231a1a2e' stroke='%23ffb347' stroke-width='2'/%3E%3Cline x1='35' y1='40' x2='48' y2='52' stroke='%23ff7a5c' stroke-width='2' opacity='0.6'/%3E%3Cline x1='85' y1='40' x2='72' y2='52' stroke='%23ff7a5c' stroke-width='2' opacity='0.6'/%3E%3Cline x1='35' y1='85' x2='48' y2='68' stroke='%234ecdc4' stroke-width='2' opacity='0.6'/%3E%3Cline x1='85' y1='85' x2='72' y2='68' stroke='%234ecdc4' stroke-width='2' opacity='0.6'/%3E%3Cline x1='60' y1='23' x2='60' y2='44' stroke='%23ffb347' stroke-width='2' opacity='0.6'/%3E%3Cline x1='60' y1='97' x2='60' y2='76' stroke='%23ffb347' stroke-width='2' opacity='0.6'/%3E%3Ccircle cx='25' cy='35' r='3' fill='%23ff7a5c'/%3E%3Ccircle cx='95' cy='35' r='3' fill='%23ff7a5c'/%3E%3Ccircle cx='25' cy='90' r='3' fill='%234ecdc4'/%3E%3Ccircle cx='95' cy='90' r='3' fill='%234ecdc4'/%3E%3Ccircle cx='60' cy='15' r='2.5' fill='%23ffb347'/%3E%3Ccircle cx='60' cy='105' r='2.5' fill='%23ffb347'/%3E%3Cdefs%3E%3ClinearGradient id='grad1' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23ff7a5c'/%3E%3Cstop offset='100%25' stop-color='%23ffb347'/%3E%3C/linearGradient%3E%3C/defs%3E%3C/svg%3E">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      line-height: 1.6;
      min-height: 100vh;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    
    header {
      text-align: center;
      margin-bottom: 60px;
      padding-bottom: 40px;
      border-bottom: 1px solid #1a1a2e;
    }
    
    .logo {
      font-size: 2.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, #ff7a5c 0%, #ffb347 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 10px;
    }
    
    .tagline {
      color: #888;
      font-size: 1.1rem;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 20px;
      padding: 8px 16px;
      background: rgba(78, 205, 196, 0.1);
      border: 1px solid rgba(78, 205, 196, 0.3);
      border-radius: 20px;
      font-size: 0.85rem;
      color: #4ecdc4;
    }
    
    .status-dot {
      width: 8px;
      height: 8px;
      background: #4ecdc4;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .section {
      margin-bottom: 50px;
    }
    
    .section-title {
      font-size: 1.3rem;
      font-weight: 600;
      margin-bottom: 20px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .section-title::before {
      content: '';
      width: 4px;
      height: 20px;
      background: linear-gradient(135deg, #ff7a5c, #ffb347);
      border-radius: 2px;
    }
    
    .card {
      background: #12121a;
      border: 1px solid #1a1a2e;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 16px;
    }
    
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    
    .domain-name {
      font-size: 1.1rem;
      font-weight: 600;
      color: #fff;
    }
    
    .domain-badge {
      font-size: 0.75rem;
      padding: 4px 10px;
      background: rgba(255, 122, 92, 0.15);
      border: 1px solid rgba(255, 122, 92, 0.3);
      border-radius: 4px;
      color: #ff7a5c;
    }
    
    .domain-description {
      color: #888;
      font-size: 0.9rem;
      margin-bottom: 20px;
    }
    
    .tools-grid {
      display: grid;
      gap: 12px;
    }
    
    .tool {
      background: #0a0a0f;
      border: 1px solid #1a1a2e;
      border-radius: 8px;
      padding: 16px;
      transition: all 0.2s;
    }
    
    .tool:hover {
      border-color: #2a2a3e;
      transform: translateX(4px);
    }
    
    .tool-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    
    .tool-name {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 0.85rem;
      color: #4ecdc4;
      font-weight: 500;
    }
    
    .tool-method {
      font-size: 0.7rem;
      padding: 2px 6px;
      background: rgba(78, 205, 196, 0.1);
      border-radius: 3px;
      color: #4ecdc4;
      font-weight: 600;
    }
    
    .tool-description {
      font-size: 0.85rem;
      color: #888;
      margin-bottom: 10px;
    }
    
    .tool-endpoint {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 0.8rem;
      color: #666;
      background: #0d0d12;
      padding: 8px 12px;
      border-radius: 4px;
      overflow-x: auto;
    }
    
    .endpoints-section {
      margin-top: 40px;
    }
    
    .quick-links {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    
    .quick-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      background: #12121a;
      border: 1px solid #1a1a2e;
      border-radius: 8px;
      color: #e0e0e0;
      text-decoration: none;
      font-size: 0.9rem;
      transition: all 0.2s;
    }
    
    .quick-link:hover {
      border-color: #ff7a5c;
      color: #ff7a5c;
    }
    
    .quick-link code {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 0.8rem;
      color: #888;
    }
    
    footer {
      text-align: center;
      padding-top: 40px;
      border-top: 1px solid #1a1a2e;
      color: #666;
      font-size: 0.85rem;
    }
    
    footer a {
      color: #ff7a5c;
      text-decoration: none;
    }
    
    footer a:hover {
      text-decoration: underline;
    }
    
    .info-box {
      background: rgba(78, 205, 196, 0.05);
      border: 1px solid rgba(78, 205, 196, 0.2);
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 30px;
      font-size: 0.9rem;
      color: #aaa;
    }
    
    .info-box strong {
      color: #4ecdc4;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">azoni-mcp</div>
      <p class="tagline">MCP Server for AI Agents</p>
      <div class="status-badge">
        <span class="status-dot"></span>
        <span>Operational</span>
      </div>
    </header>
    
    <div class="info-box">
      <strong>What is this?</strong> An MCP-style server that exposes live data from my projects to AI agents. 
      Used by the chatbot at <a href="https://azoni.ai/chat" style="color: #4ecdc4;">azoni.ai/chat</a> to answer questions with real-time data.
    </div>
    
    <section class="section">
      <h2 class="section-title">Quick Links</h2>
      <div class="quick-links">
        <a href="/health" class="quick-link">
          Health Check <code>/health</code>
        </a>
        <a href="/tools" class="quick-link">
          Tool Discovery <code>/tools</code>
        </a>
      </div>
    </section>
    
    <section class="section">
      <h2 class="section-title">Available Domains</h2>
      
      <div class="card">
        <div class="card-header">
          <span class="domain-name">BenchPressOnly</span>
          <span class="domain-badge">12 tools</span>
        </div>
        <p class="domain-description">Fitness tracking, workout analytics, coaching data, and personal records from the BenchPressOnly app.</p>
        
        <div class="tools-grid">
          <div class="tool">
            <div class="tool-header">
              <span class="tool-name">get_user_profile</span>
              <span class="tool-method">GET</span>
            </div>
            <p class="tool-description">User profile and basic stats</p>
            <div class="tool-endpoint">/benchpressonly/profile/:username</div>
          </div>
          
          <div class="tool">
            <div class="tool-header">
              <span class="tool-name">get_body_stats</span>
              <span class="tool-method">GET</span>
            </div>
            <p class="tool-description">Body stats (weight, height, BMI)</p>
            <div class="tool-endpoint">/benchpressonly/body/:username</div>
          </div>
          
          <div class="tool">
            <div class="tool-header">
              <span class="tool-name">get_max_lifts</span>
              <span class="tool-method">GET</span>
            </div>
            <p class="tool-description">Estimated 1RMs for all exercises</p>
            <div class="tool-endpoint">/benchpressonly/maxes/:username</div>
          </div>
          
          <div class="tool">
            <div class="tool-header">
              <span class="tool-name">get_streak</span>
              <span class="tool-method">GET</span>
            </div>
            <p class="tool-description">Current and longest workout streak</p>
            <div class="tool-endpoint">/benchpressonly/streak/:username</div>
          </div>
          
          <div class="tool">
            <div class="tool-header">
              <span class="tool-name">get_consistency</span>
              <span class="tool-method">GET</span>
            </div>
            <p class="tool-description">Training consistency stats</p>
            <div class="tool-endpoint">/benchpressonly/consistency/:username?days=90</div>
          </div>
          
          <div class="tool">
            <div class="tool-header">
              <span class="tool-name">get_training_volume</span>
              <span class="tool-method">GET</span>
            </div>
            <p class="tool-description">Training volume stats</p>
            <div class="tool-endpoint">/benchpressonly/volume/:username?days=30</div>
          </div>
          
          <div class="tool">
            <div class="tool-header">
              <span class="tool-name">get_top_exercises</span>
              <span class="tool-method">GET</span>
            </div>
            <p class="tool-description">Most trained exercises</p>
            <div class="tool-endpoint">/benchpressonly/exercises/:username?limit=10</div>
          </div>
          
          <div class="tool">
            <div class="tool-header">
              <span class="tool-name">get_pr_history</span>
              <span class="tool-method">GET</span>
            </div>
            <p class="tool-description">PR history for all exercises</p>
            <div class="tool-endpoint">/benchpressonly/prs/:username</div>
          </div>
          
          <div class="tool">
            <div class="tool-header">
              <span class="tool-name">get_recent_workouts</span>
              <span class="tool-method">GET</span>
            </div>
            <p class="tool-description">Recent completed workouts</p>
            <div class="tool-endpoint">/benchpressonly/workouts/:username?limit=5</div>
          </div>
          
          <div class="tool">
            <div class="tool-header">
              <span class="tool-name">get_coach_summary</span>
              <span class="tool-method">GET</span>
            </div>
            <p class="tool-description">Coaching overview</p>
            <div class="tool-endpoint">/benchpressonly/coach/:username</div>
          </div>
          
          <div class="tool">
            <div class="tool-header">
              <span class="tool-name">get_athlete_progress</span>
              <span class="tool-method">GET</span>
            </div>
            <p class="tool-description">Athlete progress and completion rates</p>
            <div class="tool-endpoint">/benchpressonly/coach/:username/athletes</div>
          </div>
          
          <div class="tool">
            <div class="tool-header">
              <span class="tool-name">get_goals</span>
              <span class="tool-method">GET</span>
            </div>
            <p class="tool-description">Fitness goals and progress</p>
            <div class="tool-endpoint">/benchpressonly/goals/:username?completed=false</div>
          </div>
        </div>
      </div>
    </section>
    
    <section class="section">
      <h2 class="section-title">Example Request</h2>
      <div class="card">
        <div class="tool-endpoint" style="margin-bottom: 16px;">
          GET https://azoni-mcp.onrender.com/benchpressonly/maxes/azoni
        </div>
        <p class="tool-description">Response:</p>
        <pre style="background: #0d0d12; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 0.8rem; color: #888; font-family: 'SF Mono', Monaco, 'Courier New', monospace;">{
  "user": "Charlton Smith",
  "lifts": [
    { "exercise": "Bench Press", "weight": 295, "reps": 3, "estimated1RM": 325 },
    { "exercise": "Squat", "weight": 225, "reps": 5, "estimated1RM": 263 }
  ]
}</pre>
      </div>
    </section>
    
    <footer>
      <p>Built by <a href="https://azoni.ai">Charlton Smith</a> · <a href="https://github.com/yourusername/azoni-mcp">GitHub</a></p>
    </footer>
  </div>
</body>
</html>
`;

// Routes
app.get('/', (req, res) => {
  res.send(landingPageHTML);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/tools', (req, res) => {
  // Return JSON for AI agents
  const tools = [];
  Object.entries(TOOLS).forEach(([domain, data]) => {
    data.tools.forEach(tool => {
      tools.push({
        domain,
        ...tool
      });
    });
  });
  
  res.json({
    name: 'azoni-mcp',
    version: '1.0.0',
    domains: Object.keys(TOOLS),
    totalTools: tools.length,
    tools
  });
});

// Profile & Stats
app.get('/benchpressonly/profile/:username', async (req, res) => {
  try {
    const result = await getUserProfile(req.params.username);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/benchpressonly/body/:username', async (req, res) => {
  try {
    const result = await getBodyStats(req.params.username);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Streaks & Consistency
app.get('/benchpressonly/streak/:username', async (req, res) => {
  try {
    const result = await getStreak(req.params.username);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/benchpressonly/consistency/:username', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const result = await getConsistency(req.params.username, days);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Volume & Exercises
app.get('/benchpressonly/volume/:username', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const result = await getTrainingVolume(req.params.username, days);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/benchpressonly/exercises/:username', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const result = await getTopExercises(req.params.username, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/benchpressonly/prs/:username', async (req, res) => {
  try {
    const exercise = req.query.exercise || null;
    const result = await getPRHistory(req.params.username, exercise);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Workouts
app.get('/benchpressonly/workouts/:username', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const result = await getRecentWorkouts(req.params.username, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Coaching
app.get('/benchpressonly/coach/:username', async (req, res) => {
  try {
    const result = await getCoachSummary(req.params.username);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/benchpressonly/coach/:username/athletes', async (req, res) => {
  try {
    const result = await getAthleteProgress(req.params.username);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Maxes & Goals
app.get('/benchpressonly/maxes/:username', async (req, res) => {
  try {
    const result = await getMaxLifts(req.params.username);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/benchpressonly/goals/:username', async (req, res) => {
  try {
    const includeCompleted = req.query.completed === 'true';
    const result = await getGoals(req.params.username, includeCompleted);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ACTIVITY ============

app.get('/activity/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const source = req.query.source || null;
    const result = await getRecentActivity(Math.min(limit, 100), source);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/activity/costs', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const result = await getCostSummary(Math.min(days, 365));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/activity/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const result = await getActivityStats(Math.min(days, 90));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`azoni-mcp server running on port ${PORT}`);
});