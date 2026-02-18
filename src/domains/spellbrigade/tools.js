const SPELL_BRIGADE_URL = process.env.SPELL_BRIGADE_URL || 'https://spell-brigade.onrender.com';

export async function getStatus() {
  const res = await fetch(SPELL_BRIGADE_URL);
  if (!res.ok) throw new Error(`Spell Brigade unreachable: ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { status: 'ok', raw: text.slice(0, 500) };
  }
}

export async function getLeaderboard() {
  const res = await fetch(`${SPELL_BRIGADE_URL}/leaderboard`);
  if (!res.ok) throw new Error(`Spell Brigade leaderboard failed: ${res.status}`);
  return res.json();
}
