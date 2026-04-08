CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('customer', 'worker', 'admin');
CREATE TYPE job_status AS ENUM ('pending', 'accepted', 'arriving', 'in_progress', 'completed', 'cancelled', 'disputed');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded', 'failed');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(15) UNIQUE NOT NULL,
  name VARCHAR(100),
  email VARCHAR(200),
  role user_role NOT NULL DEFAULT 'customer',
  avatar_url TEXT,
  pincode VARCHAR(10),
  city VARCHAR(100),
  locality VARCHAR(200),
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(60) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(10),
  description TEXT,
  base_price INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO categories (slug, name, icon, description, base_price) VALUES
  ('plumber','Plumber','🔧','Pipe repairs, faucet fitting, drainage',299),
  ('electrician','Electrician','⚡','Wiring, switches, appliance repair',349),
  ('carpenter','Carpenter','🪚','Furniture repair, door fitting',399),
  ('ac-repair','AC Repair','❄️','Servicing, gas refill, installation',549),
  ('painter','Painter','🎨','Wall painting, waterproofing',499),
  ('home-cleaning','Home Cleaner','🧹','Deep clean, bathroom, kitchen',299),
  ('tutor','Home Tutor','📚','School subjects, entrance prep',400),
  ('pest-control','Pest Control','🐛','Cockroach, termite, rodent treatment',699),
  ('cctv','CCTV / Security','📹','Installation, maintenance',799),
  ('appliance-repair','Appliance Repair','🧰','Washing machine, fridge, microwave',399),
  ('makeup-artist','Makeup Artist','💄','Party, bridal, event makeup',999),
  ('fitness-trainer','Fitness Trainer','🏋️','Personal training at home',699),
  ('laptop-repair','Laptop Repair','💻','Hardware and software fixes',499),
  ('car-wash','Car Wash','🚗','Doorstep car wash and detailing',399),
  ('packers-movers','Packers & Movers','📦','Shifting and moving support',1199),
  ('water-purifier','Water Purifier Service','🚰','RO maintenance and filter change',499),
  ('salon-home','Salon at Home','💇','Haircut, grooming, beauty services',599),
  ('gardening','Gardening','🌿','Garden setup and maintenance',449),
  ('mobile-repair','Mobile Repair','📱','Screen and battery replacement',499),
  ('interior-design','Interior Design','🛋️','Consultation and home styling',1499);

CREATE TABLE worker_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id),
  bio TEXT,
  experience_years INT DEFAULT 0,
  hourly_rate INT NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  is_background_verified BOOLEAN DEFAULT FALSE,
  total_jobs INT DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0.00,
  rating DECIMAL(3,2) DEFAULT 0.00,
  rating_count INT DEFAULT 0,
  current_lat DECIMAL(10,8),
  current_lng DECIMAL(11,8),
  last_seen TIMESTAMPTZ,
  upi_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE worker_skills (
  worker_id UUID REFERENCES worker_profiles(id) ON DELETE CASCADE,
  skill VARCHAR(100) NOT NULL,
  PRIMARY KEY (worker_id, skill)
);

CREATE TABLE availability_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_booked BOOLEAN DEFAULT FALSE,
  UNIQUE (worker_id, date, start_time)
);

CREATE TABLE worker_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (worker_id, day_of_week, start_time)
);

CREATE TABLE blocked_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_slot VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (worker_id, date, time_slot)
);

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES users(id),
  worker_id UUID NOT NULL REFERENCES worker_profiles(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  slot_id UUID REFERENCES availability_slots(id),
  status job_status NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  description TEXT,
  address TEXT NOT NULL,
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  scheduled_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  arriving_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  amount INT NOT NULL,
  payment_status payment_status DEFAULT 'pending',
  razorpay_order_id VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  razorpay_refund_id VARCHAR(100),
  refund_status VARCHAR(20) DEFAULT 'not_applicable',
  refund_amount INT DEFAULT 0,
  refund_processed_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  is_simulated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE booking_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id),
  actor_role user_role,
  action VARCHAR(100) NOT NULL,
  from_status job_status,
  to_status job_status,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  read_status BOOLEAN DEFAULT FALSE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID UNIQUE NOT NULL REFERENCES bookings(id),
  customer_id UUID NOT NULL REFERENCES users(id),
  worker_id UUID NOT NULL REFERENCES worker_profiles(id),
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_worker ON bookings(worker_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_refund_status ON bookings(refund_status);
CREATE INDEX idx_worker_profiles_category ON worker_profiles(category_id);
CREATE INDEX idx_availability_slots_worker_date ON availability_slots(worker_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_availability_slots_worker_date_time_slot ON availability_slots(worker_id, date, start_time);
CREATE INDEX idx_worker_availability_worker ON worker_availability(worker_id, day_of_week);
CREATE INDEX idx_blocked_slots_worker_date ON blocked_slots(worker_id, date);
CREATE INDEX idx_booking_audit_logs_booking ON booking_audit_logs(booking_id, created_at DESC);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_status);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_worker_profile_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_worker_id UUID;
BEGIN
  target_worker_id := COALESCE(NEW.worker_id, OLD.worker_id);

  UPDATE worker_profiles
  SET
    average_rating = COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 2) FROM reviews r WHERE r.worker_id = target_worker_id), 0),
    rating = COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 2) FROM reviews r WHERE r.worker_id = target_worker_id), 0),
    rating_count = (SELECT COUNT(*)::int FROM reviews r WHERE r.worker_id = target_worker_id)
  WHERE id = target_worker_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_reviews_refresh_worker_rating
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION refresh_worker_profile_rating();
