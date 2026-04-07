# ServeNow — Launch Guide (Zero to Live)

## Step 1: Sign up for all services (free tiers, ~30 mins)

| Service | URL | What for |
|---|---|---|
| Neon.tech | neon.tech | PostgreSQL DB (free) |
| Railway | railway.app | Backend host + Redis (free $5 credit) |
| Vercel | vercel.com | Frontend host (free) |
| MSG91 | msg91.com | OTP SMS India |
| Razorpay | razorpay.com | Payments (test mode, free) |
| Google Cloud | console.cloud.google.com | Maps + Places API |
| Resend | resend.com | Transactional email (free 100/day) |

---

## Step 2: Set up Neon Postgres

1. Create a new project at neon.tech
2. Copy the connection string (it looks like `postgresql://...`)
3. Go to the SQL editor and paste the entire contents of `backend/src/db/schema.sql`
4. Run it — this creates all tables and seeds the 10 service categories

---

## Step 3: Set up Google Maps API

1. Go to console.cloud.google.com → Create a project
2. Enable these APIs:
   - Maps JavaScript API
   - Places API
   - Geocoding API
   - Directions API
3. Create two API keys:
   - **Server key** (restrict to your Railway IP later) → `GOOGLE_MAPS_API_KEY`
   - **Browser key** (restrict to your Vercel domain later) → `NEXT_PUBLIC_GOOGLE_MAPS_KEY`

---

## Step 4: Set up Razorpay

1. Sign up at razorpay.com → Dashboard → Test mode
2. Go to Settings → API Keys → Generate Test Key
3. Copy Key ID → `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID`
4. Copy Key Secret → `RAZORPAY_KEY_SECRET`
5. Go to Settings → Webhooks → Add webhook URL:
   `https://your-railway-url/api/payments/webhook`
   Secret → `RAZORPAY_WEBHOOK_SECRET`

---

## Step 5: Set up MSG91

1. Sign up at msg91.com → Create account
2. Go to API → Copy Auth Key → `MSG91_AUTH_KEY`
3. Go to SMS → Templates → Create OTP template
4. Copy Template ID → `MSG91_TEMPLATE_ID`
5. Note: In development, OTP is always `123456` so you don't need MSG91 until production

---

## Step 6: Set up Resend

1. Sign up at resend.com
2. Create API Key → `RESEND_API_KEY`
3. Add your domain or use Resend's test domain initially

---

## Step 7: Deploy the backend to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# In the backend folder:
cd ServeNow/backend
railway init
railway up
```

In Railway dashboard:
1. Add Redis plugin → Railway auto-fills `REDIS_URL`
2. Go to Variables → Add all your env vars from `.env.example`
3. Your backend URL will be `https://your-app.railway.app`

---

## Step 8: Deploy the frontend to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# In frontend folder:
cd ServeNow/frontend
vercel
```

In Vercel dashboard:
1. Go to Settings → Environment Variables
2. Add all `NEXT_PUBLIC_*` vars
3. Set `NEXT_PUBLIC_API_URL` to your Railway backend URL
4. Set `NEXT_PUBLIC_SOCKET_URL` to same Railway URL
5. Redeploy

---

## Step 9: Seed real worker data

After both are live, create test accounts by calling the API:

```bash
# 1. Send OTP (dev mode uses 123456)
curl -X POST https://your-api.railway.app/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210"}'

# 2. Verify OTP as a worker
curl -X POST https://your-api.railway.app/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210", "otp": "123456", "name": "Ramesh Kumar", "role": "worker"}'

# 3. Use the token to set up worker profile
# (paste token from step 2)
curl -X POST https://your-api.railway.app/api/workers/setup \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bio": "5 years experience in residential plumbing. Available in Noida and Greater Noida.",
    "experience_years": 5,
    "hourly_rate": 350,
    "skills": ["Pipe fitting", "Drain cleaning", "Tap replacement"],
    "slots": [
      {"day_of_week": 0, "start_time": "09:00", "end_time": "17:00"},
      {"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"},
      {"day_of_week": 2, "start_time": "09:00", "end_time": "17:00"}
    ]
  }'
```

Repeat this for 3–4 workers across different categories. These become your real seed data — real accounts with real slots your customers can book.

---

## Step 10: Test the full end-to-end flow

1. Open your Vercel URL on mobile
2. Log in as a customer (use a different phone number)
3. Browse services → Pick Plumber → See real workers
4. Select a slot → Enter your real address
5. Pay via Razorpay (test card: `4111 1111 1111 1111`, any future date, any CVV)
6. Open another browser as the worker → Accept the job → Start it
7. Watch the live tracking page update in real time via Socket.io

---

## How to make your real data visible on the resume

1. Get even 2-3 real bookings end to end (friends and family work)
2. Screenshot the live tracking map with the worker marker moving
3. Screenshot the admin panel showing real booking counts
4. Screenshot the Razorpay dashboard showing test transactions
5. Add to resume: *"Live at [url] — end-to-end bookings with Razorpay payments, OTP auth, real-time Socket.io tracking"*

---

## Local development (no cloud needed)

```bash
# 1. Start Postgres locally (or use Neon free tier)
# 2. Start Redis locally
docker run -d -p 6379:6379 redis

# 3. Backend
cd backend
cp ../.env.example .env
# Fill in DATABASE_URL, REDIS_URL=redis://localhost:6379, JWT_SECRET=anyrandomstring
npm install
npm run dev

# 4. Frontend (new terminal)
cd frontend
cp ../.env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev

# Open http://localhost:3000
# OTP in dev mode is always 123456
```

---

## Common issues

**Socket.io not connecting on Railway**: Make sure Railway allows WebSocket connections — it does by default, but check that you're using `wss://` (HTTPS Railway URLs).

**Razorpay checkout not opening**: Make sure the Razorpay script loads in `book/[workerId]/page.tsx` — it's added via a `<script>` tag dynamically.

**Google Maps blank**: Check your browser API key has "Maps JavaScript API" enabled and your Vercel domain is in the allowed referrers.

**OTP not working in production**: MSG91 template must have `{{otp}}` variable. Check the template is approved.
