import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('sn_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('sn_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// ─── Typed API calls ──────────────────────────────────────

export const authApi = {
  sendOtp: (phone: string) => api.post('/auth/send-otp', { phone }),
  verifyOtp: (phone: string, otp: string, name?: string, role?: string) =>
    api.post('/auth/verify-otp', { phone, otp, name, role }),
  me: () => api.get('/auth/me'),
  updateProfile: (data: Record<string, unknown>) => api.patch('/auth/profile', data),
};

export const servicesApi = {
  categories: () => api.get('/services/categories'),
  workers: (params: Record<string, unknown>) => api.get('/services/workers', { params }),
  worker: (id: string) => api.get(`/services/workers/${id}`),
  slots: (workerId: string, date?: string) =>
    api.get(`/services/workers/${workerId}/slots`, { params: date ? { date } : {} }),
  reviews: (workerId: string) => api.get(`/services/workers/${workerId}/reviews`),
};

export const bookingsApi = {
  create: (data: Record<string, unknown>) => api.post('/bookings', data),
  list: (status?: string) => api.get('/bookings', { params: status ? { status } : {} }),
  get: (id: string) => api.get(`/bookings/${id}`),
  cancel: (id: string, reason?: string) => api.patch(`/bookings/${id}/cancel`, { reason }),
};

export const paymentsApi = {
  createOrder: (booking_id: string) => api.post('/payments/create-order', { booking_id }),
  verify: (data: Record<string, unknown>) => api.post('/payments/verify', data),
};

export const jobsApi = {
  accept: (bookingId: string) => api.post(`/jobs/${bookingId}/accept`),
  start: (bookingId: string) => api.post(`/jobs/${bookingId}/start`),
  complete: (bookingId: string) => api.post(`/jobs/${bookingId}/complete`),
  earnings: () => api.get('/jobs/earnings'),
};

export const reviewsApi = {
  submit: (data: { booking_id: string; rating: number; comment?: string }) =>
    api.post('/reviews', data),
};

export const adminApi = {
  stats: () => api.get('/admin/stats'),
  bookings: (status?: string) => api.get('/admin/bookings', { params: status ? { status } : {} }),
  workers: () => api.get('/admin/workers'),
  verifyWorker: (id: string) => api.patch(`/admin/workers/${id}/verify`),
  resolveDispute: (id: string, resolution: string) =>
    api.patch(`/admin/bookings/${id}/dispute`, { resolution }),
};
