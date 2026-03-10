import { getDb } from '../../firebase.js';

const ROW_COLLECTION_CANDIDATES = ['rowing_sessions', 'rowcrew_sessions', 'rowing'];
const AROUND_WORLD_METERS = 40075000;
const SCAN_LIMIT = 50000;
const BATCH_SIZE = 500;

async function countQuery(queryRef) {
  try {
    const countSnap = await queryRef.count().get();
    return countSnap.data().count || 0;
  } catch {
    const snapshot = await queryRef.get();
    return snapshot.size;
  }
}

async function findRowCollection(db) {
  for (const name of ROW_COLLECTION_CANDIDATES) {
    const ref = db.collection(name);
    try {
      const count = await countQuery(ref);
      if (count > 0) return { name, ref, count };
    } catch {
      // Ignore missing/invalid collections and continue trying candidates.
    }
  }
  return null;
}

function extractMeters(data = {}) {
  const directCandidates = [
    data.meters,
    data.distanceMeters,
    data.totalMeters,
    data.sessionMeters,
    data.distance_meters,
    data.ocrMeters,
    data.rowMeters,
    data?.ocr?.meters,
    data?.ocrResult?.meters,
    data?.analysis?.meters,
    data?.metadata?.meters,
  ];

  for (const value of directCandidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }

  // Fallback for generic distance fields with optional unit metadata.
  const distance = Number(data.distance ?? data.distanceValue ?? data.rowDistance);
  if (!Number.isFinite(distance) || distance <= 0) return 0;

  const unit = String(data.distanceUnit || data.unit || data.units || '').toLowerCase();
  if (unit.includes('km')) return Math.round(distance * 1000);
  if (unit.includes('mi')) return Math.round(distance * 1609.34);
  if (unit.includes('m')) return Math.round(distance);

  // If the unit is missing, treat larger values as meters and ignore small ambiguous values.
  return distance >= 200 ? Math.round(distance) : 0;
}

function extractRowerId(data = {}) {
  return data.userId || data.uid || data.athleteId || data.memberId || data.createdBy || null;
}

function toIsoTimestamp(raw) {
  try {
    if (raw?.toDate) return raw.toDate().toISOString();
    if (raw?.seconds) return new Date(raw.seconds * 1000).toISOString();
    if (typeof raw === 'string') {
      const dt = new Date(raw);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
  } catch {
    // Ignore parse errors and return null.
  }
  return null;
}

async function sumRowMetrics(collectionRef, maxDocs = SCAN_LIMIT) {
  let cursor = null;
  let scannedSessions = 0;
  let sessionsWithMeters = 0;
  let totalMeters = 0;
  const uniqueRowers = new Set();

  while (scannedSessions < maxDocs) {
    let q = collectionRef.orderBy('__name__').limit(BATCH_SIZE);
    if (cursor) q = q.startAfter(cursor);

    const snapshot = await q.get();
    if (snapshot.empty) break;

    for (const doc of snapshot.docs) {
      const data = doc.data() || {};
      scannedSessions += 1;

      const meters = extractMeters(data);
      if (meters > 0) {
        sessionsWithMeters += 1;
        totalMeters += meters;
      }

      const rowerId = extractRowerId(data);
      if (rowerId) uniqueRowers.add(String(rowerId));

      if (scannedSessions >= maxDocs) break;
    }

    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < BATCH_SIZE) break;
  }

  return {
    totalMeters,
    scannedSessions,
    sessionsWithMeters,
    uniqueRowers: uniqueRowers.size,
    truncated: scannedSessions >= maxDocs,
  };
}

async function getRecentSessions(collectionRef, limit = 8) {
  try {
    const snapshot = await collectionRef.orderBy('timestamp', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        meters: extractMeters(data),
        timestamp: toIsoTimestamp(data.timestamp),
        userId: extractRowerId(data),
      };
    });
  } catch {
    const snapshot = await collectionRef.orderBy('__name__', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        meters: extractMeters(data),
        timestamp: toIsoTimestamp(data.timestamp),
        userId: extractRowerId(data),
      };
    });
  }
}

export async function getStats() {
  const db = getDb();

  try {
    const found = await findRowCollection(db);
    if (!found) {
      return {
        status: 'no_data',
        message: 'No rowing collections found yet. RowCrew data will appear here once sessions are logged.',
      };
    }

    const { name: collectionName, ref, count: totalSessions } = found;
    const [totals, recentSessions] = await Promise.all([
      sumRowMetrics(ref),
      getRecentSessions(ref),
    ]);

    const progressPercent = totalSessions > 0
      ? Math.min(999.99, Number(((totals.totalMeters / AROUND_WORLD_METERS) * 100).toFixed(2)))
      : 0;

    return {
      status: 'ok',
      collection: collectionName,
      totals: {
        sessions: totalSessions,
        meters: totals.totalMeters,
        kilometers: Number((totals.totalMeters / 1000).toFixed(2)),
        uniqueRowers: totals.uniqueRowers,
      },
      worldGoal: {
        name: 'Around the World',
        meters: AROUND_WORLD_METERS,
        metersRemaining: Math.max(0, AROUND_WORLD_METERS - totals.totalMeters),
        progressPercent,
        loopsCompleted: Number((totals.totalMeters / AROUND_WORLD_METERS).toFixed(3)),
      },
      scan: {
        scannedSessions: totals.scannedSessions,
        sessionsWithMeters: totals.sessionsWithMeters,
        truncated: totals.truncated,
      },
      recentSessions,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}
