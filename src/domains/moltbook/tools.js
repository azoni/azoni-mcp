const MOLTBOOK_AGENT_URL = process.env.MOLTBOOK_AGENT_URL || 'https://azoni-moltbook-agent.onrender.com';
const MOLTBOOK_ADMIN_KEY = process.env.MOLTBOOK_ADMIN_KEY;

// ============ READ ENDPOINTS ============

async function moltGet(path) {
  const res = await fetch(`${MOLTBOOK_AGENT_URL}${path}`);
  if (!res.ok) throw new Error(`Moltbook ${path} failed: ${res.status}`);
  return res.json();
}

export const getStatus = () => moltGet('/status');
export const getActivity = () => moltGet('/activity');
export const getConfig = () => moltGet('/config');
export const getFeed = () => moltGet('/feed');
export const getFirestoreUsage = () => moltGet('/firestore-usage');
export const getJobs = () => moltGet('/jobs');

// ============ WRITE ENDPOINTS ============

async function moltPost(path, body = {}) {
  const res = await fetch(`${MOLTBOOK_AGENT_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(MOLTBOOK_ADMIN_KEY ? { 'X-Admin-Key': MOLTBOOK_ADMIN_KEY } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Moltbook POST ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function moltPatch(path, body = {}) {
  const res = await fetch(`${MOLTBOOK_AGENT_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(MOLTBOOK_ADMIN_KEY ? { 'X-Admin-Key': MOLTBOOK_ADMIN_KEY } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Moltbook PATCH ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export const triggerRun = (body) => moltPost('/run', body);
export const createPost = (body) => moltPost('/post', body);
export const createComment = (body) => moltPost('/comment', body);
export const updateConfig = (body) => moltPatch('/config', body);
