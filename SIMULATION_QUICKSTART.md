# Real-Time Simulation System - Quick Start

## What's Been Implemented ✅

### Backend Simulation Engine (`/backend/src/services/simulationService.ts`)

**Worker Location Updates**
- Every 5 seconds: All workers move randomly
- Movement: ~500m variance per update
- Range: Within Delhi GPS bounds (28.4089-28.7355 lat, 76.8066-77.3910 lng)
- Database: Updates `worker_profiles.current_lat/lng`
- Socket: Emits `worker:location_update`

**Fake Booking System**
- Every 2-3 minutes: New booking created
- Random category from database
- Random available customer
- Random available worker selected
- Amount: Service base_price + random adjustment
- Scheduled: 1-9 hours from current time
- Status: Starts as "pending"
- Database: Inserted into `bookings` table immediately

**Auto-Acceptance**
- Delay: 10-60 seconds after booking created
- Worker accepts: Status → "accepted"
- Socket: Emits `booking_accepted`
- Database: Sets `accepted_at` timestamp

**Job Progression**
- After 30-120 seconds: `started_at` timestamp set, status → "in_progress"
- After 2-5 minutes of start: `completed_at` set, status → "completed", payment → "paid"
- Socket: Emits `job_started` → `job_completed` with user-friendly messages

**Review Creation**
- After job completion: Auto-review generated
- Rating: 3-5 stars (realistic distribution)
- Comment: Authentic feedback (10 variations)
- Database: Stored in `reviews` table
- Trigger: Automatically updates worker `average_rating` and `rating_count`

### Frontend Integration (Already Configured)

**Location**: `/frontend/app/_components/RoleBasedLayout.tsx` (lines 40-73)

```typescript
socket.on('new_booking', ...) // Toast notification
socket.on('booking_accepted', ...)
socket.on('job_started', ...)
socket.on('job_completed', ...)
```

All notifications display via Sonner toast with custom messages.

## Quick Start

### 1. Start Backend (Simulation Starts Auto)

```bash
cd backend
NODE_ENV=development npm run dev
```

**Expected Output:**
```
🎬 Starting real-time simulation system...
📍 Loaded 10 workers for simulation
✅ Simulation started successfully
   📍 Worker locations updating every 5 seconds
   📝 New bookings every 2-3 minutes
   ✅ Auto-acceptance within 10-60 seconds

📝 New booking created: abc12345... (Electrician)
✅ Booking accepted: abc12345...
🚗 Job started: abc12345...
🏁 Job completed: abc12345...
⭐ Review created: abc12345... (5⭐)
```

### 2. Start Frontend

```bash
cd frontend
npm run dev
```

### 3. Open in Browser

```
http://localhost:3000
```

Login with any phone number (demo users available)

### 4. Watch Notifications

- Toast notifications appear for each event:
  - "New job request" (Plumber • ₹599)
  - "Worker accepted your booking"
  - "Job started"
  - "Job completed"

## Event Timeline (Example)

```
00:00 - 📝 New booking created
        Category: Plumber
        Customer: Priya Sharma (South Delhi)
        Worker: Raj Kumar (accepted = true)
        Amount: ₹599

00:15 - ✅ Booking accepted
        Status: pending → accepted
        Toast: "Worker accepted your booking"

00:45 - 🚗 Job started
        Status: accepted → in_progress
        Toast: "Job started. Your worker is at location"

03:15 - 🏁 Job completed
        Status: in_progress → completed
        Payment: pending → paid
        Toast: "Job completed. Please rate experience"

03:20 - ⭐ Review created
        Rating: 5⭐
        Comment: "Excellent service! Highly satisfied."
        Worker rating: Updated automatically
```

## Architecture

```
┌─────────────────────────────────────────┐
│ Backend (Port 4000)                     │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Simulation Service                  │ │
│ │ ─────────────────────────────────── │ │
│ │ • Worker location updates (5s)      │ │
│ │ • Booking creation (2-3 min)        │ │
│ │ • Auto-acceptance (10-60s)          │ │
│ │ • Job progression                   │ │
│ │ • Review creation                   │ │
│ └─────────────────────────────────────┘ │
│           ↓ Database operations          │
│           ↓ Socket.io events ✨           │
└─────────────────────────────────────────┘
              ↓ WebSocket
┌─────────────────────────────────────────┐
│ Frontend (Port 3000)                    │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Socket Listeners                    │ │
│ │ ─────────────────────────────────── │ │
│ │ • new_booking                       │ │
│ │ • booking_accepted                  │ │
│ │ • job_started                       │ │
│ │ • job_completed                     │ │
│ └─────────────────────────────────────┘ │
│           ↓ Toast notifications          │
│           ↓ UI updates                   │
└─────────────────────────────────────────┘
```

## Database Structure

### Simulated Bookings

```sql
SELECT * FROM bookings 
WHERE description LIKE '%simulation%'
ORDER BY created_at DESC;
```

### Worker Locations

```sql
SELECT id, current_lat, current_lng, last_seen 
FROM worker_profiles 
WHERE current_lat IS NOT NULL
ORDER BY last_seen DESC;
```

### Generated Reviews

```sql
SELECT r.*, b.worker_id FROM reviews r
JOIN bookings b ON r.booking_id = b.id
WHERE b.description LIKE '%simulation%';
```

## Key Timelines

| Action | Delay | Range |
|--------|-------|-------|
| Worker moves | 5 sec | Fixed interval |
| Create booking | 2-3 min | Variable (random) |
| Accept booking | 10-60 sec | After creation |
| Start job | 30-120 sec | After acceptance |
| Complete job | 2-5 min | After start |
| Create review | 5-10 sec | After completion |

## Monitor Simulation

### Terminal Logs

```bash
# Watch live logs
tail -f backend.log | grep -E "(🎬|📝|✅|🚗|🏁|⭐|❌)"
```

### Database Queries

```bash
# Count recent bookings
psql $DATABASE_URL -c "
  SELECT COUNT(*) as new_bookings, 
         MAX(created_at) as latest 
  FROM bookings 
  WHERE created_at > NOW() - INTERVAL '5 min';"

# Count recent reviews
psql $DATABASE_URL -c "
  SELECT COUNT(*) as new_reviews, 
         AVG(rating) as avg_rating,
         MAX(created_at) as latest 
  FROM reviews 
  WHERE created_at > NOW() - INTERVAL '5 min';"
```

### Frontend

Open browser DevTools → Network tab:
- Watch WebSocket messages
- See Socket.io events in real-time
- Monitor connection status

## Files Modified

### New
- ✅ `/backend/src/services/simulationService.ts` (380 lines)
- ✅ `/backend/SIMULATION_SYSTEM.md` (Comprehensive guide)

### Updated
- ✅ `/backend/src/index.ts` (Import + startup call)

### Pre-configured
- ✅ `/frontend/app/_components/RoleBasedLayout.tsx` (Socket listeners)
- ✅ `/backend/src/socket/handlers.ts` (Socket.io setup)

## Features Showcased

✅ **Real-time Booking**: Customers see fresh bookings appear  
✅ **Worker Acceptance**: Realistic acceptance workflow  
✅ **Location Tracking**: Live worker position updates  
✅ **Job Lifecycle**: Complete booking workflow  
✅ **Reviews**: Auto-generated feedback  
✅ **Notifications**: Toast alerts for each event  
✅ **Database Real Data**: All data persists and queerable  

## Testing Scenarios

1. **New User Onboarding**: See demo with live activity
2. **Admin Analytics**: Real data for dashboards
3. **Real-time Features**: Test Socket.io integration
4. **Notification System**: Verify all toast messages
5. **Booking Workflow**: End-to-end progression
6. **Search Results**: See workers with recent jobs
7. **Review Pages**: Auto-generated feedback

## Disable (If Needed)

To disable in development:

```bash
# Set environment variable
SKIP_SIMULATION=true npm run dev

# Or modify /backend/src/index.ts
// Comment out: await startRealtimeSimulation(io);
```

## Status

✅ **Build**: Compiles without errors  
✅ **Integration**: Fully integrated with backend/frontend  
✅ **Ready**: Immediate use in development  
✅ **Safe**: Development-only (production unaffected)  

---

**Next Step**: Start backend, watch the magic happen! 🎬
