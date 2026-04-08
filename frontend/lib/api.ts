import axios from 'axios';
const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL, headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use((config) => { if (typeof window !== 'undefined') { const t = localStorage.getItem('sn_token'); if (t) config.headers.Authorization = `Bearer ${t}`; } return config; });
api.interceptors.response.use(r => r, err => { if (err.response?.status === 401 && typeof window !== 'undefined') { localStorage.removeItem('sn_token'); window.location.href = '/login'; } return Promise.reject(err); });
export default api;
export const authApi = { sendOtp: (phone: string) => api.post('/auth/send-otp', { phone }), verifyOtp: (phone: string, otp: string, name?: string, role?: string) => api.post('/auth/verify-otp', { phone, otp, name, role }), me: () => api.get('/auth/me'), updateProfile: (data: Record<string, unknown>) => api.patch('/auth/profile', data) };
export const servicesApi = { categories: () => api.get('/services/categories'), workers: (params: Record<string, unknown>) => api.get('/services/workers', { params }), worker: (id: string) => api.get(`/services/workers/${id}`), slots: (wId: string, date?: string) => api.get(`/services/workers/${wId}/slots`, { params: date ? { date } : {} }), reviews: (wId: string) => api.get(`/services/workers/${wId}/reviews`) };
export const bookingsApi = { create: (data: Record<string, unknown>) => api.post('/bookings', data), list: (status?: string) => api.get('/bookings', { params: status ? { status } : {} }), get: (id: string) => api.get(`/bookings/${id}`), cancel: (id: string, reason?: string) => api.patch(`/bookings/${id}/cancel`, { reason }), dispute: (id: string, reason: string) => api.patch(`/bookings/${id}/dispute`, { reason }) };
export const paymentsApi = {
	createOrder: (booking_id: string) => api.post('/payments/create-order', { booking_id }),
	verify: (data: Record<string, unknown>) => api.post('/payments/verify', data),
	releaseLock: (booking_id: string) => api.post('/payments/release-lock', { booking_id }),
};
export const jobsApi = { accept: (id: string) => api.post(`/jobs/${id}/accept`), reject: (id: string, reason?: string) => api.post(`/jobs/${id}/reject`, { reason }), start: (id: string) => api.post(`/jobs/${id}/start`), complete: (id: string) => api.post(`/jobs/${id}/complete`), earnings: () => api.get('/jobs/earnings') };
export const workerApi = {
	getAvailability: () => api.get('/workers/availability'),
	updateAvailability: (slots: Array<{ day_of_week: number; start_time: string; end_time: string }>) => api.put('/workers/availability', { slots }),
	addBlockedSlot: (date: string, time_slot: string) => api.post('/workers/blocked-slots', { date, time_slot }),
	removeBlockedSlot: (id: string) => api.delete(`/workers/blocked-slots/${id}`),
};
export const reviewsApi = { submit: (data: { booking_id: string; rating: number; comment?: string }) => api.post('/reviews', data) };
export const adminApi = { stats: () => api.get('/admin/stats'), bookings: (s?: string) => api.get('/admin/bookings', { params: s ? { status: s } : {} }), workers: () => api.get('/admin/workers'), disputes: () => api.get('/admin/disputes'), resolveDispute: (id: string, resolution: 'completed' | 'cancelled') => api.patch(`/admin/bookings/${id}/resolve`, { resolution }), verifyWorker: (id: string) => api.patch(`/admin/workers/${id}/verify`) };
