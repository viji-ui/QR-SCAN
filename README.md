# Gas Cylinder Inspection API

Node.js + Express REST API that tracks gas cylinder QR scans and computes
their inspection status (SAFE / DUE / EXPIRED).

## Run locally

```bash
npm install
npm start
```

Server listens on `http://0.0.0.0:5050` (or `process.env.PORT` if set,
which is how Render/hosting platforms assign the port automatically).

## Endpoints

| Method | Route | Body | Response |
|---|---|---|---|
| GET | `/api/health` | — | `{ ok, service, time }` |
| POST | `/api/scan` | cylinder JSON | `{ ok, status }` |
| POST | `/api/scan/batch` | `{ scans: [cylinderJson, ...] }` | `{ ok, results: [{cylinder_id, status}] }` |
| GET | `/api/latest` | — | `{ time, cylinder, status }` |
| GET | `/api/history` | — | last 50 scans, most recent first |
| GET | `/api/stats` | — | `{ total, passed, failed, due }` |
| POST | `/api/reset` | — | `{ ok }` |

### Cylinder JSON shape

```json
{
  "cylinder_id": "CYL-1001",
  "gas_type": "Oxygen",
  "capacity_liters": 47,
  "pressure_bar": 200,
  "manufacture_date": "2021-03-12",
  "last_inspection": "2025-06-15",
  "next_inspection": "2027-06-15",
  "owner": "ABC Industries"
}
```

### Status logic (`computeStatus`)

- `next_inspection` in the past → **expired**
- `next_inspection` within 60 days → **due**
- otherwise → **safe**

## Quick test

```bash
curl http://localhost:5050/api/health

curl -X POST http://localhost:5050/api/scan \
  -H "Content-Type: application/json" \
  -d '{"cylinder_id":"CYL-1001","next_inspection":"2027-06-15"}'

curl http://localhost:5050/api/stats
```

## Deploying (e.g. Render)

1. Push this folder to a GitHub repo.
2. Render → New → Web Service → connect the repo.
3. Build command: `npm install`, Start command: `npm start`.
4. Root directory: this folder (if it's a subfolder of a larger repo).

State is in-memory — it resets on server restart or platform spin-down
(expected on free tiers after idle time). CORS is open (`app.use(cors())`)
so any frontend (web, mobile) can call this API directly.
