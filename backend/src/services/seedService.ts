import { query } from '../db/client';

const DELHI_AREAS = [
  { area: 'Noida', pincode: '201301', lat: 28.5355, lng: 77.391 },
  { area: 'Gurgaon', pincode: '122001', lat: 28.4089, lng: 77.0266 },
  { area: 'East Delhi', pincode: '110092', lat: 28.6139, lng: 77.2499 },
  { area: 'South Delhi', pincode: '110016', lat: 28.5244, lng: 77.1855 },
  { area: 'North Delhi', pincode: '110006', lat: 28.7041, lng: 77.227 },
  { area: 'West Delhi', pincode: '110059', lat: 28.6692, lng: 77.0466 },
  { area: 'Dwarka', pincode: '110075', lat: 28.5924, lng: 77.0379 },
  { area: 'Greater Noida', pincode: '201306', lat: 28.4744, lng: 77.5853 },
];

const SERVICES = [
  { category_slug: 'plumber', skills: ['Pipe repair', 'Leak detection', 'Faucet installation'] },
  { category_slug: 'electrician', skills: ['Wiring', 'Switch installation', 'Short circuit repair'] },
  { category_slug: 'tutor', skills: ['Mathematics', 'English', 'Science'] },
  { category_slug: 'carpenter', skills: ['Door fitting', 'Wardrobe repair', 'Shelves'] },
  { category_slug: 'painter', skills: ['Wall painting', 'Texture coating', 'Waterproofing'] },
  { category_slug: 'ac-repair', skills: ['Gas refill', 'Servicing', 'Coil cleaning'] },
];

const WORKER_NAMES = [
  'Raj Kumar', 'Amit Singh', 'Vikram Verma', 'Suresh Patel', 'Ravi Kumar',
  'Anil Sharma', 'Sanjeev Yadav', 'Manoj Gupta', 'Deepak Raj', 'Rohan Singh',
  'Pradeep Nair', 'Ashok Kumar', 'Sanjay Sinha', 'Nitin Joshi', 'Rohit Bhat',
  'Varun Mishra', 'Akshay Singh', 'Harish Kumar', 'Arjun Sharma', 'Bhaskar Rao',
  'Chaturvedi Singh', 'Dharampal Yadav', 'Eknath Patel', 'Faisal Khan', 'Girish Iyer',
  'Harpreet Kaur', 'Inder Pal', 'Jugal Kishore', 'Kailash Sharma', 'Lokesh Verma',
];

const CUSTOMER_NAMES = [
  'Priya Sharma', 'Anjali Gupta', 'Neha Singh', 'Pooja Patel', 'Divya Rao',
  'Kavya Nair', 'Swati Joshi', 'Sneha Sinha', 'Ritika Verma', 'Meera Bhat',
  'Ananya Mishra', 'Isha Khan', 'Roshni Iyer', 'Tanvi Sharma', 'Vaishali Yadav',
];

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomRating(): number {
  return parseFloat((Math.random() * (5.0 - 3.5) + 3.5).toFixed(2));
}

function getRandomPhone(): string {
  // Generate phone numbers starting from 9 (valid Indian phone)
  return '9' + Math.random().toString().substring(2, 11);
}

async function seedRequestedJobsForTesting(count: number) {
  const marker = '[seed-requested-job]';
  const existingResult = await query(
    `SELECT COUNT(*)::int AS count
     FROM bookings
     WHERE status = 'pending' AND description ILIKE $1`,
    [`%${marker}%`]
  );
  const existing = Number(existingResult.rows[0]?.count || 0);
  if (existing >= count) {
    console.log(`✓ Requested jobs already seeded (${existing})`);
    return;
  }

  const toCreate = count - existing;
  const workersResult = await query(
    `SELECT wp.id, wp.category_id, c.name AS category_name, u.locality, u.pincode, u.lat, u.lng
     FROM worker_profiles wp
     JOIN users u ON u.id = wp.user_id
     JOIN categories c ON c.id = wp.category_id
     WHERE wp.is_available = true AND u.is_active = true
     ORDER BY random()
     LIMIT 200`
  );
  const customersResult = await query(
    `SELECT id
     FROM users
     WHERE role = 'customer' AND is_active = true
     ORDER BY random()
     LIMIT 200`
  );

  const workers = workersResult.rows;
  const customers = customersResult.rows;
  if (!workers.length || !customers.length) {
    console.log('⚠ Skipping requested-job seed: missing workers or customers');
    return;
  }

  for (let i = 0; i < toCreate; i++) {
    const worker = workers[i % workers.length];
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const scheduledAt = new Date(Date.now() + (i + 1) * 45 * 60 * 1000);
    const baseAddress = worker.locality || getRandomElement(DELHI_AREAS).area;
    const pincode = worker.pincode || getRandomElement(DELHI_AREAS).pincode;
    const lat = worker.lat != null ? Number(worker.lat) + (Math.random() - 0.5) * 0.01 : null;
    const lng = worker.lng != null ? Number(worker.lng) + (Math.random() - 0.5) * 0.01 : null;
    const amount = 29900 + Math.floor(Math.random() * 60000);

    await query(
      `INSERT INTO bookings (
         customer_id, worker_id, category_id, status,
         scheduled_at, address, lat, lng,
         amount, payment_status, description
       ) VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, 'pending', $9)`,
      [
        customer.id,
        worker.id,
        worker.category_id,
        scheduledAt,
        `${baseAddress}, Delhi - ${pincode}`,
        lat,
        lng,
        amount,
        `${marker} ${worker.category_name} service request`,
      ]
    );
  }

  console.log(`✓ Seeded ${toCreate} requested jobs for dashboard testing`);
}

export async function seedDevelopmentData() {
  try {
    // Check if already seeded by checking for seed marker in workers
    const seedCheckResult = await query(
      `SELECT COUNT(*) as count FROM worker_profiles WHERE bio LIKE 'Professional%' AND bio ILIKE '%years of experience'`
    );

    if (seedCheckResult.rows[0]?.count > 600) {
      // More than 20 workers with our bio pattern indicates already seeded
      console.log('✓ Development seed data already exists. Skipping bulk seed.');
      await seedRequestedJobsForTesting(10);
      return;
    }

    console.log('🌱 Starting development data seed...');

    // Get category IDs
    const categoriesResult = await query('SELECT id, slug FROM categories');
    const categoryMap: { [key: string]: string } = {};
    categoriesResult.rows.forEach((row: any) => {
      categoryMap[row.slug] = row.id;
    });

    // Create 30 Workers
    const workerIds: string[] = [];
    console.log('👷 Creating 30 workers...');

    for (let i = 0; i < 30; i++) {
      const service = getRandomElement(SERVICES);
      const location = getRandomElement(DELHI_AREAS);
      const rating = getRandomRating();
      const name = WORKER_NAMES[i % WORKER_NAMES.length];
      const phone = getRandomPhone();

      // Create user
      const userResult = await query(
        `INSERT INTO users (phone, name, role, pincode, city, locality, lat, lng, is_verified, is_active)
         VALUES ($1, $2, 'worker', $3, 'Delhi', $4, $5, $6, true, true)
         RETURNING id`,
        [phone, name, location.pincode, location.area, location.lat, location.lng]
      );
      const userId = userResult.rows[0].id;

      // Create worker profile
      const workerResult = await query(
        `INSERT INTO worker_profiles (user_id, category_id, bio, experience_years, hourly_rate, is_available, is_background_verified, average_rating, rating)
         VALUES ($1, $2, $3, $4, $5, true, true, $6, $6)
         RETURNING id`,
        [
          userId,
          categoryMap[service.category_slug],
          `Professional ${service.category_slug.replace('-', ' ')} with ${2 + i % 8} years of experience`,
          2 + (i % 8),
          299 + Math.floor(Math.random() * 500),
          rating,
        ]
      );
      const workerId = workerResult.rows[0].id;
      workerIds.push(workerId);

      // Add skills
      for (const skill of service.skills) {
        await query('INSERT INTO worker_skills (worker_id, skill) VALUES ($1, $2)', [workerId, skill]);
      }
    }

    // Create 15 Customers
    const customerIds: string[] = [];
    console.log('👥 Creating 15 customers...');

    for (let i = 0; i < 15; i++) {
      const location = getRandomElement(DELHI_AREAS);
      const name = CUSTOMER_NAMES[i % CUSTOMER_NAMES.length];
      const phone = getRandomPhone();

      const customerResult = await query(
        `INSERT INTO users (phone, name, role, pincode, city, locality, lat, lng, is_verified, is_active)
         VALUES ($1, $2, 'customer', $3, 'Delhi', $4, $5, $6, true, true)
         RETURNING id`,
        [phone, name, location.pincode, location.area, location.lat, location.lng]
      );
      customerIds.push(customerResult.rows[0].id);
    }

    // Create 100 Past Bookings
    console.log('📅 Creating 100 past bookings...');

    const bookingIds: { id: string; status: 'completed' | 'cancelled' }[] = [];
    const now = new Date();

    // Get categories for random assignment
    const categoriesArray = Object.values(categoryMap);

    for (let i = 0; i < 100; i++) {
      const customerId = getRandomElement(customerIds);
      const workerId = getRandomElement(workerIds);
      const categoryId = getRandomElement(categoriesArray);
      const location = getRandomElement(DELHI_AREAS);

      // Random date in the past (1-90 days ago)
      const daysAgo = Math.floor(Math.random() * 90) + 1;
      const scheduledDate = new Date(now);
      scheduledDate.setDate(scheduledDate.getDate() - daysAgo);
      scheduledDate.setHours(Math.floor(Math.random() * 17) + 9); // 9 AM to 5 PM

      // Status: 70% completed, 30% cancelled
      const isCompleted = Math.random() > 0.3;
      const status = isCompleted ? 'completed' : 'cancelled';

      const bookingResult = await query(
        `INSERT INTO bookings (
          customer_id, worker_id, category_id, status,
          scheduled_at, address, lat, lng,
          amount, payment_status, description,
          accepted_at, started_at, completed_at, cancelled_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          customerId,
          workerId,
          categoryId,
          status,
          scheduledDate,
          `${location.area}, Delhi - ${location.pincode}`,
          location.lat + (Math.random() - 0.5) * 0.02,
          location.lng + (Math.random() - 0.5) * 0.02,
          299 * (1 + Math.floor(Math.random() * 3)), // Amount
          isCompleted ? 'paid' : 'refunded',
          'Professional service booking',
          new Date(scheduledDate.getTime() + 600000), // 10 mins after scheduled
          isCompleted ? new Date(scheduledDate.getTime() + 1800000) : null, // 30 mins after accepted
          isCompleted ? new Date(scheduledDate.getTime() + 7200000) : null, // 2 hours after start
          !isCompleted ? new Date(scheduledDate.getTime() + 3600000) : null, // 1 hour after scheduled
        ]
      );

      bookingIds.push({
        id: bookingResult.rows[0].id,
        status: status as 'completed' | 'cancelled',
      });
    }

    // Create Reviews for Completed Bookings
    console.log('⭐ Creating reviews for completed bookings...');

    const completedBookings = bookingIds.filter((b) => b.status === 'completed');
    const reviewRatings = [5, 5, 4, 5, 4, 5, 3, 5, 4, 5];
    const reviewComments = [
      'Excellent service! Highly satisfied.',
      'Professional and quick work. Recommended!',
      'Good job. Will book again.',
      'Very efficient. Thank you!',
      'Perfect! Everything done correctly.',
      'Quick service and reasonable price.',
      'Good worker. Completed on time.',
      'Satisfied with the work quality.',
      'Would recommend to friends.',
      'Professional and courteous.',
    ];

    for (const booking of completedBookings) {
      // Get booking details
      const bookingDetailsResult = await query(
        'SELECT customer_id, worker_id FROM bookings WHERE id = $1',
        [booking.id]
      );

      if (bookingDetailsResult.rows.length === 0) continue;

      const { customer_id, worker_id } = bookingDetailsResult.rows[0];

      const rating = getRandomElement(reviewRatings);
      const comment = getRandomElement(reviewComments);

      await query(
        `INSERT INTO reviews (booking_id, customer_id, worker_id, rating, comment)
         VALUES ($1, $2, $3, $4, $5)`,
        [booking.id, customer_id, worker_id, rating, comment]
      );
    }

    console.log('✅ Development seed data created successfully!');
    console.log(`  ✓ 30 workers created`);
    console.log(`  ✓ 15 customers created`);
    console.log(`  ✓ 100 bookings created (${completedBookings.length} completed, ${bookingIds.length - completedBookings.length} cancelled)`);
    console.log(`  ✓ ${completedBookings.length} reviews created`);
    await seedRequestedJobsForTesting(10);
  } catch (err) {
    console.error('❌ Seed data error:', err instanceof Error ? err.message : String(err));
    throw err;
  }
}
