const http = require('http');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Connect to the SQLite database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath, { readonly: false });
db.pragma('journal_mode = WAL');

// Auto‑create schema if teams table is missing
const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='teams'").get();
if (!tableCheck) {
  console.log('Initialising full database schema…');
  db.exec(FULL_SCHEMA);
} else {
  console.log('Database schema already present.');
}

// Helper to send JSON
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Router – matches URL path and method
function handleRequest(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const { method, url } = req;

  // Root check
  if (method === 'GET' && url === '/') {
    return sendJson(res, 200, { status: 'ok', message: 'Tournament API running (Node HTTP)' });
  }

  // ── BASIC ENTITIES ──
  if (method === 'GET' && url === '/api/teams') {
    return sendJson(res, 200, db.prepare('SELECT * FROM teams ORDER BY name').all());
  }
  if (method === 'GET' && url === '/api/groups') {
    return sendJson(res, 200, db.prepare('SELECT * FROM groups ORDER BY name').all());
  }
  if (method === 'GET' && url === '/api/stages') {
    return sendJson(res, 200, db.prepare('SELECT * FROM stages ORDER BY "order"').all());
  }
  if (method === 'GET' && url === '/api/stadiums') {
    return sendJson(res, 200, db.prepare(
      'SELECT s.*, c.name AS cityName FROM stadiums s JOIN cities c ON s.cityId = c.id ORDER BY c.name, s.name'
    ).all());
  }
  if (method === 'GET' && url === '/api/cities') {
    return sendJson(res, 200, db.prepare('SELECT * FROM cities ORDER BY name').all());
  }

  // ── STANDINGS ──
  if (method === 'GET' && url === '/api/standings') {
    return sendJson(res, 200, db.prepare('SELECT * FROM group_standings ORDER BY groupId, rank').all());
  }
  if (method === 'GET' && url === '/api/standings/simple') {
    return sendJson(res, 200, db.prepare('SELECT * FROM group_standings_simple').all());
  }
  if (method === 'GET' && url === '/api/standings/full') {
    return sendJson(res, 200, db.prepare('SELECT * FROM group_standings_full ORDER BY groupId, rank').all());
  }
  if (method === 'GET' && url === '/api/best-third') {
    return sendJson(res, 200, db.prepare('SELECT * FROM best_third_placed').all());
  }

  // ── MATCHES ──
  if (method === 'GET' && url === '/api/matches') {
    return sendJson(res, 200, db.prepare('SELECT * FROM match_details_sorted ORDER BY sort_date, time').all());
  }
  if (method === 'GET' && url === '/api/matches/upcoming') {
    return sendJson(res, 200, db.prepare('SELECT * FROM upcoming_matches').all());
  }
  if (method === 'GET' && url === '/api/matches/finished') {
    return sendJson(res, 200, db.prepare('SELECT * FROM finished_matches').all());
  }
  if (method === 'GET' && url === '/api/matches/unified') {
    return sendJson(res, 200, db.prepare('SELECT * FROM unified_matches ORDER BY sort_date, time').all());
  }

  // Single match (by id)
  const matchById = url.match(/^\/api\/match\/(\d+)$/);
  if (method === 'GET' && matchById) {
    const id = matchById[1];
    const row = db.prepare('SELECT * FROM match_details_with_scores WHERE id = ?').get(id);
    return row ? sendJson(res, 200, row) : sendJson(res, 404, { error: 'Match not found' });
  }

  // Match events
  const matchEvents = url.match(/^\/api\/match\/(\d+)\/events$/);
  if (method === 'GET' && matchEvents) {
    const id = matchEvents[1];
    return sendJson(res, 200, db.prepare(
      'SELECT * FROM match_events_details WHERE matchId = ? ORDER BY eventMinute, eventMinuteExtra'
    ).all(id));
  }

  // Match timeline
  const matchTimeline = url.match(/^\/api\/match\/(\d+)\/timeline$/);
  if (method === 'GET' && matchTimeline) {
    const id = matchTimeline[1];
    const row = db.prepare('SELECT timeline FROM match_timeline WHERE matchId = ?').get(id);
    return sendJson(res, 200, row || { timeline: '' });
  }

  // ── KNOCKOUT ──
  if (method === 'GET' && url === '/api/knockout') {
    return sendJson(res, 200, db.prepare('SELECT * FROM knockout_matches_resolved ORDER BY stageOrder, matchNumber').all());
  }
  if (method === 'GET' && url === '/api/knockout/simple') {
    return sendJson(res, 200, db.prepare('SELECT * FROM knockout_matches_resolved_simple ORDER BY matchNumber').all());
  }
  if (method === 'GET' && url === '/api/knockout/flags') {
    return sendJson(res, 200, db.prepare('SELECT * FROM knockout_with_flags ORDER BY stageId, matchNumber').all());
  }

  // ── TEAM DETAILS ──
  const teamHistory = url.match(/^\/api\/team\/(\d+)\/history$/);
  if (method === 'GET' && teamHistory) {
    const id = teamHistory[1];
    return sendJson(res, 200, db.prepare('SELECT * FROM team_match_history WHERE teamId = ? ORDER BY date, time').all(id));
  }
  const teamForm = url.match(/^\/api\/team\/(\d+)\/form$/);
  if (method === 'GET' && teamForm) {
    const id = teamForm[1];
    const row = db.prepare('SELECT form_last5 FROM team_form WHERE teamId = ?').get(id);
    return sendJson(res, 200, row || { form_last5: '' });
  }

  // ── SCORERS / CARDS ──
  if (method === 'GET' && url === '/api/scorers') {
    return sendJson(res, 200, db.prepare('SELECT * FROM top_scorers').all());
  }
  if (method === 'GET' && url === '/api/cards') {
    return sendJson(res, 200, db.prepare('SELECT * FROM card_summary').all());
  }
  if (method === 'GET' && url === '/api/own-goals') {
    return sendJson(res, 200, db.prepare('SELECT * FROM own_goals').all());
  }
  if (method === 'GET' && url === '/api/tournament/progress') {
    return sendJson(res, 200, db.prepare('SELECT * FROM tournament_progress').get());
  }
  if (method === 'GET' && url === '/api/head-to-head') {
    return sendJson(res, 200, db.prepare('SELECT * FROM head_to_head').all());
  }

  // Fallback – 404
  sendJson(res, 404, { error: 'Not found' });
}

// Create and start the server
const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (plain Node HTTP)`);
});

// ---------------------------------------------------------------------------
// Complete schema (tables, indexes, views, triggers)
// ---------------------------------------------------------------------------
const FULL_SCHEMA = `

CREATE TABLE bracket_rules (
    matchNumber INTEGER PRIMARY KEY,
    stageId INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    isodate TEXT NOT NULL,
    stadiumId INTEGER NOT NULL,
    cityId INTEGER NOT NULL,
    homeRule TEXT NOT NULL,
    awayRule TEXT NOT NULL,
    FOREIGN KEY (stageId) REFERENCES stages(id),
    FOREIGN KEY (stadiumId) REFERENCES stadiums(id),
    FOREIGN KEY (cityId) REFERENCES cities(id)
);

CREATE TABLE cities (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE match_events (
    id INTEGER PRIMARY KEY,
    matchId INTEGER NOT NULL,
    teamId INTEGER NOT NULL,
    playerName TEXT NOT NULL,
    eventType TEXT NOT NULL,
    eventMinute INTEGER NOT NULL,
    eventMinuteExtra INTEGER DEFAULT 0,
    additionalInfo TEXT,
    FOREIGN KEY (matchId) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (teamId) REFERENCES teams(id)
);

CREATE TABLE match_scores (
    id INTEGER PRIMARY KEY,
    matchId INTEGER NOT NULL UNIQUE,
    homeScoreFullTime INTEGER DEFAULT 0,
    awayScoreFullTime INTEGER DEFAULT 0,
    homeScoreHalfTime INTEGER,
    awayScoreHalfTime INTEGER,
    homeScoreExtraTime INTEGER,
    awayScoreExtraTime INTEGER,
    homeScorePenalties INTEGER,
    awayScorePenalties INTEGER,
    status TEXT DEFAULT 'scheduled',
    lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (matchId) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE match_timezones (
    id INTEGER PRIMARY KEY,
    utc_string TEXT,
    eat_day TEXT,
    eat_date TEXT,
    eat_time TEXT,
    eat_ampm TEXT,
    est_date TEXT,
    est_time TEXT,
    cst_date TEXT,
    cst_time TEXT,
    pst_date TEXT,
    pst_time TEXT
);

CREATE TABLE matches (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    isodate TEXT NOT NULL,
    homeTeamId INTEGER,
    awayTeamId INTEGER,
    groupId INTEGER,
    stageId INTEGER NOT NULL,
    stadiumId INTEGER NOT NULL,
    cityId INTEGER NOT NULL,
    FOREIGN KEY (homeTeamId) REFERENCES teams(id),
    FOREIGN KEY (awayTeamId) REFERENCES teams(id),
    FOREIGN KEY (groupId) REFERENCES groups(id),
    FOREIGN KEY (stageId) REFERENCES stages(id),
    FOREIGN KEY (stadiumId) REFERENCES stadiums(id),
    FOREIGN KEY (cityId) REFERENCES cities(id)
);

CREATE TABLE stadiums (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    cityId INTEGER NOT NULL,
    FOREIGN KEY (cityId) REFERENCES cities(id)
);

CREATE TABLE stages (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    "order" INTEGER NOT NULL
);

CREATE TABLE teams (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    flag TEXT NOT NULL
);

CREATE INDEX idx_bracket_rules_date ON bracket_rules(date);
CREATE INDEX idx_bracket_rules_isodate ON bracket_rules(isodate);
CREATE INDEX idx_bracket_rules_stage ON bracket_rules(stageId);
CREATE INDEX idx_match_events_match ON match_events(matchId);
CREATE INDEX idx_match_events_team ON match_events(teamId);
CREATE INDEX idx_match_events_type ON match_events(eventType);
CREATE INDEX idx_match_scores_match ON match_scores(matchId);
CREATE INDEX idx_matches_awayTeam ON matches(awayTeamId);
CREATE INDEX idx_matches_city ON matches(cityId);
CREATE INDEX idx_matches_group ON matches(groupId);
CREATE INDEX idx_matches_homeTeam ON matches(homeTeamId);
CREATE INDEX idx_matches_isodate ON matches(isodate);
CREATE INDEX idx_matches_stadium ON matches(stadiumId);
CREATE INDEX idx_matches_stage ON matches(stageId);
CREATE INDEX idx_stadiums_city ON stadiums(cityId);

CREATE VIEW best_third_placed AS
SELECT 
    groupId,
    groupName,
    teamId,
    teamName,
    points,
    goalDifference,
    goalsFor,
    RANK() OVER (ORDER BY points DESC, goalDifference DESC, goalsFor DESC) AS third_rank
FROM group_standings
WHERE rank = 3
ORDER BY points DESC, goalDifference DESC, goalsFor DESC
LIMIT 4;

CREATE VIEW card_summary AS
SELECT
    t.id AS teamId,
    t.name AS teamName,
    SUM(CASE WHEN me.eventType = 'yellow_card' THEN 1 ELSE 0 END) AS yellowCards,
    SUM(CASE WHEN me.eventType = 'red_card' THEN 1 ELSE 0 END) AS redCards
FROM match_events me
JOIN teams t ON me.teamId = t.id
WHERE me.eventType IN ('yellow_card', 'red_card')
GROUP BY me.teamId;

CREATE VIEW current_matchday AS
SELECT 
    stageId,
    stageName,
    MIN(isodate) AS next_match_date,
    (SELECT id FROM match_details WHERE stageId = m.stageId AND isodate = MIN(m.isodate) LIMIT 1) AS next_match_id
FROM match_details m
GROUP BY stageId;

CREATE VIEW finished_matches AS
SELECT * FROM unified_matches
WHERE matchStatus = 'finished'
ORDER BY isodate DESC, time DESC;

CREATE VIEW group_standings AS
SELECT 
    g.id AS groupId,
    g.name AS groupName,
    r.teamId,
    t.name AS teamName,
    t.code AS teamCode,
    t.flag AS teamFlag,
    r.played,
    r.wins,
    r.draws,
    r.losses,
    r.goalsFor,
    r.goalsAgainst,
    r.goalDifference,
    r.points,
    ROW_NUMBER() OVER (
        PARTITION BY r.groupId 
        ORDER BY r.points DESC, r.goalDifference DESC, r.goalsFor DESC
    ) AS rank
FROM group_standings_raw r
JOIN groups g ON r.groupId = g.id
JOIN teams t ON r.teamId = t.id;

CREATE VIEW group_standings_full AS
WITH group_teams AS (
    SELECT DISTINCT m.groupId, t.id AS teamId
    FROM matches m
    JOIN teams t ON t.id = m.homeTeamId OR t.id = m.awayTeamId
    WHERE m.groupId IS NOT NULL
)
SELECT 
    g.id AS groupId,
    g.name AS groupName,
    gt.teamId,
    t.name AS teamName,
    t.code AS teamCode,
    t.flag AS teamFlag,
    COALESCE(r.played, 0) AS played,
    COALESCE(r.wins, 0) AS wins,
    COALESCE(r.draws, 0) AS draws,
    COALESCE(r.losses, 0) AS losses,
    COALESCE(r.goalsFor, 0) AS goalsFor,
    COALESCE(r.goalsAgainst, 0) AS goalsAgainst,
    COALESCE(r.goalDifference, 0) AS goalDifference,
    COALESCE(r.points, 0) AS points,
    ROW_NUMBER() OVER (
        PARTITION BY g.id 
        ORDER BY COALESCE(r.points, 0) DESC, 
                 COALESCE(r.goalDifference, 0) DESC, 
                 COALESCE(r.goalsFor, 0) DESC,
                 t.name ASC
    ) AS rank
FROM groups g
JOIN group_teams gt ON g.id = gt.groupId
JOIN teams t ON gt.teamId = t.id
LEFT JOIN group_standings_raw r ON r.groupId = g.id AND r.teamId = t.id;

CREATE VIEW group_standings_raw AS
SELECT 
    m.groupId,
    t.id AS teamId,
    COUNT(*) AS played,
    SUM(CASE 
        WHEN ms.homeScoreFullTime > ms.awayScoreFullTime AND m.homeTeamId = t.id THEN 1
        WHEN ms.awayScoreFullTime > ms.homeScoreFullTime AND m.awayTeamId = t.id THEN 1
        ELSE 0 
    END) AS wins,
    SUM(CASE 
        WHEN ms.homeScoreFullTime = ms.awayScoreFullTime AND ms.homeScoreFullTime IS NOT NULL THEN 1
        ELSE 0 
    END) AS draws,
    SUM(CASE 
        WHEN ms.homeScoreFullTime < ms.awayScoreFullTime AND m.homeTeamId = t.id THEN 1
        WHEN ms.awayScoreFullTime < ms.homeScoreFullTime AND m.awayTeamId = t.id THEN 1
        ELSE 0 
    END) AS losses,
    SUM(CASE 
        WHEN m.homeTeamId = t.id THEN COALESCE(ms.homeScoreFullTime, 0)
        ELSE COALESCE(ms.awayScoreFullTime, 0)
    END) AS goalsFor,
    SUM(CASE 
        WHEN m.homeTeamId = t.id THEN COALESCE(ms.awayScoreFullTime, 0)
        ELSE COALESCE(ms.homeScoreFullTime, 0)
    END) AS goalsAgainst,
    SUM(CASE 
        WHEN m.homeTeamId = t.id THEN COALESCE(ms.homeScoreFullTime, 0) - COALESCE(ms.awayScoreFullTime, 0)
        ELSE COALESCE(ms.awayScoreFullTime, 0) - COALESCE(ms.homeScoreFullTime, 0)
    END) AS goalDifference,
    SUM(CASE 
        WHEN ms.homeScoreFullTime > ms.awayScoreFullTime AND m.homeTeamId = t.id THEN 3
        WHEN ms.awayScoreFullTime > ms.homeScoreFullTime AND m.awayTeamId = t.id THEN 3
        WHEN ms.homeScoreFullTime = ms.awayScoreFullTime THEN 1
        ELSE 0 
    END) AS points
FROM matches m
JOIN teams t ON (t.id = m.homeTeamId OR t.id = m.awayTeamId)
LEFT JOIN match_scores ms ON m.id = ms.matchId
WHERE m.stageId = 1
  AND m.groupId IS NOT NULL
  AND ms.status = 'finished'
GROUP BY m.groupId, t.id;

CREATE VIEW group_standings_simple AS
SELECT 
    g.name AS groupName,
    t.name AS teamName,
    t.code AS teamCode,
    t.flag AS teamFlag,
    r.played,
    r.wins,
    r.draws,
    r.losses,
    r.goalsFor,
    r.goalsAgainst,
    r.goalDifference,
    r.points
FROM group_standings_raw r
JOIN groups g ON r.groupId = g.id
JOIN teams t ON r.teamId = t.id
ORDER BY g.id, r.points DESC, r.goalDifference DESC, r.goalsFor DESC;

CREATE VIEW head_to_head AS
SELECT 
    t1.name AS team1,
    t2.name AS team2,
    m.isodate AS date,
    m.stageName,
    CASE 
        WHEN m.homeTeam = t1.name AND m.awayTeam = t2.name THEN 'home'
        WHEN m.homeTeam = t2.name AND m.awayTeam = t1.name THEN 'away'
    END AS venue,
    m.homeScoreFullTime,
    m.awayScoreFullTime,
    CASE 
        WHEN (m.homeTeam = t1.name AND m.homeScoreFullTime > m.awayScoreFullTime) OR
             (m.awayTeam = t1.name AND m.awayScoreFullTime > m.homeScoreFullTime) THEN t1.name
        WHEN (m.homeTeam = t2.name AND m.homeScoreFullTime > m.awayScoreFullTime) OR
             (m.awayTeam = t2.name AND m.awayScoreFullTime > m.homeScoreFullTime) THEN t2.name
        ELSE 'Draw'
    END AS winner
FROM match_details m
CROSS JOIN (SELECT name FROM teams) t1
CROSS JOIN (SELECT name FROM teams) t2
WHERE t1.name < t2.name
  AND ((m.homeTeam = t1.name AND m.awayTeam = t2.name) OR
       (m.homeTeam = t2.name AND m.awayTeam = t1.name));

CREATE VIEW knockout_bracket AS
SELECT 
    m.id,
    m.isodate AS date,
    m.time,
    s.name AS stage,
    s."order" AS stageOrder,
    homeTeam.name AS homeTeam,
    awayTeam.name AS awayTeam,
    st.name AS stadium,
    c.name AS city,
    ms.homeScoreFullTime,
    ms.awayScoreFullTime,
    ms.homeScorePenalties,
    ms.awayScorePenalties,
    ms.status
FROM matches m
JOIN stages s ON m.stageId = s.id
LEFT JOIN teams homeTeam ON m.homeTeamId = homeTeam.id
LEFT JOIN teams awayTeam ON m.awayTeamId = awayTeam.id
LEFT JOIN stadiums st ON m.stadiumId = st.id
LEFT JOIN cities c ON m.cityId = c.id
LEFT JOIN match_scores ms ON m.id = ms.matchId
WHERE m.stageId >= 2
ORDER BY s."order", m.id;

CREATE VIEW knockout_matches_resolved AS
SELECT 
    br.matchNumber,
    br.stageId,
    s.name AS stageName,
    br.date,
    br.time,
    br.isodate,
    br.stadiumId,
    br.cityId,
    st.name AS stadium,
    c.name AS city,
    br.homeRule,
    br.awayRule,
    rh.homeTeamId,
    ra.awayTeamId,
    (SELECT name FROM teams WHERE id = rh.homeTeamId) AS homeTeamName,
    (SELECT name FROM teams WHERE id = ra.awayTeamId) AS awayTeamName
FROM bracket_rules br
LEFT JOIN stages s ON br.stageId = s.id
LEFT JOIN stadiums st ON br.stadiumId = st.id
LEFT JOIN cities c ON br.cityId = c.id
LEFT JOIN resolved_home_view rh ON br.matchNumber = rh.matchNumber
LEFT JOIN resolved_away_view ra ON br.matchNumber = ra.matchNumber;

CREATE VIEW knockout_matches_resolved_simple AS
WITH
  match_results AS (
    SELECT 
      m.id AS matchId,
      CASE 
        WHEN ms.homeScoreFullTime > ms.awayScoreFullTime THEN m.homeTeamId
        WHEN ms.awayScoreFullTime > ms.homeScoreFullTime THEN m.awayTeamId
        ELSE NULL
      END AS winnerId,
      CASE 
        WHEN ms.homeScoreFullTime > ms.awayScoreFullTime THEN m.awayTeamId
        WHEN ms.awayScoreFullTime > ms.homeScoreFullTime THEN m.homeTeamId
        ELSE NULL
      END AS loserId
    FROM matches m
    INNER JOIN match_scores ms ON m.id = ms.matchId
    WHERE ms.status = 'finished' AND m.stageId >= 2
  ),
  resolved AS (
    SELECT 
      br.matchNumber,
      'home' AS side,
      CASE
        WHEN br.homeRule GLOB '1[A-Z]' THEN
          (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.homeRule,2) AND rank = 1 LIMIT 1)
        WHEN br.homeRule GLOB '2[A-Z]' THEN
          (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.homeRule,2) AND rank = 2 LIMIT 1)
        WHEN br.homeRule GLOB 'W[0-9]*' THEN
          (SELECT winnerId FROM match_results WHERE matchId = CAST(substr(br.homeRule,2) AS INTEGER))
        WHEN br.homeRule GLOB 'RU[0-9]*' THEN
          (SELECT loserId FROM match_results WHERE matchId = CAST(substr(br.homeRule,3) AS INTEGER))
        ELSE NULL
      END AS teamId
    FROM bracket_rules br
    UNION ALL
    SELECT 
      br.matchNumber,
      'away',
      CASE
        WHEN br.awayRule GLOB '1[A-Z]' THEN
          (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.awayRule,2) AND rank = 1 LIMIT 1)
        WHEN br.awayRule GLOB '2[A-Z]' THEN
          (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.awayRule,2) AND rank = 2 LIMIT 1)
        WHEN br.awayRule GLOB 'W[0-9]*' THEN
          (SELECT winnerId FROM match_results WHERE matchId = CAST(substr(br.awayRule,2) AS INTEGER))
        WHEN br.awayRule GLOB 'RU[0-9]*' THEN
          (SELECT loserId FROM match_results WHERE matchId = CAST(substr(br.awayRule,3) AS INTEGER))
        ELSE NULL
      END AS teamId
    FROM bracket_rules br
  )
SELECT 
  br.matchNumber,
  br.stageId,
  s.name AS stageName,
  br.date,
  br.time,
  br.stadiumId,
  br.cityId,
  st.name AS stadium,
  c.name AS city,
  br.homeRule,
  br.awayRule,
  (SELECT teamId FROM resolved WHERE matchNumber = br.matchNumber AND side = 'home') AS homeTeamId,
  (SELECT teamId FROM resolved WHERE matchNumber = br.matchNumber AND side = 'away') AS awayTeamId,
  (SELECT name FROM teams WHERE id = homeTeamId) AS homeTeamName,
  (SELECT name FROM teams WHERE id = awayTeamId) AS awayTeamName
FROM bracket_rules br
LEFT JOIN stages s ON br.stageId = s.id
LEFT JOIN stadiums st ON br.stadiumId = st.id
LEFT JOIN cities c ON br.cityId = c.id;

CREATE VIEW knockout_with_flags AS
SELECT 
    kmr.matchNumber,
    kmr.stageId,
    kmr.stageName,
    kmr.date,
    kmr.time,
    kmr.isodate,
    kmr.homeTeamName,
    kmr.awayTeamName,
    kmr.homeRule,
    kmr.awayRule,
    kmr.homeTeamId,
    kmr.awayTeamId,
    kmr.stadium,
    kmr.city,
    ht.flag AS homeFlag,
    at.flag AS awayFlag
FROM knockout_matches_resolved kmr
LEFT JOIN teams ht ON kmr.homeTeamId = ht.id
LEFT JOIN teams at ON kmr.awayTeamId = at.id;

CREATE VIEW match_details AS
SELECT 
    m.id,
    m.date,
    m.time,
    m.isodate,
    homeTeam.name AS homeTeam,
    awayTeam.name AS awayTeam,
    homeTeam.code AS homeTeamCode,
    awayTeam.code AS awayTeamCode,
    g.name AS groupName,
    s.name AS stageName,
    st.name AS stadium,
    c.name AS city,
    ms.homeScoreFullTime,
    ms.awayScoreFullTime,
    ms.homeScoreHalfTime,
    ms.awayScoreHalfTime,
    ms.homeScoreExtraTime,
    ms.awayScoreExtraTime,
    ms.homeScorePenalties,
    ms.awayScorePenalties,
    ms.status AS matchStatus,
    m.stageId
FROM matches m
LEFT JOIN teams homeTeam ON m.homeTeamId = homeTeam.id
LEFT JOIN teams awayTeam ON m.awayTeamId = awayTeam.id
LEFT JOIN groups g ON m.groupId = g.id
LEFT JOIN stages s ON m.stageId = s.id
LEFT JOIN stadiums st ON m.stadiumId = st.id
LEFT JOIN cities c ON m.cityId = c.id
LEFT JOIN match_scores ms ON m.id = ms.matchId;

CREATE VIEW match_details_sorted AS
SELECT 
    md.*,
    home.flag AS homeFlag,
    away.flag AS awayFlag,
    md.isodate AS sort_date,
    md.isodate AS date_iso
FROM match_details md
LEFT JOIN teams home ON home.name = md.homeTeam
LEFT JOIN teams away ON away.name = md.awayTeam;

CREATE VIEW match_details_with_scores AS
SELECT 
    m.id, m.date, m.time, m.stageId,
    homeTeam.name AS homeTeam, 
    awayTeam.name AS awayTeam,
    homeTeam.flag AS homeFlag,
    awayTeam.flag AS awayFlag,
    s.name AS stageName, 
    g.name AS groupName,
    st.name AS stadium, 
    c.name AS city,
    ms.homeScoreFullTime, ms.awayScoreFullTime,
    ms.homeScorePenalties, ms.awayScorePenalties,
    ms.status AS matchStatus
FROM matches m
LEFT JOIN teams homeTeam ON m.homeTeamId = homeTeam.id
LEFT JOIN teams awayTeam ON m.awayTeamId = awayTeam.id
LEFT JOIN stages s ON m.stageId = s.id
LEFT JOIN groups g ON m.groupId = g.id
LEFT JOIN stadiums st ON m.stadiumId = st.id
LEFT JOIN cities c ON m.cityId = c.id
LEFT JOIN match_scores ms ON m.id = ms.matchId;

CREATE VIEW match_events_details AS
SELECT 
    m.id AS matchId,
    m.isodate AS date,
    homeTeam.name AS homeTeam,
    awayTeam.name AS awayTeam,
    me.eventType,
    me.playerName,
    me.eventMinute,
    me.eventMinuteExtra,
    me.additionalInfo,
    t.name AS team
FROM match_events me
JOIN matches m ON me.matchId = m.id
JOIN teams t ON me.teamId = t.id
LEFT JOIN teams homeTeam ON m.homeTeamId = homeTeam.id
LEFT JOIN teams awayTeam ON m.awayTeamId = awayTeam.id
ORDER BY m.isodate, m.time, me.eventMinute, me.eventMinuteExtra;

CREATE VIEW match_events_with_team AS
SELECT 
    me.id,
    me.matchId,
    me.eventType,
    me.playerName,
    t.name AS team,
    me.eventMinute,
    me.eventMinuteExtra
FROM match_events me
JOIN teams t ON me.teamId = t.id;

CREATE VIEW match_results_view AS
SELECT 
    m.id AS matchId,
    CASE 
        WHEN ms.homeScoreFullTime > ms.awayScoreFullTime THEN m.homeTeamId
        WHEN ms.awayScoreFullTime > ms.homeScoreFullTime THEN m.awayTeamId
        ELSE NULL
    END AS winnerId,
    CASE 
        WHEN ms.homeScoreFullTime > ms.awayScoreFullTime THEN m.awayTeamId
        WHEN ms.awayScoreFullTime > ms.homeScoreFullTime THEN m.homeTeamId
        ELSE NULL
    END AS loserId
FROM matches m
INNER JOIN match_scores ms ON m.id = ms.matchId
WHERE ms.status = 'finished' AND m.stageId >= 2;

CREATE VIEW match_timeline AS
SELECT 
    med.matchId,
    med.homeTeam,
    med.awayTeam,
    GROUP_CONCAT(
        med.eventMinute || CASE WHEN med.eventMinuteExtra > 0 THEN '+' || med.eventMinuteExtra ELSE '' END || 
        ' - ' || med.playerName || ' (' || med.eventType || ')', 
        CHAR(10)
    ) AS timeline
FROM match_events_details med
GROUP BY med.matchId;

CREATE VIEW own_goals AS
SELECT 
    t.id AS teamId,
    t.name AS teamName,
    me.playerName,
    COUNT(*) AS ownGoals
FROM match_events me
JOIN teams t ON me.teamId = t.id
WHERE me.eventType = 'own_goal'
GROUP BY me.teamId, me.playerName
ORDER BY ownGoals DESC;

CREATE VIEW resolved_away_view AS
SELECT 
    br.matchNumber,
    CASE
        WHEN br.awayRule GLOB '1[A-Z]' THEN
            (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.awayRule,2) AND rank = 1 LIMIT 1)
        WHEN br.awayRule GLOB '2[A-Z]' THEN
            (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.awayRule,2) AND rank = 2 LIMIT 1)
        WHEN br.awayRule GLOB 'W[0-9]*' THEN
            (SELECT winnerId FROM match_results_view WHERE matchId = CAST(substr(br.awayRule,2) AS INTEGER))
        WHEN br.awayRule GLOB 'RU[0-9]*' THEN
            (SELECT loserId FROM match_results_view WHERE matchId = CAST(substr(br.awayRule,3) AS INTEGER))
        WHEN br.awayRule GLOB '3[A-Z]*' THEN (
            SELECT teamId FROM group_standings_full gs
            WHERE gs.rank = 3
                AND gs.groupName IN (SELECT letter FROM split_letters_view WHERE rule_str = br.awayRule)
            ORDER BY gs.points DESC, gs.goalDifference DESC, gs.goalsFor DESC
            LIMIT 1
        )
        ELSE NULL
    END AS awayTeamId
FROM bracket_rules br;

CREATE VIEW resolved_home_view AS
SELECT 
    br.matchNumber,
    CASE
        WHEN br.homeRule GLOB '1[A-Z]' THEN
            (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.homeRule,2) AND rank = 1 LIMIT 1)
        WHEN br.homeRule GLOB '2[A-Z]' THEN
            (SELECT teamId FROM group_standings_full WHERE groupName = substr(br.homeRule,2) AND rank = 2 LIMIT 1)
        WHEN br.homeRule GLOB 'W[0-9]*' THEN
            (SELECT winnerId FROM match_results_view WHERE matchId = CAST(substr(br.homeRule,2) AS INTEGER))
        WHEN br.homeRule GLOB 'RU[0-9]*' THEN
            (SELECT loserId FROM match_results_view WHERE matchId = CAST(substr(br.homeRule,3) AS INTEGER))
        WHEN br.homeRule GLOB '3[A-Z]*' THEN (
            SELECT teamId FROM group_standings_full gs
            WHERE gs.rank = 3
                AND gs.groupName IN (SELECT letter FROM split_letters_view WHERE rule_str = br.homeRule)
            ORDER BY gs.points DESC, gs.goalDifference DESC, gs.goalsFor DESC
            LIMIT 1
        )
        ELSE NULL
    END AS homeTeamId
FROM bracket_rules br;

CREATE VIEW split_letters_view AS
SELECT '3ABCDF' AS rule_str, 'A' AS letter UNION ALL
SELECT '3ABCDF', 'B' UNION ALL
SELECT '3ABCDF', 'C' UNION ALL
SELECT '3ABCDF', 'D' UNION ALL
SELECT '3ABCDF', 'F' UNION ALL
SELECT '3CDFGH', 'C' UNION ALL
SELECT '3CDFGH', 'D' UNION ALL
SELECT '3CDFGH', 'F' UNION ALL
SELECT '3CDFGH', 'G' UNION ALL
SELECT '3CDFGH', 'H' UNION ALL
SELECT '3CEFHI', 'C' UNION ALL
SELECT '3CEFHI', 'E' UNION ALL
SELECT '3CEFHI', 'F' UNION ALL
SELECT '3CEFHI', 'H' UNION ALL
SELECT '3CEFHI', 'I' UNION ALL
SELECT '3EHIJK', 'E' UNION ALL
SELECT '3EHIJK', 'H' UNION ALL
SELECT '3EHIJK', 'I' UNION ALL
SELECT '3EHIJK', 'J' UNION ALL
SELECT '3EHIJK', 'K' UNION ALL
SELECT '3BEFIJ', 'B' UNION ALL
SELECT '3BEFIJ', 'E' UNION ALL
SELECT '3BEFIJ', 'F' UNION ALL
SELECT '3BEFIJ', 'I' UNION ALL
SELECT '3BEFIJ', 'J' UNION ALL
SELECT '3AEHIJ', 'A' UNION ALL
SELECT '3AEHIJ', 'E' UNION ALL
SELECT '3AEHIJ', 'H' UNION ALL
SELECT '3AEHIJ', 'I' UNION ALL
SELECT '3AEHIJ', 'J' UNION ALL
SELECT '3EFGIJ', 'E' UNION ALL
SELECT '3EFGIJ', 'F' UNION ALL
SELECT '3EFGIJ', 'G' UNION ALL
SELECT '3EFGIJ', 'I' UNION ALL
SELECT '3EFGIJ', 'J' UNION ALL
SELECT '3DEIJL', 'D' UNION ALL
SELECT '3DEIJL', 'E' UNION ALL
SELECT '3DEIJL', 'I' UNION ALL
SELECT '3DEIJL', 'J' UNION ALL
SELECT '3DEIJL', 'L';

CREATE VIEW team_form AS
SELECT 
    teamId,
    teamName,
    GROUP_CONCAT(result, '') AS form_last5
FROM (
    SELECT 
        teamId,
        teamName,
        result,
        ROW_NUMBER() OVER (PARTITION BY teamId ORDER BY date DESC) AS rn
    FROM team_match_history
    WHERE result IN ('W','D','L')
) t
WHERE rn <= 5
GROUP BY teamId;

CREATE VIEW team_group_summary AS
SELECT 
    gs.groupId,
    gs.groupName,
    gs.teamId,
    gs.teamName,
    gs.teamCode,
    gs.teamFlag,
    gs.played,
    gs.wins,
    gs.draws,
    gs.losses,
    gs.goalsFor,
    gs.goalsAgainst,
    gs.goalDifference,
    gs.points,
    gs.rank,
    CASE WHEN gs.rank <= 2 THEN 'qualified' 
         WHEN gs.rank = 3 AND (SELECT COUNT(*) FROM group_standings WHERE rank = 3 AND points > 0) <= 4 THEN 'possible_third' 
         ELSE 'eliminated' 
    END AS status
FROM group_standings gs;

CREATE VIEW team_match_history AS
SELECT 
    t.id AS teamId,
    t.name AS teamName,
    m.id AS matchId,
    m.isodate AS date,
    m.time,
    CASE 
        WHEN m.homeTeamId = t.id THEN 'home'
        ELSE 'away'
    END AS venue,
    CASE 
        WHEN m.homeTeamId = t.id THEN awayTeam.name
        ELSE homeTeam.name
    END AS opponent,
    s.name AS stage,
    st.name AS stadium,
    c.name AS city,
    CASE 
        WHEN m.homeTeamId = t.id THEN ms.homeScoreFullTime
        ELSE ms.awayScoreFullTime
    END AS teamScore,
    CASE 
        WHEN m.homeTeamId = t.id THEN ms.awayScoreFullTime
        ELSE ms.homeScoreFullTime
    END AS opponentScore,
    CASE 
        WHEN (m.homeTeamId = t.id AND ms.homeScoreFullTime > ms.awayScoreFullTime) OR
             (m.awayTeamId = t.id AND ms.awayScoreFullTime > ms.homeScoreFullTime) THEN 'W'
        WHEN (m.homeTeamId = t.id AND ms.homeScoreFullTime < ms.awayScoreFullTime) OR
             (m.awayTeamId = t.id AND ms.awayScoreFullTime < ms.homeScoreFullTime) THEN 'L'
        WHEN ms.homeScoreFullTime = ms.awayScoreFullTime THEN 'D'
        ELSE '-'
    END AS result,
    ms.status
FROM teams t
JOIN matches m ON t.id = m.homeTeamId OR t.id = m.awayTeamId
LEFT JOIN teams homeTeam ON m.homeTeamId = homeTeam.id
LEFT JOIN teams awayTeam ON m.awayTeamId = awayTeam.id
LEFT JOIN stages s ON m.stageId = s.id
LEFT JOIN stadiums st ON m.stadiumId = st.id
LEFT JOIN cities c ON m.cityId = c.id
LEFT JOIN match_scores ms ON m.id = ms.matchId
ORDER BY t.id, m.isodate;

CREATE VIEW top_scorers AS
SELECT 
    t.id AS teamId,
    t.name AS teamName,
    t.code AS teamCode,
    me.playerName,
    COUNT(*) AS goals
FROM match_events me
JOIN teams t ON me.teamId = t.id
WHERE me.eventType IN ('goal', 'penalty_goal')
GROUP BY me.teamId, me.playerName
ORDER BY goals DESC, playerName;

CREATE VIEW tournament_progress AS
SELECT 
    (SELECT COUNT(*) FROM matches WHERE stageId = 1) AS total_group_matches,
    (SELECT COUNT(*) FROM match_scores WHERE status = 'finished' AND matchId IN (SELECT id FROM matches WHERE stageId = 1)) AS finished_group_matches,
    (SELECT COUNT(*) FROM matches WHERE stageId >= 2) AS total_knockout_matches,
    (SELECT COUNT(*) FROM match_scores WHERE status = 'finished' AND matchId IN (SELECT id FROM matches WHERE stageId >= 2)) AS finished_knockout_matches,
    (SELECT SUM(homeScoreFullTime + awayScoreFullTime) FROM match_scores WHERE status = 'finished') AS total_goals,
    (SELECT COUNT(*) FROM match_events WHERE eventType IN ('goal','penalty_goal')) AS total_goals_events,
    (SELECT COUNT(*) FROM match_events WHERE eventType IN ('yellow_card','red_card')) AS total_cards;

CREATE VIEW unified_matches AS
SELECT 
    id,
    isodate AS date,
    time,
    homeTeam,
    awayTeam,
    homeFlag,
    awayFlag,
    homeScoreFullTime,
    awayScoreFullTime,
    matchStatus,
    stadium,
    city,
    groupName,
    stageName,
    isodate AS sort_date,
    NULL AS homeTeamId,
    NULL AS awayTeamId,
    NULL AS homeRule,
    NULL AS awayRule
FROM match_details_sorted
WHERE stageId = 1

UNION ALL

SELECT
    kmr.matchNumber AS id,
    kmr.isodate AS date,
    kmr.time,
    COALESCE(kmr.homeTeamName, kmr.homeRule) AS homeTeam,
    COALESCE(kmr.awayTeamName, kmr.awayRule) AS awayTeam,
    kmr.homeFlag,
    kmr.awayFlag,
    NULL AS homeScoreFullTime,
    NULL AS awayScoreFullTime,
    'scheduled' AS matchStatus,
    kmr.stadium,
    kmr.city,
    NULL AS groupName,
    kmr.stageName,
    kmr.isodate AS sort_date,
    kmr.homeTeamId,
    kmr.awayTeamId,
    kmr.homeRule,
    kmr.awayRule
FROM knockout_with_flags kmr
WHERE kmr.stageId >= 2;

CREATE VIEW upcoming_matches AS
SELECT * FROM unified_matches
WHERE date(date) >= date('now')
ORDER BY date, time;

CREATE TRIGGER prevent_score_change_after_finish
BEFORE UPDATE OF homeScoreFullTime, awayScoreFullTime, status ON match_scores
FOR EACH ROW
WHEN OLD.status = 'finished' AND NEW.status = 'finished'
BEGIN
    SELECT RAISE(ABORT, 'Cannot modify scores of a finished match');
END;

CREATE TRIGGER update_last_updated
AFTER UPDATE OF homeScoreFullTime, awayScoreFullTime, 
              homeScoreHalfTime, awayScoreHalfTime,
              homeScoreExtraTime, awayScoreExtraTime,
              homeScorePenalties, awayScorePenalties
ON match_scores
FOR EACH ROW
BEGIN
    UPDATE match_scores SET lastUpdated = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER update_match_scores_timestamp
AFTER UPDATE ON match_scores
FOR EACH ROW
BEGIN
    UPDATE match_scores SET lastUpdated = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER validate_event_minute
BEFORE INSERT ON match_events
FOR EACH ROW
WHEN NEW.eventMinute < 0 OR NEW.eventMinute > 120
BEGIN
    SELECT RAISE(ABORT, 'Event minute must be between 0 and 120');
END;
`;
