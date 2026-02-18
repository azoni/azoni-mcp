const OWT_BACKEND_URL = process.env.OWT_BACKEND_URL || 'https://oldwaystoday-backend.onrender.com';

export async function getHealth() {
  try {
    const res = await fetch(`${OWT_BACKEND_URL}/health`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`OWT health check failed: ${res.status}`);
    return await res.json();
  } catch (error) {
    // Reachability fallback — report as down rather than crashing
    return {
      status: 'unreachable',
      error: error.message,
      url: OWT_BACKEND_URL,
      checkedAt: new Date().toISOString(),
    };
  }
}
