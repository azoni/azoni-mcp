const OWT_BACKEND_URL = process.env.OWT_BACKEND_URL || 'https://oldwaystoday-backend.onrender.com';
const HEALTH_PATHS = ['/health', '/ping'];

async function fetchJson(path, timeoutMs = 10000) {
  const res = await fetch(`${OWT_BACKEND_URL}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`OWT request failed (${path}): ${res.status}`);
  return await res.json();
}

export async function getHealth() {
  for (const path of HEALTH_PATHS) {
    try {
      const data = await fetchJson(path);
      return {
        ...data,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      // Try next health path.
    }
  }

  return {
    status: 'unreachable',
    error: 'OWT health endpoint unreachable',
    url: OWT_BACKEND_URL,
    checkedAt: new Date().toISOString(),
  };
}

function normalizeStats(payload = {}) {
  const stats = payload.stats || payload.usage || payload;
  const totalRequests = Number(stats.total_requests ?? stats.totalRequests ?? 0);
  const totalInputTokens = Number(stats.total_input_tokens ?? stats.totalInputTokens ?? 0);
  const totalOutputTokens = Number(stats.total_output_tokens ?? stats.totalOutputTokens ?? 0);
  const totalCost = Number(stats.total_cost ?? stats.totalCost ?? 0);

  return {
    status: 'ok',
    totals: {
      requests: Number.isFinite(totalRequests) ? totalRequests : 0,
      inputTokens: Number.isFinite(totalInputTokens) ? totalInputTokens : 0,
      outputTokens: Number.isFinite(totalOutputTokens) ? totalOutputTokens : 0,
      totalCost: Number.isFinite(totalCost) ? totalCost : 0,
    },
    startedAt: stats.started_at || stats.startedAt || null,
    updatedAt: new Date().toISOString(),
  };
}

export async function getStats() {
  try {
    const statsPayload = await fetchJson('/stats');
    return normalizeStats(statsPayload);
  } catch {
    // Fallback to health payload if /stats is unavailable in this backend deployment.
    try {
      const healthPayload = await getHealth();
      return normalizeStats(healthPayload);
    } catch (error) {
      return {
        status: 'unreachable',
        error: error.message,
        url: OWT_BACKEND_URL,
        updatedAt: new Date().toISOString(),
      };
    }
  }
}
