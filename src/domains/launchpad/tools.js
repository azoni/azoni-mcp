import { getDb, serverTimestamp } from '../../firebase.js';

// ─── In-memory view accumulator ───
// Batches page views and flushes to Firestore every 5 minutes
// instead of writing one doc per page view.

const viewCounters = {};  // { appName: { total: N, pages: { '/': N } } }
const FLUSH_INTERVAL = 5 * 60 * 1000; // 5 minutes

function incrementView(app, page) {
  if (!viewCounters[app]) {
    viewCounters[app] = { total: 0, pages: {} };
  }
  viewCounters[app].total++;
  const p = page || '/';
  viewCounters[app].pages[p] = (viewCounters[app].pages[p] || 0) + 1;
}

async function flushViews() {
  const db = getDb();
  const entries = Object.entries(viewCounters);
  if (entries.length === 0) return;

  const batch = db.batch();
  let flushed = 0;

  for (const [app, data] of entries) {
    if (data.total === 0) continue;

    const ref = db.collection('agent_activity').doc();
    batch.set(ref, {
      type: 'page_view_summary',
      title: `${data.total} page views`,
      source: `launchpad:${app}`,
      description: JSON.stringify(data.pages),
      model: null,
      tokens: null,
      cost: null,
      count: data.total,
      timestamp: serverTimestamp(),
    });
    flushed += data.total;
  }

  if (flushed > 0) {
    await batch.commit();
    // Reset counters
    for (const app of Object.keys(viewCounters)) {
      viewCounters[app] = { total: 0, pages: {} };
    }
  }
}

// Flush every 5 minutes
setInterval(flushViews, FLUSH_INTERVAL);

// Flush on shutdown
process.on('SIGTERM', async () => {
  await flushViews().catch(() => {});
  process.exit(0);
});

// ============ LOG VIEW (now batched) ============

export async function logView({ app, page }) {
  if (!app) throw new Error('app is required');
  incrementView(app, page);
  return { ok: true };
}

// ============ STATS ============

export async function getStats() {
  const db = getDb();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  try {
    // Only query last 7 days of launchpad events (not all-time)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const snap = await db.collection('agent_activity')
      .where('source', '>=', 'launchpad:')
      .where('source', '<', 'launchpad:\uf8ff')
      .where('timestamp', '>=', weekAgo)
      .orderBy('timestamp', 'desc')
      .limit(500)
      .get();

    const recentByApp = {};
    const totalByApp = {};
    let totalViews24h = 0;

    snap.docs.forEach(doc => {
      const data = doc.data();
      const source = data.source || '';
      const appName = source.replace('launchpad:', '');
      const ts = data.timestamp?.toDate?.();

      // For summary docs, use the count field; for old per-view docs, count as 1
      const viewCount = data.count || 1;
      totalByApp[appName] = (totalByApp[appName] || 0) + viewCount;

      if (ts && ts >= yesterday) {
        if (!recentByApp[appName]) {
          recentByApp[appName] = { views24h: 0, lastSeen: null };
        }
        recentByApp[appName].views24h += viewCount;
        totalViews24h += viewCount;

        if (!recentByApp[appName].lastSeen || ts > recentByApp[appName].lastSeen) {
          recentByApp[appName].lastSeen = ts;
        }
      }
    });

    // Add in-memory pending views (not yet flushed)
    for (const [app, data] of Object.entries(viewCounters)) {
      if (data.total > 0) {
        totalByApp[app] = (totalByApp[app] || 0) + data.total;
        if (!recentByApp[app]) {
          recentByApp[app] = { views24h: 0, lastSeen: null };
        }
        recentByApp[app].views24h += data.total;
        totalViews24h += data.total;
      }
    }

    const allAppNames = new Set([...Object.keys(recentByApp), ...Object.keys(totalByApp)]);
    const apps = [...allAppNames].map(name => ({
      name,
      source: `launchpad:${name}`,
      views24h: recentByApp[name]?.views24h || 0,
      viewsTotal: totalByApp[name] || 0,
      lastSeen: recentByApp[name]?.lastSeen?.toISOString() || null,
    })).sort((a, b) => b.views24h - a.views24h);

    return {
      apps,
      totalViews24h,
      totalApps: apps.length,
      timestamp: now.toISOString(),
    };
  } catch (err) {
    console.error('Launchpad getStats error:', err.message);
    return {
      apps: [],
      totalViews24h: 0,
      totalApps: 0,
      timestamp: now.toISOString(),
      error: 'Index building — stats will appear shortly',
    };
  }
}
