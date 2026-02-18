const EMBEDROUTE_URL = process.env.EMBEDROUTE_URL || 'https://www.embedroute.com';
const EMBEDROUTE_API_KEY = process.env.EMBEDROUTE_API_KEY;

export async function getModels() {
  const res = await fetch(`${EMBEDROUTE_URL}/api/v1/models`);
  if (!res.ok) throw new Error(`EmbedRoute models failed: ${res.status}`);
  return res.json();
}

export async function createEmbeddings(body) {
  const res = await fetch(`${EMBEDROUTE_URL}/api/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(EMBEDROUTE_API_KEY ? { Authorization: `Bearer ${EMBEDROUTE_API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`EmbedRoute embeddings failed: ${res.status} ${text}`);
  }
  return res.json();
}
