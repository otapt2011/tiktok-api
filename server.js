const http = require('http');
const { createClient } = require('@libsql/client');

const PORT = process.env.PORT || 3000;

// ── Helpers ──────────────────────────────────────────
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ── Discover databases from environment variables ────
function discoverDatabases() {
  const dbs = [];
  for (const key of Object.keys(process.env)) {
    const match = key.match(/^TURSO_DB_(.+)_URL$/);
    if (match) {
      const upper = match[1];
      const name = upper.toLowerCase();
      const url = process.env[key];
      const token = process.env[`TURSO_DB_${upper}_TOKEN`] || '';
      dbs.push({ name, url, token });
    }
  }
  return dbs;
}

// Cache clients
const clientCache = {};
function getClient(dbName) {
  const dbs = discoverDatabases();
  const db = dbs.find(d => d.name === dbName);
  if (!db) return null;
  if (!clientCache[dbName]) {
    clientCache[dbName] = createClient({
      url: db.url,
      authToken: db.token
    });
  }
  return clientCache[dbName];
}

// ── Request handler ──────────────────────────────────
async function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const { pathname, query } = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  // Root
  if (method === 'GET' && pathname === '/') {
    return sendJson(res, 200, {
      status: 'ok',
      message: 'Multi‑database server (Turso) is running',
      endpoints: {
        listDatabases: 'GET /api/databases',
        createDb: 'POST /api/database/:name',
        deleteDb: 'DELETE /api/database/:name',
        query: 'GET /api/:database/query?sql=...',
        exec: 'POST /api/:database/exec  (body: { "sql": "..." })'
      }
    });
  }

  // List databases
  if (method === 'GET' && pathname === '/api/databases') {
    const dbs = discoverDatabases().map(d => d.name);
    return sendJson(res, 200, dbs);
  }

  // Create/Delete (informational)
  const dbMatch = pathname.match(/^\/api\/database\/([^\/]+)$/);
  if (dbMatch) {
    const dbName = dbMatch[1].toLowerCase();
    if (method === 'POST') {
      return sendJson(res, 200, {
        message: 'Create the database in the Turso dashboard, then add URL & token as environment variables.'
      });
    }
    if (method === 'DELETE') {
      return sendJson(res, 200, {
        message: 'Delete the database in the Turso dashboard. Remove its environment variables from Railway.'
      });
    }
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // Read‑only query
  const queryMatch = pathname.match(/^\/api\/([^\/]+)\/query$/);
  if (queryMatch && method === 'GET') {
    const dbName = queryMatch[1].toLowerCase();
    const sql = query.get('sql');
    if (!sql) return sendJson(res, 400, { error: 'Missing ?sql= parameter' });
    if (!/^\s*SELECT\b/i.test(sql)) {
      return sendJson(res, 400, { error: 'Only SELECT queries are allowed on this endpoint' });
    }
    const client = getClient(dbName);
    if (!client) return sendJson(res, 404, { error: `Database '${dbName}' not found` });
    try {
      const result = await client.execute(sql);
      return sendJson(res, 200, result.rows);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // Write / multiple‑statement execution
  const execMatch = pathname.match(/^\/api\/([^\/]+)\/exec$/);
  if (execMatch && method === 'POST') {
    const dbName = execMatch[1].toLowerCase();
    let body;
    try { body = await getRequestBody(req); } catch { return sendJson(res, 400, { error: 'Failed to read body' }); }
    let sql;
    try { sql = JSON.parse(body).sql; } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    if (!sql) return sendJson(res, 400, { error: 'Missing "sql" in body' });

    const client = getClient(dbName);
    if (!client) return sendJson(res, 404, { error: `Database '${dbName}' not found` });

    try {
      // ✅ Use executeMultiple if available (Turso client >= 0.6.0)
      if (typeof client.executeMultiple !== 'function') {
        return sendJson(res, 500, {
          error: 'Server runtime must be upgraded. Replace package.json with "@libsql/client": "^0.6.1", redeploy, then try again.'
        });
      }
      const results = await client.executeMultiple(sql);
      const totalChanges = results.reduce((sum, r) => sum + (r.rowsAffected || 0), 0);
      return sendJson(res, 200, { changes: totalChanges });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // Fallback
  sendJson(res, 404, { error: 'Not found' });
}

// Start
http.createServer(handleRequest).listen(PORT, () => {
  console.log(`🚀 Turso server on port ${PORT}`);
  console.log(`Databases: ${discoverDatabases().map(d => d.name).join(', ') || 'none'}`);
});
