/**
 * Express API server for the Gas Cylinder Inspection & Tracking app.
 *
 * Pipeline:
 *   QR scanner (mobile app / any client) decodes cylinder JSON
 *   --> POSTs to this API --> API stores state --> any client
 *   (mobile dashboard, web UI, etc.) polls the API and renders live.
 *
 * Routes:
 *   /api/health       (GET)  - connectivity check
 *   /api/scan         (POST) - receive a decoded cylinder QR payload
 *   /api/scan/batch   (POST) - receive multiple cylinder payloads at once
 *   /api/latest       (GET)  - most recent scan
 *   /api/history      (GET)  - last MAX_HISTORY scans, most recent first
 *   /api/stats        (GET)  - total / passed / failed / due counters
 *   /api/reset        (POST) - clear all in-memory state
 *
 * Run:
 *   npm install
 *   npm start
 * Server listens on 0.0.0.0:<PORT> (defaults to 5050 locally; Render/host
 * platforms set process.env.PORT automatically).
 */

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5050;
const MAX_HISTORY = 50;

app.use(cors());
app.use(express.json());

// ---- In-memory state ----
let state = {
  latest: null,
  history: [], // most recent first
  stats: { total: 0, passed: 0, failed: 0, due: 0 },
};

/**
 * SAFE / DUE / EXPIRED based on next_inspection date.
 * <= 60 days away = DUE, < 0 days (past) = EXPIRED, otherwise SAFE.
 */
function computeStatus(cyl) {
  const nextInsp = cyl && cyl.next_inspection;
  if (!nextInsp) return "due";

  // Expect "YYYY-MM-DD"
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nextInsp);
  if (!match) return "due";

  const nextDate = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  if (Number.isNaN(nextDate.getTime())) return "due";

  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const nextMidnight = new Date(
    nextDate.getFullYear(),
    nextDate.getMonth(),
    nextDate.getDate()
  );
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((nextMidnight - nowMidnight) / msPerDay);

  if (daysLeft < 0) return "expired";
  if (daysLeft <= 60) return "due";
  return "safe";
}

// Simple connectivity check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "gas-cylinder-backend", time: new Date().toISOString() });
});

app.post("/api/scan", (req, res) => {
  const data = req.body;
  if (!data || !data.cylinder_id) {
    return res.status(400).json({ error: "invalid payload, expected cylinder JSON" });
  }

  const status = computeStatus(data);
  const entry = {
    time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
    cylinder: data,
    status,
  };

  state.latest = entry;
  state.history.unshift(entry);
  state.history = state.history.slice(0, MAX_HISTORY);
  state.stats.total += 1;
  if (status === "safe") state.stats.passed += 1;
  else if (status === "expired") state.stats.failed += 1;
  else state.stats.due += 1;

  console.log(`[scan] ${data.cylinder_id} -> ${status}`);
  res.json({ ok: true, status });
});

/**
 * Batch scan submission.
 * Body: { scans: [cylinderJson, cylinderJson, ...] }
 */
app.post("/api/scan/batch", (req, res) => {
  const scans = req.body && req.body.scans;
  if (!Array.isArray(scans) || scans.length === 0) {
    return res.status(400).json({ error: "expected { scans: [...] } with at least one item" });
  }

  const results = scans.map((data) => {
    if (!data || !data.cylinder_id) {
      return { error: "invalid payload, expected cylinder JSON" };
    }
    const status = computeStatus(data);
    const entry = {
      time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      cylinder: data,
      status,
    };

    state.latest = entry;
    state.history.unshift(entry);
    state.stats.total += 1;
    if (status === "safe") state.stats.passed += 1;
    else if (status === "expired") state.stats.failed += 1;
    else state.stats.due += 1;

    console.log(`[scan:batch] ${data.cylinder_id} -> ${status}`);
    return { cylinder_id: data.cylinder_id, status };
  });

  state.history = state.history.slice(0, MAX_HISTORY);
  res.json({ ok: true, results });
});

app.get("/api/latest", (req, res) => {
  res.json(state.latest);
});

app.get("/api/history", (req, res) => {
  res.json(state.history);
});

app.get("/api/stats", (req, res) => {
  res.json(state.stats);
});

app.post("/api/reset", (req, res) => {
  state = {
    latest: null,
    history: [],
    stats: { total: 0, passed: 0, failed: 0, due: 0 },
  };
  res.json({ ok: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gas cylinder API listening on http://0.0.0.0:${PORT}`);
  console.log(`Point clients at your machine's LAN IP or deployed URL, e.g. http://<host>:${PORT}`);
});
