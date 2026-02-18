import { getDb } from '../../firebase.js';

export async function getStats() {
  const db = getDb();

  // Check for rowing-related collections
  // RowCrew shares the same Firebase project (benchonly-7d92a)
  try {
    const collections = ['rowing_sessions', 'rowcrew_sessions', 'rowing'];
    let data = null;

    for (const name of collections) {
      const snapshot = await db.collection(name).limit(1).get();
      if (!snapshot.empty) {
        // Found the collection — pull recent stats
        const recent = await db.collection(name)
          .orderBy('timestamp', 'desc')
          .limit(20)
          .get();

        data = {
          collection: name,
          totalSessions: recent.size,
          recentSessions: recent.docs.map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              ...d,
              timestamp: d.timestamp?.toDate?.().toISOString() || null,
            };
          }),
        };
        break;
      }
    }

    return data || {
      status: 'no_data',
      message: 'No rowing collections found yet. RowCrew data will appear here once sessions are logged.',
    };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}
