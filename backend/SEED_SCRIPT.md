# Database Seed Script Documentation

## Overview

The ServeNow development seed script automatically creates realistic test data for local development and testing. It generates:

- **30 Workers** with various services (plumber, electrician, tutor, etc.)
- **15 Customers** for creating bookings
- **100 Past Bookings** with realistic statuses (completed, cancelled)
- **Reviews & Ratings** linked to completed bookings

## Features

✅ **Automatic Seeding**: Runs automatically when the backend starts in development mode  
✅ **Idempotent**: Safely runs multiple times - won't create duplicates  
✅ **Realistic Data**: 
- Different Delhi areas with coordinates
- Random ratings (3.5 - 5.0 stars)
- Bookings spread across past 90 days
- 70% completed, 30% cancelled bookings
- Reviews with authentic comments

✅ **Manual Control**: Can be run separately via CLI

## Auto-Seeding in Development Mode

The seed script runs automatically when:
1. Backend starts in development mode
2. Categories have been seeded
3. Demo users have been initialized

**No action required** - it will run on `npm run dev`

To disable auto-seeding (if needed), comment out lines in `/backend/src/index.ts`:

```typescript
if (process.env.NODE_ENV === 'development') {
  try {
    await seedDevelopmentData();
  } catch (err) {
    logger.warn('seed_data_skipped', { ... });
  }
}
```

## Manual Seeding

Run the seed script independently:

```bash
cd backend
npm run seed
```

**Output Example:**
```
🌱 Starting development data seed...
👷 Creating 30 workers...
👥 Creating 15 customers...
📅 Creating 100 past bookings...
⭐ Creating reviews for completed bookings...
✅ Development seed data created successfully!
  ✓ 30 workers created
  ✓ 15 customers created
  ✓ 100 bookings created (70 completed, 30 cancelled)
  ✓ 70 reviews created
```

## Data Structure

### Workers (30 Total)

| Property | Details |
|----------|---------|
| **Services** | Plumber, Electrician, Tutor, Carpenter, Painter, AC Repair |
| **Ratings** | Random 3.5 - 5.0 stars |
| **Experience** | 2 - 10 years |
| **Hourly Rate** | ₹299 - ₹799 |
| **Locations** | 8 Delhi areas with GPS coordinates |
| **Availability** | All marked as available |
| **Verification** | All background verified |

**Delhi Areas Included:**
- Noida (201301)
- Gurgaon (122001)
- East Delhi (110092)
- South Delhi (110016)
- North Delhi (110006)
- West Delhi (110059)
- Dwarka (110075)
- Greater Noida (201306)

### Customers (15 Total)

- Various names (realistic Indian names)
- Spread across 8 Delhi areas
- All verified and active

### Bookings (100 Total)

| Status | Count | Details |
|--------|-------|---------|
| **Completed** | ~70 | Has review, payment marked as 'paid' |
| **Cancelled** | ~30 | Payment marked as 'refunded' |

**Timeline**: Bookings span 1-90 days ago  
**Amount**: ₹299 - ₹897 (multiples of service base price)

### Reviews (Auto-Generated)

- Linked to completed bookings only
- Ratings: Mix of 3-5 stars
- Authentic comments (10 variations)
- Automatically updates worker average ratings via trigger

## Database State

**Before Seeding:**
```
- 0 workers
- 0 customers
- 0 bookings
- 0 reviews
```

**After Seeding:**
```
- 30 workers
- 15 customers
- 100 bookings
- ~70 reviews
```

## Idempotency

The script checks before inserting:
```typescript
const seedCheckResult = await query(
  `SELECT COUNT(*) as count FROM booking_audit_logs 
   WHERE actor_role = 'customer' AND reason = 'seed_data'`
);

if (seedCheckResult.rows[0]?.count > 0) {
  console.log('✓ Development seed data already exists. Skipping.');
  return;
}
```

**Result**: Running `npm run seed` multiple times is safe - it will only seed once and skip on subsequent runs.

## Testing Workflows

### 1. Test Booking Flow
- Use any seeded customer phone to login
- View available workers from seeded data
- Create a new booking

### 2. Test Reviews Page
- Login as demo customer
- See past completed bookings with review data
- Verify ratings and comments

### 3. Test Admin Dashboard
- Login as admin
- See heatmap with worker distribution
- Analyze booking statistics

### 4. Test Worker Dashboard
- Login as any seeded worker
- See completed job history
- View earnings and reviews

## Reset Data

To completely reset and re-seed:

```bash
# In database client (psql, DBeaver, etc.)
DELETE FROM reviews;
DELETE FROM bookings;
DELETE FROM worker_profiles;
DELETE FROM worker_skills;
DELETE FROM users WHERE role IN ('worker', 'customer') AND phone NOT LIKE '9999999%';
```

Then run `npm run seed` again.

## Files Modified

- **New Files:**
  - `/backend/src/services/seedService.ts` - Core seed logic
  - `/backend/seed.ts` - CLI entry point
  - `SEED_SCRIPT.md` - This documentation

- **Updated Files:**
  - `/backend/src/index.ts` - Added seed initialization
  - `/backend/package.json` - Added `npm run seed` command

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `NODE_ENV=development` - For auto-seeding on start

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Seed not running** | Ensure `NODE_ENV=development` in `.env` |
| **Duplicate phone numbers** | Run reset queries above, then re-seed |
| **Connection timeout** | Check DATABASE_URL is valid and PostgreSQL is running |
| **Missing categories** | Categories must be seeded first (done automatically) |

## Performance

- **Execution Time**: ~5-15 seconds (depending on hardware)
- **Database Size**: ~2-3 MB of test data
- **Network Impact**: Minimal (local operations only)

## Future Enhancements

Potential additions:
- [ ] Worker availability slots generation
- [ ] Socket.io message history
- [ ] Push notification records
- [ ] Payout/earnings records
- [ ] Dispute records
- [ ] Admin activity logs

## Support

For issues or questions:
1. Check that PostgreSQL is running: `psql --version`
2. Verify connection: `psql $DATABASE_URL`
3. Check logs: Look in backend terminal for error messages
4. Manual reset as shown in "Reset Data" section above
