const http = require('http');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.sqlite'), { readonly: false });
db.pragma('journal_mode = WAL');

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // Routing
  if (req.method === 'GET' && req.url === '/api/teams') {
    try {
      const teams = db.prepare('SELECT * FROM teams ORDER BY name').all();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(teams));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Fallback
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok' }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
