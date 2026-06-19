const http = require('http');

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

// ── Convert libsql:// to https:// ────────────────────
function getHttpUrl(libsqlUrl) {
  return libsqlUrl.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '');
}

// ── Turso HTTP API caller ────────────────────────────
async function tursoExecute(dbUrl, dbToken, sql) {
  const endpoint = getHttpUrl(dbUrl) + '/v2/pipeline';
  const body = JSON.stringify({
    requests: [
      { type: 'execute', stmt: { sql } },
      { type: 'close' }
    ]
  });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${dbToken}`,
      'Content-Type': 'application/json'
    },
    body
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || `HTTP ${response.status}`);
  }
  const executeResponse = data.results?.[0];
  if (executeResponse?.type === 'error') {
    throw new Error(executeResponse.error?.message || 'Turso pipeline error');
  }
  const executeResult = executeResponse?.response?.result;
  if (!executeResult) {
    throw new Error('Unexpected Turso response format: ' + JSON.stringify(data));
  }
  return executeResult;
}

// ── Smart SQL splitter (handles triggers, strings, parens) ──
function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBlockComment = false;
  let inLineComment = false;
  let parenDepth = 0;
  let beginDepth = 0; // tracks BEGIN...END blocks (for triggers)

  // Simple keyword detection – case‑insensitive
  const isBegin = (word) => /^BEGIN$/i.test(word);
  const isEnd = (word) => /^END$/i.test(word);

  let i = 0;
  while (i < sql.length) {
    const char = sql[i];

    // Handle block comments /* */
    if (!inSingleQuote && !inDoubleQuote && !inLineComment && char === '/' && sql[i + 1] === '*') {
      inBlockComment = true;
      current += '/*';
      i += 2;
      continue;
    }
    if (inBlockComment && char === '*' && sql[i + 1] === '/') {
      inBlockComment = false;
      current += '*/';
      i += 2;
      continue;
    }
    if (inBlockComment) {
      current += char;
      i++;
      continue;
    }

    // Handle line comments --
    if (!inSingleQuote && !inDoubleQuote && !inBlockComment && char === '-' && sql[i + 1] === '-') {
      inLineComment = true;
      current += '--';
      i += 2;
      continue;
    }
    if (inLineComment && char === '\n') {
      inLineComment = false;
      current += char;
      i++;
      continue;
    }
    if (inLineComment) {
      current += char;
      i++;
      continue;
    }

    // Handle quotes
    if (char === "'" && !inDoubleQuote && !inBlockComment && !inLineComment) {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote && !inBlockComment && !inLineComment) {
      inDoubleQuote = !inDoubleQuote;
    }

    // Track parentheses (outside quotes and comments)
    if (!inSingleQuote && !inDoubleQuote && !inBlockComment && !inLineComment) {
      if (char === '(') {
        parenDepth++;
      } else if (char === ')') {
        if (parenDepth > 0) parenDepth--;
      }
    }

    // Track BEGIN/END keywords (simple detection)
    if (!inSingleQuote && !inDoubleQuote && !inBlockComment && !inLineComment) {
      if (char === ';' || char === ' ' || char === '\n' || char === '\t' || char === '\r' || i === sql.length - 1) {
        // Look backward to find a word before this position
        // This is a basic heuristic; we'll just look for keywords when we encounter a semicolon
      }
      // We'll use a simpler approach: whenever we hit a semicolon at top-level (parenDepth==0, beginDepth==0), split
    }

    // Semicolon – split only if we are at top level (outside parens, outside BEGIN...END)
    if (char === ';' && !inSingleQuote && !inDoubleQuote && !inBlockComment && !inLineComment && parenDepth === 0 && beginDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i++;
      // Check for optional whitespace after semicolon – already handled by trim
      continue;
    }

    // Update beginDepth: when we encounter a whole word BEGIN or END outside strings/comments
    if (!inSingleQuote && !inDoubleQuote && !inBlockComment && !inLineComment) {
      // Detect the word "BEGIN" (case-insensitive) – not inside a larger word
      if (char === 'B' || char === 'b') {
        const substr = sql.substring(i, i + 5);
        if (/^BEGIN\b/i.test(substr) && !/[A-Za-z0-9_]/.test(sql[i + 5] || '')) {
          beginDepth++;
        }
      }
      if (char === 'E' || char === 'e') {
        const substr = sql.substring(i, i + 3);
        if (/^END\b/i.test(substr) && !/[A-Za-z0-9_]/.test(sql[i + 3] || '')) {
          if (beginDepth > 0) beginDepth--;
        }
      }
    }

    current += char;
    i++;
  }

  const remaining = current.trim();
  if (remaining) statements.push(remaining);

  return statements.filter(s => s.length > 0);
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

    const dbs = discoverDatabases();
    const db = dbs.find(d => d.name === dbName);
    if (!db) return sendJson(res, 404, { error: `Database '${dbName}' not found` });

    try {
      const result = await tursoExecute(db.url, db.token, sql);
      const rows = result.rows || [];
      return sendJson(res, 200, rows);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // Write / multi‑statement execution
  const execMatch = pathname.match(/^\/api\/([^\/]+)\/exec$/);
  if (execMatch && method === 'POST') {
    const dbName = execMatch[1].toLowerCase();
    let body;
    try { body = await getRequestBody(req); } catch { return sendJson(res, 400, { error: 'Failed to read body' }); }
    let sql;
    try { sql = JSON.parse(body).sql; } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    if (!sql) return sendJson(res, 400, { error: 'Missing "sql" in body' });

    const dbs = discoverDatabases();
    const db = dbs.find(d => d.name === dbName);
    if (!db) return sendJson(res, 404, { error: `Database '${dbName}' not found` });

    try {
      const statements = splitSqlStatements(sql);
      let totalChanges = 0;
      for (const stmt of statements) {
        const result = await tursoExecute(db.url, db.token, stmt);
        totalChanges += result.rows_affected || 0;
      }
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
