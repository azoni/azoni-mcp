import { getDb, serverTimestamp } from '../../firebase.js';

// ============ RECENT ACTIVITY ============

export async function getRecentActivity(limitCount = 20, source = null) {
  const db = getDb();
  let q = db.collection('agent_activity')
    .orderBy('timestamp', 'desc')
    .limit(limitCount);

  if (source) {
    q = db.collection('agent_activity')
      .where('source', '==', source)
      .orderBy('timestamp', 'desc')
      .limit(limitCount);
  }

  const snapshot = await q.get();
  const activities = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      type: data.type,
      title: data.title,
      description: data.description || '',
      source: data.source || 'unknown',
      model: data.model || null,
      tokens: data.tokens || null,
      cost: data.cost ?? null,
      timestamp: data.timestamp?.toDate?.().toISOString() || null,
    };
  });

  return {
    count: activities.length,
    activities,
  };
}

// ============ COST SUMMARY ============

export async function getCostSummary(days = 30) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const snapshot = await db.collection('agent_activity')
    .where('timestamp', '>=', cutoff)
    .orderBy('timestamp', 'desc')
    .get();

  let totalCost = 0;
  let totalTokens = 0;
  let totalEvents = 0;
  const bySource = {};
  const byModel = {};
  const byType = {};

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const cost = data.cost ?? 0;
    const tokens = data.tokens?.total ?? 0;
    const source = data.source || 'unknown';
    const model = data.model || 'unknown';
    const type = data.type || 'unknown';

    totalCost += cost;
    totalTokens += tokens;
    totalEvents++;

    // By source
    if (!bySource[source]) bySource[source] = { events: 0, cost: 0, tokens: 0 };
    bySource[source].events++;
    bySource[source].cost += cost;
    bySource[source].tokens += tokens;

    // By model
    if (data.model) {
      if (!byModel[model]) byModel[model] = { events: 0, cost: 0, tokens: 0 };
      byModel[model].events++;
      byModel[model].cost += cost;
      byModel[model].tokens += tokens;
    }

    // By type
    if (!byType[type]) byType[type] = { events: 0, cost: 0 };
    byType[type].events++;
    byType[type].cost += cost;
  });

  // Round costs
  const round = (n) => Math.round(n * 1000000) / 1000000;

  return {
    period: `${days} days`,
    totalCost: `$${round(totalCost)}`,
    totalTokens,
    totalEvents,
    bySource: Object.fromEntries(
      Object.entries(bySource).map(([k, v]) => [k, { ...v, cost: `$${round(v.cost)}` }])
    ),
    byModel: Object.fromEntries(
      Object.entries(byModel).map(([k, v]) => [k, { ...v, cost: `$${round(v.cost)}` }])
    ),
    byType: Object.fromEntries(
      Object.entries(byType)
        .sort((a, b) => b[1].events - a[1].events)
        .map(([k, v]) => [k, { ...v, cost: `$${round(v.cost)}` }])
    ),
  };
}

// ============ LOG ACTIVITY (WRITE) ============

export async function logActivity({ type, title, description, source, model, tokens, cost }) {
  if (!type || !title || !source) {
    throw new Error('Missing required fields: type, title, source');
  }

  const db = getDb();
  const doc = {
    type,
    title,
    source,
    description: description || '',
    model: model || null,
    tokens: tokens || null,
    cost: cost ?? null,
    timestamp: serverTimestamp(),
  };

  const ref = await db.collection('agent_activity').add(doc);
  return { id: ref.id, ...doc, timestamp: new Date().toISOString() };
}

// ============ ACTIVITY STATS ============

export async function getActivityStats(days = 7) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const snapshot = await db.collection('agent_activity')
    .where('timestamp', '>=', cutoff)
    .orderBy('timestamp', 'desc')
    .get();

  const dailyCounts = {};
  let mostActiveSource = {};

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const date = data.timestamp?.toDate?.();
    if (!date) return;

    const dayKey = date.toISOString().split('T')[0];
    if (!dailyCounts[dayKey]) dailyCounts[dayKey] = 0;
    dailyCounts[dayKey]++;

    const source = data.source || 'unknown';
    if (!mostActiveSource[source]) mostActiveSource[source] = 0;
    mostActiveSource[source]++;
  });

  const topSource = Object.entries(mostActiveSource)
    .sort((a, b) => b[1] - a[1])[0];

  return {
    period: `${days} days`,
    totalEvents: snapshot.size,
    avgPerDay: snapshot.size > 0 ? Math.round((snapshot.size / days) * 10) / 10 : 0,
    mostActiveSource: topSource ? { source: topSource[0], events: topSource[1] } : null,
    dailyBreakdown: dailyCounts,
  };
}