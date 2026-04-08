# Free Deployment Playbook (ServeNow)

This guide gets you live links for resume use with mostly free tiers:

- Frontend: Vercel (Free)
- Backend: Render Web Service (Free)
- Database: Neon Postgres (Free)
- Redis: Upstash Redis (Free) or Railway Redis trial/free credits

## 1) Create free infra

### Neon Postgres
1. Create a Neon project.
2. Copy the pooled `DATABASE_URL`.

### Redis
1. Create Upstash Redis database.
2. Copy `REDIS_URL`.

## 2) Deploy backend on Render (free)

### Option A (recommended): Blueprint deploy
1. Push this repo to GitHub.
2. In Render: New + > Blueprint.
3. Select this repo.
4. Render reads `render.yaml` and creates `servenow-backend`.
5. Fill required env vars marked `sync: false`.

### Option B: Manual Web Service
- Root dir: `backend`
- Build: `npm install && npm run build`
- Start: `npm run start`
- Health check: `/health`

### Required backend env vars
- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_EXPIRES_IN=15m`
- `JWT_REFRESH_EXPIRES_IN=30d`
- `FRONTEND_URL=https://<your-vercel-app>.vercel.app`
- `FRONTEND_URLS=https://<your-vercel-app>.vercel.app`
- `GOOGLE_MAPS_API_KEY`
- `RAZORPAY_KEY_ID` (test keys are fine)
- `RAZORPAY_KEY_SECRET` (test keys are fine)
- `RAZORPAY_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `MSG91_AUTH_KEY`
- `MSG91_TEMPLATE_ID`

## 3) Run DB schema once

Use Neon SQL editor and run:
1. `backend/src/db/schema.sql`
2. `backend/src/db/compat_local.sql`

## 4) Deploy frontend on Vercel (free)

1. Import same GitHub repo in Vercel.
2. Set root directory to `frontend`.
3. Add env vars:
   - `NEXT_PUBLIC_API_URL=https://<your-render-backend>.onrender.com/api`
   - `NEXT_PUBLIC_SOCKET_URL=https://<your-render-backend>.onrender.com`
   - `NEXT_PUBLIC_GOOGLE_MAPS_KEY=<google_maps_key>`
   - `NEXT_PUBLIC_API_TIMEOUT_MS=15000`
4. Deploy.

## 5) Post-deploy checks

1. Backend health: `https://<backend>.onrender.com/health`
2. Frontend opens: `https://<frontend>.vercel.app`
3. Login works (demo login or OTP)
4. Worker dashboard incoming jobs load
5. Customer booking + track page works
6. Admin dashboard loads bookings and metrics

## 6) Resume links to include

- Live app: `https://<frontend>.vercel.app`
- API health (optional): `https://<backend>.onrender.com/health`
- GitHub repo: your repository URL

## Notes on free-tier behavior

- Render free web services may sleep on inactivity; first request can be slow.
- Keep health endpoint in resume to show backend is real and running.
- Use demo mode in interviews to avoid OTP friction.
