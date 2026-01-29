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
      // Profile & Stats
      { name: 'get_user_profile', endpoint: '/benchpressonly/profile/:username', description: 'Get user profile and basic stats' },
      { name: 'get_body_stats', endpoint: '/benchpressonly/body/:username', description: 'Get body stats (weight, height, BMI)' },
      // Streaks & Consistency
      { name: 'get_streak', endpoint: '/benchpressonly/streak/:username', description: 'Get current and longest workout streak' },
      { name: 'get_consistency', endpoint: '/benchpressonly/consistency/:username', description: 'Get training consistency stats' },
      // Volume & Exercises
      { name: 'get_training_volume', endpoint: '/benchpressonly/volume/:username', description: 'Get training volume stats' },
      { name: 'get_top_exercises', endpoint: '/benchpressonly/exercises/:username', description: 'Get most trained exercises' },
      { name: 'get_pr_history', endpoint: '/benchpressonly/prs/:username', description: 'Get PR history for all exercises' },
      // Workouts
      { name: 'get_recent_workouts', endpoint: '/benchpressonly/workouts/:username', description: 'Get recent completed workouts' },
      // Coaching
      { name: 'get_coach_summary', endpoint: '/benchpressonly/coach/:username', description: 'Get coaching overview' },
      { name: 'get_athlete_progress', endpoint: '/benchpressonly/coach/:username/athletes', description: 'Get athlete progress' },
      // Maxes & Goals
      { name: 'get_max_lifts', endpoint: '/benchpressonly/maxes/:username', description: 'Get estimated 1RMs' },
      { name: 'get_goals', endpoint: '/benchpressonly/goals/:username', description: 'Get fitness goals' },
    ],
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

app.listen(PORT, () => {
  console.log(`azoni-mcp server running on port ${PORT}`);
});