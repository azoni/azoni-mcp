import express from 'express';
import { initializeFirebase } from './firebase.js';
import { getRecentWorkouts, getCoachSummary, getAthleteProgress } from './domains/benchpressonly/tools.js';

initializeFirebase();

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/tools', (req, res) => {
  res.json({
    domains: ['benchpressonly'],
    tools: [
      {
        name: 'get_recent_workouts',
        endpoint: '/benchpressonly/workouts/:username',
        description: 'Get a user\'s recent completed workouts',
      },
      {
        name: 'get_coach_summary',
        endpoint: '/benchpressonly/coach/:username',
        description: 'Get overview of a coach and their groups',
      },
      {
        name: 'get_athlete_progress',
        endpoint: '/benchpressonly/coach/:username/athletes',
        description: 'Get progress of all athletes under a coach',
      },
    ],
  });
});

// First real tool!
app.get('/benchpressonly/workouts/:username', async (req, res) => {
  try {
    const result = await getRecentWorkouts(req.params.username);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

app.listen(PORT, () => {
  console.log(`azoni-mcp server running on port ${PORT}`);
});