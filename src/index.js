import express from 'express';
import cors from 'cors';
import { initializeFirebase } from './firebase.js';
import { authMiddleware } from './middleware/auth.js';
import { globalLimiter, writeLimiter } from './middleware/rateLimit.js';

// Domain imports
import {
  getUserProfile, getBodyStats, getStreak, getConsistency,
  getTrainingVolume, getTopExercises, getPRHistory, getRecentWorkouts,
  getCoachSummary, getAthleteProgress, getMaxLifts, getGoals,
} from './domains/benchpressonly/tools.js';
import {
  getRecentActivity, getCostSummary, getActivityStats, logActivity,
} from './domains/activity/tools.js';
import {
  getStatus as getSpellBrigadeStatus, getLeaderboard,
} from './domains/spellbrigade/tools.js';
import { getHealth as getOWTHealth } from './domains/oldwaystoday/tools.js';
import {
  getStatus as getMoltbookStatus, getActivity as getMoltbookActivity,
  getConfig as getMoltbookConfig, getFeed as getMoltbookFeed,
  getFirestoreUsage as getMoltbookFirestoreUsage, getJobs as getMoltbookJobs,
  triggerRun, createPost, createComment, updateConfig,
} from './domains/moltbook/tools.js';
import {
  getModels as getEmbedRouteModels, createEmbeddings,
} from './domains/embedroute/tools.js';
import { getStats as getRowCrewStats } from './domains/rowcrew/tools.js';

initializeFirebase();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const ALLOWED_ORIGINS = [
  'https://azoni.ai', 'https://www.azoni.ai',
  'https://oldwaystoday.com', 'https://www.oldwaystoday.com',
  'https://embedroute.com', 'https://www.embedroute.com',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server (no origin) and localhost
    if (!origin || origin.startsWith('http://localhost')) {
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
}));

app.use(express.json());
app.use(globalLimiter);
app.use(writeLimiter);
app.use(authMiddleware);

// Tool definitions
const TOOLS = {
  benchpressonly: {
    name: 'BenchPressOnly',
    description: 'Fitness tracking and coaching analytics',
    tools: [
      { name: 'get_user_profile', method: 'GET', endpoint: '/benchpressonly/profile/:username', description: 'User profile and basic stats', params: ['username'] },
      { name: 'get_body_stats', method: 'GET', endpoint: '/benchpressonly/body/:username', description: 'Body stats (weight, height, BMI)', params: ['username'] },
      { name: 'get_streak', method: 'GET', endpoint: '/benchpressonly/streak/:username', description: 'Current and longest workout streak', params: ['username'] },
      { name: 'get_consistency', method: 'GET', endpoint: '/benchpressonly/consistency/:username', description: 'Training consistency stats', params: ['username'], query: ['days'] },
      { name: 'get_training_volume', method: 'GET', endpoint: '/benchpressonly/volume/:username', description: 'Training volume stats', params: ['username'], query: ['days'] },
      { name: 'get_top_exercises', method: 'GET', endpoint: '/benchpressonly/exercises/:username', description: 'Most trained exercises', params: ['username'], query: ['limit'] },
      { name: 'get_pr_history', method: 'GET', endpoint: '/benchpressonly/prs/:username', description: 'PR history for all exercises', params: ['username'], query: ['exercise'] },
      { name: 'get_recent_workouts', method: 'GET', endpoint: '/benchpressonly/workouts/:username', description: 'Recent completed workouts', params: ['username'], query: ['limit'] },
      { name: 'get_coach_summary', method: 'GET', endpoint: '/benchpressonly/coach/:username', description: 'Coaching overview', params: ['username'] },
      { name: 'get_athlete_progress', method: 'GET', endpoint: '/benchpressonly/coach/:username/athletes', description: 'Athlete progress and completion rates', params: ['username'] },
      { name: 'get_max_lifts', method: 'GET', endpoint: '/benchpressonly/maxes/:username', description: 'Estimated 1RMs for all exercises', params: ['username'] },
      { name: 'get_goals', method: 'GET', endpoint: '/benchpressonly/goals/:username', description: 'Fitness goals and progress', params: ['username'], query: ['completed'] },
    ]
  },
  activity: {
    name: 'AI Activity',
    description: 'Cross-app AI activity feed and cost tracking',
    tools: [
      { name: 'get_recent_activity', method: 'GET', endpoint: '/activity/recent', description: 'Recent AI activity across all apps', query: ['limit', 'source'] },
      { name: 'get_cost_summary', method: 'GET', endpoint: '/activity/costs', description: 'AI cost breakdown by source, model, and type', query: ['days'] },
      { name: 'get_activity_stats', method: 'GET', endpoint: '/activity/stats', description: 'Activity frequency and trends', query: ['days'] },
      { name: 'log_activity', method: 'POST', endpoint: '/activity/log', description: 'Log an event to the activity feed (admin only)', body: ['type', 'title', 'source', 'description', 'model', 'tokens', 'cost'] },
    ]
  },
  spellbrigade: {
    name: 'Spell Brigade',
    description: 'Multiplayer word-spell battle game',
    tools: [
      { name: 'get_status', method: 'GET', endpoint: '/spellbrigade/status', description: 'Game server status' },
      { name: 'get_leaderboard', method: 'GET', endpoint: '/spellbrigade/leaderboard', description: 'Player leaderboard' },
    ]
  },
  oldwaystoday: {
    name: 'Old Ways Today',
    description: 'Cultural heritage recipe platform',
    tools: [
      { name: 'get_health', method: 'GET', endpoint: '/oldwaystoday/health', description: 'Backend health check with reachability fallback' },
    ]
  },
  moltbook: {
    name: 'Moltbook Agent',
    description: 'Autonomous social media agent for Moltbook platform',
    tools: [
      { name: 'get_status', method: 'GET', endpoint: '/moltbook/status', description: 'Agent status and uptime' },
      { name: 'get_activity', method: 'GET', endpoint: '/moltbook/activity', description: 'Recent agent actions' },
      { name: 'get_config', method: 'GET', endpoint: '/moltbook/config', description: 'Agent configuration' },
      { name: 'get_feed', method: 'GET', endpoint: '/moltbook/feed', description: 'Moltbook feed data' },
      { name: 'get_firestore_usage', method: 'GET', endpoint: '/moltbook/firestore-usage', description: 'Firestore read/write usage' },
      { name: 'get_jobs', method: 'GET', endpoint: '/moltbook/jobs', description: 'Scheduled and recent jobs' },
      { name: 'trigger_run', method: 'POST', endpoint: '/moltbook/run', description: 'Trigger an agent run (admin only)' },
      { name: 'create_post', method: 'POST', endpoint: '/moltbook/post', description: 'Create a Moltbook post (admin only)' },
      { name: 'create_comment', method: 'POST', endpoint: '/moltbook/comment', description: 'Post a comment (admin only)' },
      { name: 'update_config', method: 'PATCH', endpoint: '/moltbook/config', description: 'Update agent configuration (admin only)' },
    ]
  },
  embedroute: {
    name: 'EmbedRoute',
    description: 'Unified embedding API router',
    tools: [
      { name: 'get_models', method: 'GET', endpoint: '/embedroute/models', description: 'Available embedding models' },
      { name: 'create_embeddings', method: 'POST', endpoint: '/embedroute/embeddings', description: 'Generate embeddings (admin only)' },
    ]
  },
  rowcrew: {
    name: 'RowCrew',
    description: 'Rowing fitness tracker',
    tools: [
      { name: 'get_stats', method: 'GET', endpoint: '/rowcrew/stats', description: 'Rowing statistics summary' },
    ]
  },
};

// Landing page HTML
function buildLandingPage() {
  const domainCards = Object.entries(TOOLS).map(([key, domain]) => {
    const toolItems = domain.tools.map(t => {
      const method = t.method || 'GET';
      const methodClass = method === 'GET' ? '' : ' style="background:rgba(255,179,71,0.1);color:#ffb347;"';
      return `
          <div class="tool">
            <div class="tool-header">
              <span class="tool-name">${t.name}</span>
              <span class="tool-method"${methodClass}>${method}</span>
            </div>
            <p class="tool-description">${t.description}</p>
            <div class="tool-endpoint">${t.endpoint}</div>
          </div>`;
    }).join('');

    return `
      <div class="card">
        <div class="card-header">
          <span class="domain-name">${domain.name}</span>
          <span class="domain-badge">${domain.tools.length} tool${domain.tools.length !== 1 ? 's' : ''}</span>
        </div>
        <p class="domain-description">${domain.description}</p>
        <div class="tools-grid">${toolItems}
        </div>
      </div>`;
  }).join('\n');

  const totalTools = Object.values(TOOLS).reduce((sum, d) => sum + d.tools.length, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Azoni MCP Server</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e0e0e0; line-height: 1.6; min-height: 100vh; }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    header { text-align: center; margin-bottom: 60px; padding-bottom: 40px; border-bottom: 1px solid #1a1a2e; }
    .logo { font-size: 2.5rem; font-weight: 700; background: linear-gradient(135deg, #ff7a5c 0%, #ffb347 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 10px; }
    .tagline { color: #888; font-size: 1.1rem; }
    .status-badge { display: inline-flex; align-items: center; gap: 8px; margin-top: 20px; padding: 8px 16px; background: rgba(78,205,196,0.1); border: 1px solid rgba(78,205,196,0.3); border-radius: 20px; font-size: 0.85rem; color: #4ecdc4; }
    .status-dot { width: 8px; height: 8px; background: #4ecdc4; border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
    .section { margin-bottom: 50px; }
    .section-title { font-size: 1.3rem; font-weight: 600; margin-bottom: 20px; color: #fff; display: flex; align-items: center; gap: 10px; }
    .section-title::before { content: ''; width: 4px; height: 20px; background: linear-gradient(135deg, #ff7a5c, #ffb347); border-radius: 2px; }
    .card { background: #12121a; border: 1px solid #1a1a2e; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .domain-name { font-size: 1.1rem; font-weight: 600; color: #fff; }
    .domain-badge { font-size: 0.75rem; padding: 4px 10px; background: rgba(255,122,92,0.15); border: 1px solid rgba(255,122,92,0.3); border-radius: 4px; color: #ff7a5c; }
    .domain-description { color: #888; font-size: 0.9rem; margin-bottom: 20px; }
    .tools-grid { display: grid; gap: 12px; }
    .tool { background: #0a0a0f; border: 1px solid #1a1a2e; border-radius: 8px; padding: 16px; transition: all 0.2s; }
    .tool:hover { border-color: #2a2a3e; transform: translateX(4px); }
    .tool-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .tool-name { font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 0.85rem; color: #4ecdc4; font-weight: 500; }
    .tool-method { font-size: 0.7rem; padding: 2px 6px; background: rgba(78,205,196,0.1); border-radius: 3px; color: #4ecdc4; font-weight: 600; }
    .tool-description { font-size: 0.85rem; color: #888; margin-bottom: 10px; }
    .tool-endpoint { font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 0.8rem; color: #666; background: #0d0d12; padding: 8px 12px; border-radius: 4px; overflow-x: auto; }
    .quick-links { display: flex; gap: 12px; flex-wrap: wrap; }
    .quick-link { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; background: #12121a; border: 1px solid #1a1a2e; border-radius: 8px; color: #e0e0e0; text-decoration: none; font-size: 0.9rem; transition: all 0.2s; }
    .quick-link:hover { border-color: #ff7a5c; color: #ff7a5c; }
    .quick-link code { font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 0.8rem; color: #888; }
    footer { text-align: center; padding-top: 40px; border-top: 1px solid #1a1a2e; color: #666; font-size: 0.85rem; }
    footer a { color: #ff7a5c; text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    .info-box { background: rgba(78,205,196,0.05); border: 1px solid rgba(78,205,196,0.2); border-radius: 8px; padding: 16px 20px; margin-bottom: 30px; font-size: 0.9rem; color: #aaa; }
    .info-box strong { color: #4ecdc4; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">azoni-mcp</div>
      <p class="tagline">MCP Server for AI Agents &middot; ${totalTools} tools across ${Object.keys(TOOLS).length} domains</p>
      <div class="status-badge">
        <span class="status-dot"></span>
        <span>Operational</span>
      </div>
    </header>

    <div class="info-box">
      <strong>What is this?</strong> An MCP-style server that exposes live data from all of Charlton's projects to AI agents.
      Used by the chatbot at <a href="https://azoni.ai/chat" style="color:#4ecdc4;">azoni.ai/chat</a> and the autonomous orchestrator to read and act on real-time data.
      All endpoints require an API key via <code style="color:#4ecdc4;">Authorization: Bearer &lt;key&gt;</code>.
    </div>

    <section class="section">
      <h2 class="section-title">Quick Links</h2>
      <div class="quick-links">
        <a href="/health" class="quick-link">Health Check <code>/health</code></a>
        <a href="/tools" class="quick-link">Tool Discovery <code>/tools</code></a>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Available Domains</h2>
      ${domainCards}
    </section>

    <footer>
      <p>Built by <a href="https://azoni.ai">Charlton Smith</a></p>
    </footer>
  </div>
</body>
</html>`;
}

// ============ PUBLIC ROUTES ============

app.get('/', (req, res) => {
  res.send(buildLandingPage());
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    domains: Object.keys(TOOLS),
  });
});

app.get('/tools', (req, res) => {
  const tools = [];
  Object.entries(TOOLS).forEach(([domain, data]) => {
    data.tools.forEach(tool => {
      tools.push({ domain, ...tool });
    });
  });

  res.json({
    name: 'azoni-mcp',
    version: '2.0.0',
    domains: Object.keys(TOOLS),
    totalTools: tools.length,
    tools,
  });
});

// ============ BENCHPRESSONLY ============

app.get('/benchpressonly/profile/:username', async (req, res) => {
  try { res.json(await getUserProfile(req.params.username)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/benchpressonly/body/:username', async (req, res) => {
  try { res.json(await getBodyStats(req.params.username)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/benchpressonly/streak/:username', async (req, res) => {
  try { res.json(await getStreak(req.params.username)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/benchpressonly/consistency/:username', async (req, res) => {
  try { res.json(await getConsistency(req.params.username, parseInt(req.query.days) || 90)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/benchpressonly/volume/:username', async (req, res) => {
  try { res.json(await getTrainingVolume(req.params.username, parseInt(req.query.days) || 30)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/benchpressonly/exercises/:username', async (req, res) => {
  try { res.json(await getTopExercises(req.params.username, parseInt(req.query.limit) || 10)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/benchpressonly/prs/:username', async (req, res) => {
  try { res.json(await getPRHistory(req.params.username, req.query.exercise || null)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/benchpressonly/workouts/:username', async (req, res) => {
  try { res.json(await getRecentWorkouts(req.params.username, parseInt(req.query.limit) || 5)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/benchpressonly/coach/:username', async (req, res) => {
  try { res.json(await getCoachSummary(req.params.username)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/benchpressonly/coach/:username/athletes', async (req, res) => {
  try { res.json(await getAthleteProgress(req.params.username)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/benchpressonly/maxes/:username', async (req, res) => {
  try { res.json(await getMaxLifts(req.params.username)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/benchpressonly/goals/:username', async (req, res) => {
  try { res.json(await getGoals(req.params.username, req.query.completed === 'true')); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// ============ ACTIVITY ============

app.get('/activity/recent', async (req, res) => {
  try { res.json(await getRecentActivity(Math.min(parseInt(req.query.limit) || 20, 100), req.query.source || null)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/activity/costs', async (req, res) => {
  try { res.json(await getCostSummary(Math.min(parseInt(req.query.days) || 30, 365))); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/activity/stats', async (req, res) => {
  try { res.json(await getActivityStats(Math.min(parseInt(req.query.days) || 7, 90))); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/activity/log', async (req, res) => {
  try { res.json(await logActivity(req.body)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

// ============ SPELL BRIGADE ============

app.get('/spellbrigade/status', async (req, res) => {
  try { res.json(await getSpellBrigadeStatus()); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/spellbrigade/leaderboard', async (req, res) => {
  try { res.json(await getLeaderboard()); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

// ============ OLD WAYS TODAY ============

app.get('/oldwaystoday/health', async (req, res) => {
  try { res.json(await getOWTHealth()); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

// ============ MOLTBOOK ============

app.get('/moltbook/status', async (req, res) => {
  try { res.json(await getMoltbookStatus()); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/moltbook/activity', async (req, res) => {
  try { res.json(await getMoltbookActivity()); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/moltbook/config', async (req, res) => {
  try { res.json(await getMoltbookConfig()); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/moltbook/feed', async (req, res) => {
  try { res.json(await getMoltbookFeed()); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/moltbook/firestore-usage', async (req, res) => {
  try { res.json(await getMoltbookFirestoreUsage()); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/moltbook/jobs', async (req, res) => {
  try { res.json(await getMoltbookJobs()); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.post('/moltbook/run', async (req, res) => {
  try { res.json(await triggerRun(req.body)); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.post('/moltbook/post', async (req, res) => {
  try { res.json(await createPost(req.body)); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.post('/moltbook/comment', async (req, res) => {
  try { res.json(await createComment(req.body)); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.patch('/moltbook/config', async (req, res) => {
  try { res.json(await updateConfig(req.body)); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

// ============ EMBEDROUTE ============

app.get('/embedroute/models', async (req, res) => {
  try { res.json(await getEmbedRouteModels()); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.post('/embedroute/embeddings', async (req, res) => {
  try { res.json(await createEmbeddings(req.body)); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

// ============ ROWCREW ============

app.get('/rowcrew/stats', async (req, res) => {
  try { res.json(await getRowCrewStats()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// ============ START ============

app.listen(PORT, () => {
  console.log(`azoni-mcp v2.0 running on port ${PORT}`);
  console.log(`Domains: ${Object.keys(TOOLS).join(', ')}`);
  console.log(`Auth: ${process.env.MCP_READ_KEY ? 'enabled' : 'WARNING — no MCP_READ_KEY set'}`);
});
