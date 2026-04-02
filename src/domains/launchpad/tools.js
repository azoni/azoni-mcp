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

  // Get all page_view events from launchpad apps in the last 24 hours
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 24h views
  const recentSnap = await db.collection('agent_activity')
    .where('type', '==', 'page_view')
    .where('timestamp', '>=', yesterday)
    .orderBy('timestamp', 'desc')
    .get();

  const recentByApp = {};
  let totalViews24h = 0;

  recentSnap.docs.forEach(doc => {
    const data = doc.data();
    const source = data.source || '';
    if (!source.startsWith('launchpad:')) return;

    const appName = source.replace('launchpad:', '');
    if (!recentByApp[appName]) {
      recentByApp[appName] = { views24h: 0, lastSeen: null };
    }
    recentByApp[appName].views24h++;
    totalViews24h++;

    const ts = data.timestamp?.toDate?.();
    if (ts && (!recentByApp[appName].lastSeen || ts > recentByApp[appName].lastSeen)) {
      recentByApp[appName].lastSeen = ts;
    }
  });

  // Total views (all time) — query with source prefix
  // Firestore doesn't support startsWith, so we use range query
  const allSnap = await db.collection('agent_activity')
    .where('type', '==', 'page_view')
    .where('source', '>=', 'launchpad:')
    .where('source', '<', 'launchpad:\uf8ff')
    .get();

  const totalByApp = {};
  allSnap.docs.forEach(doc => {
    const source = doc.data().source || '';
    const appName = source.replace('launchpad:', '');
    totalByApp[appName] = (totalByApp[appName] || 0) + 1;
  });

  // Merge into apps array
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
    timestamp: new Date().toISOString(),
  };
}
