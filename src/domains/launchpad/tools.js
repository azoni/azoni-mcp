import { getDb, serverTimestamp } from '../../firebase.js';

// ============ LOG VIEW ============

export async function logView({ app, page }) {
  if (!app) throw new Error('app is required');

  const db = getDb();
  const source = `launchpad:${app}`;

  const doc = {
    type: 'page_view',
    title: `${app} page view`,
    source,
    description: page || '/',
    model: null,
    tokens: null,
    cost: null,
    timestamp: serverTimestamp(),
  };

  const ref = await db.collection('agent_activity').add(doc);
  return { id: ref.id, ok: true };
}

// ============ STATS ============

export async function getStats() {
  const db = getDb();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  try {
    // Query all launchpad events using source range (avoids compound index issues)
    const allSnap = await db.collection('agent_activity')
      .where('source', '>=', 'launchpad:')
      .where('source', '<', 'launchpad:\uf8ff')
      .get();

    const recentByApp = {};
    const totalByApp = {};
    let totalViews24h = 0;

    allSnap.docs.forEach(doc => {
      const data = doc.data();
      const source = data.source || '';
      const appName = source.replace('launchpad:', '');

      // Count total
      totalByApp[appName] = (totalByApp[appName] || 0) + 1;

      // Count 24h
      const ts = data.timestamp?.toDate?.();
      if (ts && ts >= yesterday) {
        if (!recentByApp[appName]) {
          recentByApp[appName] = { views24h: 0, lastSeen: null };
        }
        recentByApp[appName].views24h++;
        totalViews24h++;

        if (!recentByApp[appName].lastSeen || ts > recentByApp[appName].lastSeen) {
          recentByApp[appName].lastSeen = ts;
        }
      }
    });

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
    // Fallback: return empty stats if indexes aren't ready
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
