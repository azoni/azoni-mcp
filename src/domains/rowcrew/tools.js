import { getDb } from '../../firebase.js';

const ROW_COLLECTION_CANDIDATES = ['rowing_sessions', 'rowcrew_sessions', 'rowing', 'entries'];
const AROUND_WORLD_METERS = 40075000;
const SCAN_LIMIT = 50000;
const BATCH_SIZE = 500;
const RECENT_LIMIT = 8;

// Fallback project: RowCrew stores data in its own Firebase project.
const ROWCREW_FALLBACK_PROJECT_ID = process.env.ROWCREW_FIREBASE_PROJECT_ID || 'rowing-tracker-c1e5e';
const ROWCREW_FALLBACK_API_KEY = process.env.ROWCREW_FIREBASE_API_KEY || 'AIzaSyCygqkD4bqj4pN1A-_pa9PKJtg8vxTCZDc';
const ROWCREW_FALLBACK_COLLECTION = process.env.ROWCREW_FIREBASE_COLLECTION || 'entries';
const REST_PAGE_SIZE = 500;
const REST_SCAN_LIMIT = 5000;

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

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

  const distance = Number(data.distance ?? data.distanceValue ?? data.rowDistance);
  if (!Number.isFinite(distance) || distance <= 0) return 0;

  const unit = String(data.distanceUnit || data.unit || data.units || '').toLowerCase();
  if (unit.includes('km')) return Math.round(distance * 1000);
  if (unit.includes('mi')) return Math.round(distance * 1609.34);
  if (unit.includes('m')) return Math.round(distance);

  return distance >= 200 ? Math.round(distance) : 0;
}

function extractRowerId(data = {}) {
  return data.userId || data.uid || data.athleteId || data.memberId || data.createdBy || null;
}

function extractTimestamp(data = {}) {
  return firstDefined(
    data.timestamp,
    data.date,
    data.createdAt,
    data.loggedAt,
    data.sessionAt,
    data.updatedAt,
  );
}

function toIsoTimestamp(raw) {
  try {
    if (raw?.toDate) return raw.toDate().toISOString();
    if (raw?.seconds) return new Date(raw.seconds * 1000).toISOString();
    if (raw instanceof Date) return raw.toISOString();
    if (typeof raw === 'string') {
      const dt = new Date(raw);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
  } catch {
    // Ignore parse errors and return null.
  }
  return null;
}

function parseTimestampMs(raw) {
  const iso = toIsoTimestamp(raw);
  if (!iso) return 0;
  return new Date(iso).getTime();
}

function normalizeSession(id, data = {}) {
  return {
    id,
    meters: extractMeters(data),
    timestamp: toIsoTimestamp(extractTimestamp(data)),
    userId: extractRowerId(data),
  };
}

function summarizeRowDocs(rows = [], maxDocs = SCAN_LIMIT) {
  let scannedSessions = 0;
  let sessionsWithMeters = 0;
  let totalMeters = 0;
  const uniqueRowers = new Set();

  for (const row of rows) {
    scannedSessions += 1;

    const meters = extractMeters(row);
    if (meters > 0) {
      sessionsWithMeters += 1;
      totalMeters += meters;
    }

    const rowerId = extractRowerId(row);
    if (rowerId) uniqueRowers.add(String(rowerId));

    if (scannedSessions >= maxDocs) break;
  }

  return {
    totalMeters,
    scannedSessions,
    sessionsWithMeters,
    uniqueRowers: uniqueRowers.size,
    truncated: rows.length > maxDocs,
  };
}

function buildStatsResponse({
  collection,
  totalSessions,
  totals,
  recentSessions,
  source,
}) {
  const progressPercent = totalSessions > 0
    ? Math.min(999.99, round((totals.totalMeters / AROUND_WORLD_METERS) * 100, 2))
    : 0;

  return {
    status: 'ok',
    collection,
    source,
    totals: {
      sessions: totalSessions,
      meters: totals.totalMeters,
      kilometers: round(totals.totalMeters / 1000, 2),
      uniqueRowers: totals.uniqueRowers,
    },
    worldGoal: {
      name: 'Around the World',
      meters: AROUND_WORLD_METERS,
      metersRemaining: Math.max(0, AROUND_WORLD_METERS - totals.totalMeters),
      progressPercent,
      loopsCompleted: round(totals.totalMeters / AROUND_WORLD_METERS, 3),
    },
    scan: {
      scannedSessions: totals.scannedSessions,
      sessionsWithMeters: totals.sessionsWithMeters,
      truncated: totals.truncated,
    },
    recentSessions,
    updatedAt: new Date().toISOString(),
  };
}

async function sumRowMetricsFromCollection(collectionRef, maxDocs = SCAN_LIMIT) {
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

async function getRecentSessionsFromCollection(collectionRef, limit = RECENT_LIMIT) {
  const orderAttempts = ['timestamp', 'date', 'createdAt'];

  for (const field of orderAttempts) {
    try {
      const snapshot = await collectionRef.orderBy(field, 'desc').limit(limit).get();
      return snapshot.docs.map((doc) => normalizeSession(doc.id, doc.data() || {}));
    } catch {
      // Try the next timestamp candidate.
    }
  }

  const snapshot = await collectionRef.orderBy('__name__', 'desc').limit(limit).get();
  return snapshot.docs.map((doc) => normalizeSession(doc.id, doc.data() || {}));
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;

  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return asNumber(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return asNumber(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return Boolean(value.booleanValue);
  if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, 'referenceValue')) return value.referenceValue;

  if (value.mapValue?.fields) {
    const out = {};
    for (const [k, v] of Object.entries(value.mapValue.fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }

  if (Array.isArray(value.arrayValue?.values)) {
    return value.arrayValue.values.map((entry) => decodeFirestoreValue(entry));
  }

  return null;
}

function decodeFirestoreDocument(document) {
  const out = {};

  for (const [field, value] of Object.entries(document?.fields || {})) {
    out[field] = decodeFirestoreValue(value);
  }

  if (!out.id && typeof document?.name === 'string') {
    const parts = document.name.split('/');
    out.id = parts[parts.length - 1];
  }

  return out;
}

function canUseRestFallback() {
  return Boolean(ROWCREW_FALLBACK_PROJECT_ID && ROWCREW_FALLBACK_API_KEY);
}

async function fetchCollectionViaRest(collectionName, maxDocs = REST_SCAN_LIMIT) {
  const docs = [];
  let nextPageToken = null;

  while (docs.length < maxDocs) {
    const pageSize = Math.min(REST_PAGE_SIZE, maxDocs - docs.length);
    const params = new URLSearchParams({
      key: ROWCREW_FALLBACK_API_KEY,
      pageSize: String(pageSize),
    });

    if (nextPageToken) {
      params.set('pageToken', nextPageToken);
    }

    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(ROWCREW_FALLBACK_PROJECT_ID)}/databases/(default)/documents/${encodeURIComponent(collectionName)}?${params.toString()}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });

    if (!response.ok) {
      throw new Error(`Firestore REST ${collectionName} responded ${response.status}`);
    }

    const payload = await response.json();
    const pageDocs = Array.isArray(payload.documents) ? payload.documents : [];
    docs.push(...pageDocs);

    if (!payload.nextPageToken || pageDocs.length === 0) {
      return { docs, truncated: false };
    }

    nextPageToken = payload.nextPageToken;
  }

  return { docs, truncated: true };
}

async function getStatsFromRowCrewFallback() {
  if (!canUseRestFallback()) return null;

  const { docs, truncated } = await fetchCollectionViaRest(ROWCREW_FALLBACK_COLLECTION, REST_SCAN_LIMIT);
  if (!docs.length) return null;

  const rows = docs.map((document) => decodeFirestoreDocument(document));
  const totals = summarizeRowDocs(rows, SCAN_LIMIT);
  totals.truncated = totals.truncated || truncated;

  const recentSessions = rows
    .map((row) => normalizeSession(row.id || null, row))
    .sort((a, b) => parseTimestampMs(b.timestamp) - parseTimestampMs(a.timestamp))
    .slice(0, RECENT_LIMIT);

  return buildStatsResponse({
    collection: `${ROWCREW_FALLBACK_COLLECTION}@${ROWCREW_FALLBACK_PROJECT_ID}`,
    totalSessions: asNumber(rows.length),
    totals,
    recentSessions,
    source: 'firestore-rest-fallback',
  });
}

export async function getStats() {
  const db = getDb();

  try {
    const found = await findRowCollection(db);

    if (found) {
      const { name: collectionName, ref, count: totalSessions } = found;
      const [totals, recentSessions] = await Promise.all([
        sumRowMetricsFromCollection(ref),
        getRecentSessionsFromCollection(ref),
      ]);

      return buildStatsResponse({
        collection: collectionName,
        totalSessions,
        totals,
        recentSessions,
        source: 'primary-firebase',
      });
    }

    const fallback = await getStatsFromRowCrewFallback();
    if (fallback) return fallback;

    return {
      status: 'no_data',
      message: 'No rowing collections found in primary Firebase and RowCrew fallback returned no sessions.',
    };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}
