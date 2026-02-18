const MCP_READ_KEY = process.env.MCP_READ_KEY;
const MCP_ADMIN_KEY = process.env.MCP_ADMIN_KEY;

// Paths that skip authentication entirely
const PUBLIC_PATHS = ['/', '/health', '/tools'];

export function authMiddleware(req, res, next) {
  // Public paths bypass auth
  if (PUBLIC_PATHS.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  // Admin key gets full access
  if (MCP_ADMIN_KEY && token === MCP_ADMIN_KEY) {
    req.authLevel = 'admin';
    return next();
  }

  // Read key only allows GET requests
  if (MCP_READ_KEY && token === MCP_READ_KEY) {
    if (req.method !== 'GET') {
      return res.status(403).json({ error: 'Read-only key cannot perform write operations' });
    }
    req.authLevel = 'read';
    return next();
  }

  return res.status(401).json({ error: 'Invalid API key' });
}
