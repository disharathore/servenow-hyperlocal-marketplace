'use client';
import Link from 'next/link';
import { ArrowRight, Database, Server, Smartphone, Shield, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ArchitecturePage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-8">
        <div className="max-w-6xl mx-auto px-4">
          <Link href="/" className="inline-flex items-center gap-1 text-blue-100 hover:text-white mb-6">
            <span>←</span> Back to ServeNow
          </Link>
          <h1 className="text-4xl font-bold mb-2">System Architecture</h1>
          <p className="text-blue-100">Production-grade hyperlocal service marketplace design</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Tech Stack */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Technology Stack</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Smartphone, label: 'Frontend', items: 'Next.js 14, TypeScript, TailwindCSS, Framer Motion, Zustand' },
              { icon: Server, label: 'Backend', items: 'Node.js, Express.ts, Socket.io, JWT/OTP Auth' },
              { icon: Database, label: 'Database', items: 'PostgreSQL (Neon), Redis (Upstash), Row-level locking' },
              { icon: Shield, label: 'Security', items: 'Helmet, Rate limiting, OTP validation, Payment encryption' },
              { icon: Zap, label: 'Realtime', items: 'Socket.io (websockets), Live tracking, Job notifications' },
              { icon: ArrowRight, label: 'Payments', items: 'Razorpay integration, Webhook verification, Order tracking' },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="card p-5 border border-blue-100"
                >
                  <Icon className="text-blue-600 mb-2" size={24} />
                  <h3 className="font-semibold text-gray-900 mb-1">{item.label}</h3>
                  <p className="text-sm text-gray-600">{item.items}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Core Features */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Core Features & Mechanisms</h2>
          <div className="space-y-6">
            {[
              {
                title: 'OTP-Based Authentication',
                desc: 'No passwords — Indian users authenticate via SMS OTP',
                tech: 'MSG91 API, Redis (5min expiry), JWT (7d session)',
                icon: '🔐'
              },
              {
                title: 'Double-Booking Prevention',
                desc: 'Distributed lock mechanism ensures slots can only be booked once',
                tech: 'Redis SETNX, 30-second lock TTL, Automatic unlock',
                icon: '🔒'
              },
              {
                title: 'Real-Time Job Tracking',
                desc: 'Workers share live location; customers see worker moving on map with ETA',
                tech: 'Socket.io (15s geolocation updates), Google Maps API, Haversine distance',
                icon: '📍'
              },
              {
                title: 'Razorpay Payment Integration',
                desc: 'Instant payments, webhook confirmation, payment status tracking',
                tech: 'Razorpay Orders API, HMAC-SHA256 webhook verification',
                icon: '💳'
              },
              {
                title: 'Worker Availability Slots',
                desc: 'Workers set recurring weekly slots; system generates 4-week calendar automatically',
                tech: 'Slot management API, Postgres scheduling, On-conflict handling',
                icon: '📅'
              },
              {
                title: 'Role-Based Access Control',
                desc: '3 separate experiences (customer/worker/admin) with client-side routing protection',
                tech: 'JWT role field, Zustand state persistence, Next.js route groups',
                icon: '👥'
              }
            ].map((feature, idx) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="card p-6 border-l-4 border-blue-500"
              >
                <div className="flex gap-4">
                  <div className="text-3xl flex-shrink-0">{feature.icon}</div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg">{feature.title}</h3>
                    <p className="text-gray-600 text-sm mt-1">{feature.desc}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {feature.tech.split(',').map(t => (
                        <span key={t} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                          {t.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* User Flows */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">User Flows</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: '👤 Customer Journey',
                steps: [
                  'Phone → OTP Verification',
                  'Browse services & search',
                  'View workers (rating, distance, reviews)',
                  'Select slot & enter address',
                  'Razorpay payment checkout',
                  'Live tracking on map',
                  'Review & rating after completion'
                ]
              },
              {
                title: '🔧 Worker Flow',
                steps: [
                  'Phone + Role selection (worker)',
                  'Complete profile & upload docs',
                  'Select category & skills',
                  'Set recurring availability slots',
                  'Receive incoming job notifications',
                  'Accept → Start → Complete job',
                  'Earnings dashboard & payouts'
                ]
              },
              {
                title: '⚙️ Admin Dashboard',
                steps: [
                  'Platform analytics (GMV, bookings)',
                  'Daily/weekly booking trends',
                  'Worker verification queue',
                  'Dispute resolution system',
                  'Category & pricing management',
                  'Batch actions on workers',
                  'Export reports'
                ]
              }
            ].map((flow, idx) => (
              <motion.div
                key={flow.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="card p-6 bg-gradient-to-br from-gray-50 to-white"
              >
                <h3 className="font-semibold text-gray-900 mb-4">{flow.title}</h3>
                <ol className="space-y-2">
                  {flow.steps.map((step, i) => (
                    <li key={i} className="text-sm text-gray-700 flex gap-2">
                      <span className="text-blue-600 font-bold flex-shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </motion.div>
            ))}
          </div>
        </section>

        {/* API Design Principles */}
        <section className="mb-12 bg-blue-50 rounded-xl p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Backend API Design Principles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">RESTful Endpoints</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>✓ Auth: /api/auth/send-otp, /verify-otp, /profile</li>
                <li>✓ Services: /api/services/categories, /workers, /slots</li>
                <li>✓ Bookings: /api/bookings (CRUD), /cancel</li>
                <li>✓ Jobs: /api/jobs/:id/accept, /start, /complete</li>
                <li>✓ Payments: /api/payments/create-order, /verify, /webhook</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Error Handling</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>✓ 400: Validation errors (Zod schema)</li>
                <li>✓ 401: Auth failures (expired token, 401 on invalid OTP)</li>
                <li>✓ 403: Role-based access denied</li>
                <li>✓ 409: Double booking attempt (slot locked)</li>
                <li>✓ 500: Server error with structured logs</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Production Considerations */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Production Considerations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              '🌍 Geolocation-based worker listings (Haversine formula)',
              '⚡ Caching layer on categories & reviews (Redis)',
              '🔄 Idempotent payment webhook handling',
              '📊 Structured logging (winston/pino) for debugging',
              '🚨 Error boundaries on frontend with fallback UI',
              '📱 Mobile-first responsive design (PWA-ready)',
              '🔐 HTTPS-only, helmet security headers',
              '♻️ Webhook retry logic for failed SMS/email'
            ].map((item, idx) => (
              <div key={idx} className="flex gap-2 text-sm text-gray-700">
                <span className="flex-shrink-0">{item.split(' ')[0]}</span>
                <span>{item.slice(item.indexOf(' ') + 1)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Deployment */}
        <section className="card p-6 bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">🚀 Deployment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="font-semibold text-gray-900">Frontend</p>
              <p className="text-gray-600">Vercel (Next.js)</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Backend</p>
              <p className="text-gray-600">Railway (Node.js)</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Database</p>
              <p className="text-gray-600">Neon (Postgres)</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Cache</p>
              <p className="text-gray-600">Upstash (Redis)</p>
            </div>
          </div>
        </section>
      </div>

      {/* Footer CTA */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-12 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to explore?</h2>
          <Link href="/" className="inline-flex items-center gap-2 bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors">
            Try ServeNow <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </div>
  );
}
