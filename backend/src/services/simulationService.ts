/**
 * Real-time Simulation System
 * Generates realistic activity in development mode:
 * - Worker location updates (every 5 seconds)
 * - Fake booking requests (every 2-3 minutes)
 * - Auto-acceptance by available workers
 * - Socket.io event emissions
 */

import { query } from '../db/client';
import { Server as SocketServer } from 'socket.io';

interface SimulationState {
  locationUpdateInterval?: NodeJS.Timeout;
  bookingCreationInterval?: NodeJS.Timeout;
  workers: Array<{ id: string; current_lat: number; current_lng: number }>;
  isRunning: boolean;
}

const DELHI_BOUNDS = {
  minLat: 28.4089,
  maxLat: 28.7355,
  minLng: 76.8066,
  maxLng: 77.3910,
};

const state: SimulationState = {
  workers: [],
  isRunning: false,
};

let ioInstance: SocketServer | null = null;

// Random number helper
function random(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// Get a random location within Delhi
function getRandomDelhiLocation() {
  return {
    lat: random(DELHI_BOUNDS.minLat, DELHI_BOUNDS.maxLat),
    lng: random(DELHI_BOUNDS.minLng, DELHI_BOUNDS.maxLng),
  };
}

// Move worker location slightly (simulating movement)
function updateWorkerLocation(worker: (typeof state.workers)[0]) {
  const latChange = (Math.random() - 0.5) * 0.005; // ~500m variance
  const lngChange = (Math.random() - 0.5) * 0.005;

  const newLat = Math.max(DELHI_BOUNDS.minLat, Math.min(DELHI_BOUNDS.maxLat, worker.current_lat + latChange));
  const newLng = Math.max(DELHI_BOUNDS.minLng, Math.min(DELHI_BOUNDS.maxLng, worker.current_lng + lngChange));

  return { lat: newLat, lng: newLng };
}

// Get service categories
async function getRandomCategory() {
  const result = await query('SELECT id, slug, name, base_price FROM categories ORDER BY RANDOM() LIMIT 1');
  return result.rows[0];
}

// Get a random customer
async function getRandomCustomer() {
  const result = await query(
    `SELECT id, lat, lng, locality FROM users 
     WHERE role = 'customer' AND lat IS NOT NULL AND lng IS NOT NULL 
     ORDER BY RANDOM() LIMIT 1`
  );
  return result.rows[0];
}

// Get available workers
async function getAvailableWorkers() {
  const result = await query(
    `SELECT id, user_id, current_lat, current_lng FROM worker_profiles 
     WHERE is_available = true AND (current_lat IS NOT NULL AND current_lng IS NOT NULL)
     LIMIT 5`
  );
  return result.rows;
}

// Create a fake booking
async function createFakeBooking() {
  try {
    const category = await getRandomCategory();
    const customer = await getRandomCustomer();
    const workers = await getAvailableWorkers();

    if (!category || !customer || workers.length === 0) {
      console.log('⏭️  Skipping booking: missing data');
      return null;
    }

    // Schedule for today or tomorrow
    const scheduledTime = new Date();
    scheduledTime.setHours(scheduledTime.getHours() + Math.random() * 8 + 1); // 1-9 hours from now

    const worker = workers[Math.floor(Math.random() * workers.length)];
    const amount = category.base_price + Math.floor(Math.random() * 300);

    const bookingResult = await query(
      `INSERT INTO bookings (
        customer_id, worker_id, category_id, status,
        requested_at, scheduled_at, address, lat, lng,
        amount, payment_status, description, is_simulated
      ) VALUES ($1, $2, $3, 'pending', NOW(), $4, $5, $6, $7, $8, 'pending', $9, true)
       RETURNING id, customer_id, amount`,
      [
        customer.id,
        worker.id,
        category.id,
        scheduledTime.toISOString(),
        `${customer.locality}, Delhi`,
        customer.lat,
        customer.lng,
        amount,
        `Auto-created simulation booking for ${category.slug}`,
      ]
    );

    const booking = bookingResult.rows[0];
    console.log(`📝 New booking created: ${booking.id.slice(0, 8)}... (${category.name})`);

    // Emit socket event to all customers
    if (ioInstance) {
      ioInstance.emit('new_booking', {
        booking_id: booking.id,
        category: category.name,
        amount: booking.amount,
      });
      ioInstance.to('admin:dashboard').emit('admin:activity', {
        type: 'new_booking',
        booking_id: booking.id,
        category: category.name,
        amount: booking.amount,
        ts: new Date().toISOString(),
      });
    }

    // Schedule auto-acceptance after random delay (10-60 seconds)
    setTimeout(() => {
      acceptFakeBooking(booking.id, worker.id, customer.id, category.name);
    }, Math.random() * 50000 + 10000);

    return booking;
  } catch (err) {
    console.error('❌ Booking creation error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// Auto-accept booking
async function acceptFakeBooking(bookingId: string, workerId: string, customerId: string, categoryName: string) {
  try {
    // Check if booking still exists and is pending
    const checkResult = await query('SELECT status FROM bookings WHERE id = $1', [bookingId]);
    if (!checkResult.rows[0] || checkResult.rows[0].status !== 'pending') {
      return; // Booking already processed
    }

    // Update to accepted
    await query(
      `UPDATE bookings SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
      [bookingId]
    );

    console.log(`✅ Booking accepted: ${bookingId.slice(0, 8)}...`);

    // Emit socket event
    if (ioInstance) {
      ioInstance.to(`customer:${customerId}`).emit('booking_accepted', {
        booking_id: bookingId,
        worker_id: workerId,
        category: categoryName,
      });
      ioInstance.to('admin:dashboard').emit('admin:activity', {
        type: 'booking_accepted',
        booking_id: bookingId,
        category: categoryName,
        ts: new Date().toISOString(),
      });

      // Emit to all admins/observers
      ioInstance.emit('booking_state_change', {
        booking_id: bookingId,
        status: 'accepted',
      });
    }

    // Schedule job start after 30-120 seconds
    setTimeout(() => {
      startFakeJob(bookingId, workerId, customerId);
    }, Math.random() * 90000 + 30000);
  } catch (err) {
    console.error('❌ Booking acceptance error:', err instanceof Error ? err.message : String(err));
  }
}

// Start a fake job
async function startFakeJob(bookingId: string, workerId: string, customerId: string) {
  try {
    const checkResult = await query('SELECT status FROM bookings WHERE id = $1', [bookingId]);
    if (!checkResult.rows[0] || checkResult.rows[0].status !== 'accepted') {
      return;
    }

    await query(
      `UPDATE bookings SET status = 'in_progress', started_at = NOW() WHERE id = $1`,
      [bookingId]
    );

    console.log(`🚗 Job started: ${bookingId.slice(0, 8)}...`);

    if (ioInstance) {
      ioInstance.to(`customer:${customerId}`).emit('job_started', {
        booking_id: bookingId,
      });
    }

    // Schedule job completion after 2-5 minutes
    setTimeout(() => {
      completeFakeJob(bookingId, workerId, customerId);
    }, Math.random() * 180000 + 120000);
  } catch (err) {
    console.error('❌ Job start error:', err instanceof Error ? err.message : String(err));
  }
}

// Complete a fake job
async function completeFakeJob(bookingId: string, workerId: string, customerId: string) {
  try {
    const checkResult = await query('SELECT status FROM bookings WHERE id = $1', [bookingId]);
    if (!checkResult.rows[0] || checkResult.rows[0].status !== 'in_progress') {
      return;
    }

    await query(
      `UPDATE bookings SET status = 'completed', completed_at = NOW(), payment_status = 'paid' WHERE id = $1`,
      [bookingId]
    );

    console.log(`🏁 Job completed: ${bookingId.slice(0, 8)}...`);

    if (ioInstance) {
      ioInstance.to(`customer:${customerId}`).emit('job_completed', {
        booking_id: bookingId,
        worker_id: workerId,
      });
    }

    // Auto-create review after 5-10 seconds
    setTimeout(() => {
      createFakeReview(bookingId, customerId, workerId);
    }, Math.random() * 5000 + 5000);
  } catch (err) {
    console.error('❌ Job completion error:', err instanceof Error ? err.message : String(err));
  }
}

// Create a fake review
async function createFakeReview(bookingId: string, customerId: string, workerId: string) {
  try {
    const checkResult = await query('SELECT * FROM reviews WHERE booking_id = $1', [bookingId]);
    if (checkResult.rows[0]) {
      return; // Review already exists
    }

    const ratings = [5, 5, 4, 5, 4, 5, 3, 5, 4, 5];
    const comments = [
      'Excellent service! Highly satisfied.',
      'Professional and quick work. Recommended!',
      'Good job. Will book again.',
      'Very efficient. Thank you!',
      'Perfect! Everything done correctly.',
    ];

    const rating = ratings[Math.floor(Math.random() * ratings.length)];
    const comment = comments[Math.floor(Math.random() * comments.length)];

    await query(
      `INSERT INTO reviews (booking_id, customer_id, worker_id, rating, comment) 
       VALUES ($1, $2, $3, $4, $5)`,
      [bookingId, customerId, workerId, rating, comment]
    );

    console.log(`⭐ Review created: ${bookingId.slice(0, 8)}... (${rating}⭐)`);
  } catch (err) {
    console.error('❌ Review creation error:', err instanceof Error ? err.message : String(err));
  }
}

// Update worker locations
async function updateWorkerLocations() {
  try {
    if (state.workers.length === 0) {
      return; // No workers loaded yet
    }

    for (const worker of state.workers) {
      const newLocation = updateWorkerLocation(worker);

      await query(
        `UPDATE worker_profiles SET current_lat = $1, current_lng = $2, last_seen = NOW() WHERE id = $3`,
        [newLocation.lat, newLocation.lng, worker.id]
      );

      // Update state
      worker.current_lat = newLocation.lat;
      worker.current_lng = newLocation.lng;

      // Emit to tracking subscribers
      if (ioInstance) {
        ioInstance.emit('worker:location_update', {
          worker_id: worker.id,
          lat: newLocation.lat,
          lng: newLocation.lng,
        });
      }
    }
  } catch (err) {
    console.error('❌ Location update error:', err instanceof Error ? err.message : String(err));
  }
}

// Load available workers from database
async function loadWorkers() {
  try {
    const result = await query(
      `SELECT id, current_lat, current_lng FROM worker_profiles 
       WHERE is_available = true AND (current_lat IS NOT NULL OR current_lng IS NOT NULL)
       ORDER BY RANDOM() LIMIT 10`
    );

    state.workers = result.rows.map((row: any) => ({
      id: row.id,
      current_lat: row.current_lat ? parseFloat(row.current_lat) : random(DELHI_BOUNDS.minLat, DELHI_BOUNDS.maxLat),
      current_lng: row.current_lng ? parseFloat(row.current_lng) : random(DELHI_BOUNDS.minLng, DELHI_BOUNDS.maxLng),
    }));

    console.log(`📍 Loaded ${state.workers.length} workers for simulation`);
  } catch (err) {
    console.error('❌ Worker loading error:', err instanceof Error ? err.message : String(err));
  }
}

// Start simulation
export async function startRealtimeSimulation(io: SocketServer) {
  if (state.isRunning) {
    console.log('⚠️  Simulation already running');
    return;
  }

  ioInstance = io;
  state.isRunning = true;

  console.log('🎬 Starting real-time simulation system...');

  // Load initial workers
  await loadWorkers();

  // Worker location updates every 5 seconds
  state.locationUpdateInterval = setInterval(() => {
    updateWorkerLocations().catch((err) => console.error('Location update failed:', err));
  }, 5000);

  // Fake booking creation every 2-3 minutes
  state.bookingCreationInterval = setInterval(() => {
    createFakeBooking().catch((err) => console.error('Booking creation failed:', err));
  }, Math.random() * 60000 + 120000);

  // Create first booking immediately (for demo purposes)
  setTimeout(() => {
    createFakeBooking().catch((err) => console.error('Initial booking creation failed:', err));
  }, 3000);

  console.log('✅ Simulation started successfully');
  console.log('   📍 Worker locations updating every 5 seconds');
  console.log('   📝 New bookings every 2-3 minutes');
  console.log('   ✅ Auto-acceptance within 10-60 seconds');
}

// Stop simulation
export function stopRealtimeSimulation() {
  if (!state.isRunning) return;

  if (state.locationUpdateInterval) {
    clearInterval(state.locationUpdateInterval as any);
  }
  if (state.bookingCreationInterval) {
    clearInterval(state.bookingCreationInterval as any);
  }

  state.isRunning = false;
  ioInstance = null;

  console.log('⏹️  Real-time simulation stopped');
}

// Get simulation status
export function getSimulationStatus() {
  return {
    isRunning: state.isRunning,
    workersSimulated: state.workers.length,
    uptime: state.isRunning ? 'Active' : 'Inactive',
  };
}
