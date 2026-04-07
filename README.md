# ServeNow — HyperLocal Service Marketplace

A full-stack, production-grade platform connecting customers with verified local service workers (plumbers, electricians, tutors, etc.) — with real-time job tracking, OTP auth, and Razorpay payments.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Backend | Node.js + Express |
| Database | PostgreSQL (Neon.tech) |
| Cache / Locks | Redis (Railway) |
| Real-time | Socket.io |
| Auth | OTP via MSG91 + JWT |
| Payments | Razorpay |
| Maps | Google Maps JS API + Places API |
| Email | Resend |
| Deploy | Vercel (frontend) + Railway (backend) |

---

## Project Structure

```
ServeNow/
├── frontend/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── verify/page.tsx
│   │   ├── (customer)/
│   │   │   ├── page.tsx                  ← Home / search
│   │   │   ├── services/[category]/page.tsx
│   │   │   ├── book/[workerId]/page.tsx
│   │   │   ├── track/[jobId]/page.tsx
│   │   │   └── dashboard/page.tsx
│   │   ├── (worker)/
│   │   │   ├── worker/dashboard/page.tsx
│   │   │   └── worker/jobs/page.tsx
│   │   ├── admin/
│   │   │   └── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/
│   │   ├── MapView.tsx
│   │   ├── BookingCard.tsx
│   │   ├── WorkerCard.tsx
│   │   └── LiveTracker.tsx
│   ├── lib/
│   │   ├── api.ts
│   │   ├── socket.ts
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── useSocket.ts
│   │   └── useAuth.ts
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── index.ts                      ← Express entry + Socket.io
│   │   ├── db/
│   │   │   ├── client.ts                 ← Postgres pool
│   │   │   ├── redis.ts                  ← Redis client
│   │   │   └── schema.sql                ← Full DB schema
│   │   ├── middleware/
│   │   │   ├── auth.ts                   ← JWT verify
│   │   │   └── rateLimiter.ts
│   │   ├── routes/
│   │   │   ├── auth.ts                   ← OTP send/verify
│   │   │   ├── services.ts               ← Browse categories/workers
│   │   │   ├── bookings.ts               ← Create/manage bookings
│   │   │   ├── jobs.ts                   ← Worker job actions
│   │   │   ├── payments.ts               ← Razorpay order + webhook
│   │   │   ├── reviews.ts
│   │   │   └── admin.ts
│   │   ├── socket/
│   │   │   └── handlers.ts               ← Socket.io events
│   │   └── utils/
│   │       ├── msg91.ts                  ← OTP helper
│   │       ├── resend.ts                 ← Email helper
│   │       └── maps.ts                   ← Google Maps helper
│   ├── package.json
│   └── tsconfig.json
│
├── .env.example
└── README.md
```

---

## Quick Start

### 0. Workspace shortcut (recommended)

```bash
cd ServeNow
npm install
npm run dev
```

This starts backend and frontend together from the repository root.
Before startup, a preflight cleanup clears stale processes on ports `3000` and `4000` to reduce `EADDRINUSE` failures.

If needed, you can run cleanup manually:

```bash
npm run dev:clean
```

### 1. Clone and install

```bash
git clone <your-repo>
cd ServeNow

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Set environment variables

Copy `.env.example` to `.env` in both `backend/` and `frontend/`.

### 3. Set up database

```bash
cd backend
npx ts-node src/db/schema.sql   # or run SQL in Neon console
```

### 4. Run locally

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

### 5. Demo readiness checklist

Run through [DEMO_CHECKLIST.md](DEMO_CHECKLIST.md) before sharing with recruiters/interviewers.

---

## Deployment

- **Frontend** → Push to Vercel. Set env vars in Vercel dashboard.
- **Backend** → Deploy to Railway. Add Redis plugin. Set env vars.
- **Database** → Neon.tech free tier (serverless Postgres).

---

## Real Data Sources Used

| Source | Used For |
|---|---|
| Google Places API | Real locality autocomplete, map pins |
| India Pincode API (api.postalpincode.in) | Pincode → area/city resolution |
| MSG91 | Live OTP SMS to real Indian phone numbers |
| Razorpay Test Mode | Real payment gateway flow (test keys) |

---

## Key Features

- OTP-based login (no passwords — like every Indian app)
- Real-time slot availability with Redis distributed locking (no double bookings)
- Live job tracking on Google Maps via Socket.io
- Razorpay payment + webhook for confirmed payment state
- Worker earnings dashboard + payout requests
- Review system (only after confirmed job completion)
- Admin panel with platform metrics
