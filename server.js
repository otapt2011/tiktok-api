const http = require('http');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'databases');

// Ensure the databases folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Helpers ──────────────────────────────────────────
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getDbPath(name) {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(DATA_DIR, `${safe}.sqlite`);
}

function listDatabases() {
  return fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.sqlite'))
    .map(f => f.replace('.sqlite', ''));
}

// ── Helper to read request body (for POST) ──────────
function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ── Request handler ──────────────────────────────────
async function handleRequest(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // ── Root welcome ───────────────────────────────────
  if (method === 'GET' && pathname === '/') {
    return sendJson(res, 200, {
      status: 'ok',
      message: 'Multi‑database server is running',
      endpoints: {
        listDatabases: 'GET /api/databases',
        createDb: 'POST /api/database/:name',
        deleteDb: 'DELETE /api/database/:name',
        query: 'GET /api/:database/query?sql=...',
        exec: 'POST /api/:database/exec  (body: { "sql": "..." })',
        debug: 'GET /debug'
      }
    });
  }

  // ── 1. List databases ─────────────────────────────
  if (method === 'GET' && pathname === '/api/databases') {
    return sendJson(res, 200, listDatabases());
  }

  // ── 2. Create or Delete database ──────────────────
  const dbMatch = pathname.match(/^\/api\/database\/([^\/]+)$/);
  if (dbMatch) {
    const dbName = dbMatch[1];
    const dbPath = getDbPath(dbName);

    if (method === 'POST') {
      if (fs.existsSync(dbPath)) {
        return sendJson(res, 409, { error: 'Database already exists' });
      }
      try {
        const body = await getRequestBody(req);
        const { schema } = JSON.parse(body);
        if (!schema) return sendJson(res, 400, { error: 'Missing "schema" in request body' });

        const db = new Database(dbPath, { readonly: false });
        db.pragma('journal_mode = WAL');
        db.exec(schema);
        db.close();
        return sendJson(res, 201, { created: dbName });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (method === 'DELETE') {
      if (!fs.existsSync(dbPath)) return sendJson(res, 404, { error: 'Database not found' });
      try {
        fs.unlinkSync(dbPath);
        return sendJson(res, 200, { deleted: dbName });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // ── 3. Query a specific database (read-only) ─────
  const queryMatch = pathname.match(/^\/api\/([^\/]+)\/query$/);
  if (queryMatch && method === 'GET') {
    const dbName = queryMatch[1];
    const sqlQuery = parsedUrl.query.sql;
    if (!sqlQuery) return sendJson(res, 400, { error: 'Missing ?sql= parameter' });

    const dbPath = getDbPath(dbName);
    if (!fs.existsSync(dbPath)) return sendJson(res, 404, { error: `Database '${dbName}' not found` });

    const db = new Database(dbPath, { readonly: true });
    try {
      const stmt = db.prepare(sqlQuery);
      if (!stmt.readonly) {
        throw new Error('Only SELECT queries are allowed');
      }
      const rows = stmt.all();
      db.close();
      return sendJson(res, 200, rows);
    } catch (err) {
      db.close();
      return sendJson(res, 400, { error: err.message });
    }
  }

  // ── 4. Execute write queries ──────────────────────
  const execMatch = pathname.match(/^\/api\/([^\/]+)\/exec$/);
  if (execMatch && method === 'POST') {
    const dbName = execMatch[1];
    const dbPath = getDbPath(dbName);
    if (!fs.existsSync(dbPath)) return sendJson(res, 404, { error: `Database '${dbName}' not found` });

    let body;
    try {
      body = await getRequestBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: 'Failed to read request body' });
    }

    let sql;
    try {
      const parsed = JSON.parse(body);
      sql = parsed.sql;
    } catch (err) {
      return sendJson(res, 400, { error: 'Invalid JSON in request body' });
    }

    if (!sql) return sendJson(res, 400, { error: 'Missing "sql" in request body' });

    const db = new Database(dbPath, { readonly: false });
    try {
      db.exec(sql);
      const changes = db.changes;
      db.close();
      return sendJson(res, 200, { changes });
    } catch (err) {
      db.close();
      return sendJson(res, 400, { error: err.message });
    }
  }

  // ── 5. Debug endpoint (NEW) ───────────────────────
  if (method === 'GET' && pathname === '/debug') {
    const dirContents = fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : [];
    return sendJson(res, 200, {
      dataDir: DATA_DIR,
      exists: fs.existsSync(DATA_DIR),
      files: dirContents
    });
  }

  // Fallback
  sendJson(res, 404, { error: 'Not found' });
}

// ── Start server ─────────────────────────────────────
http.createServer(handleRequest).listen(PORT, () => {
  console.log(`Multi‑database server running on port ${PORT}`);
  console.log(`Databases stored in: ${DATA_DIR}`);
});
