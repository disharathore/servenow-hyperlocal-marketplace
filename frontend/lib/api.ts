import axios from 'axios';
import { useAuthStore } from './store';
import { toast } from 'sonner';

const API_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || (process.env.NODE_ENV === 'development' ? '60000' : '15000'));

const api = axios.create({
	baseURL: process.env.NEXT_PUBLIC_API_URL,
	headers: { 'Content-Type': 'application/json' },
	timeout: API_TIMEOUT_MS,
});

type RetriableRequest = {
	_retry?: boolean;
	headers?: Record<string, string>;
	url?: string;
};

function readAccessToken() {
	return typeof window !== 'undefined' ? localStorage.getItem('sn_token') : null;
}

function readRefreshToken() {
	return typeof window !== 'undefined' ? localStorage.getItem('sn_refresh_token') : null;
}

function applyTokens(accessToken: string, refreshToken: string) {
	useAuthStore.getState().setTokens(accessToken, refreshToken);
}

function clearTokensAndRedirect() {
	if (typeof window === 'undefined') return;
	useAuthStore.getState().clearAuth();
	if (window.location.pathname !== '/login') window.location.href = '/login';
}

let refreshPromise: Promise<string> | null = null;
let lastConnectivityToastAt = 0;

function maybeToastConnectivityIssue(message: string) {
	const now = Date.now();
	if (now - lastConnectivityToastAt < 10000) return;
	lastConnectivityToastAt = now;
	toast.error(message);
}

async function refreshAccessToken(): Promise<string> {
	const refreshToken = readRefreshToken();
	if (!refreshToken) throw new Error('No refresh token available');

	const response = await axios.post(
		`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
		{ refresh_token: refreshToken },
		{ headers: { 'Content-Type': 'application/json' } }
	);

	const newAccessToken = response.data?.token as string | undefined;
	const newRefreshToken = response.data?.refresh_token as string | undefined;
	if (!newAccessToken || !newRefreshToken) throw new Error('Invalid refresh response');

	applyTokens(newAccessToken, newRefreshToken);
	return newAccessToken;
}

api.interceptors.request.use((config) => {
	if (typeof window !== 'undefined') {
		const t = readAccessToken();
		if (t) config.headers.Authorization = `Bearer ${t}`;
	}
	return config;
});

api.interceptors.response.use(
	r => r,
	async err => {
		if (typeof window === 'undefined') return Promise.reject(err);

		const status = err.response?.status;
		const originalConfig = (err.config || {}) as RetriableRequest;
		const url = originalConfig.url || '';
		const isAuthBootstrapRequest = url.includes('/auth/send-otp') || url.includes('/auth/verify-otp');
		const isRefreshRequest = url.includes('/auth/refresh');
 		const isLogoutRequest = url.includes('/auth/logout');

		if (status !== 401 || originalConfig._retry || isRefreshRequest || isLogoutRequest || isAuthBootstrapRequest) {
			const code = err?.code as string | undefined;
			const isTimeout = code === 'ECONNABORTED' || code === 'ETIMEDOUT';
			const isNetworkIssue = !err?.response;

			if ((isTimeout || isNetworkIssue) && !isRefreshRequest) {
				maybeToastConnectivityIssue('Backend is slow or unreachable. Please retry in a few seconds.');
				return Promise.reject(err);
			}

			const message = err?.response?.data?.error || err?.message;
			if (message && !isRefreshRequest) {
				toast.error(typeof message === 'string' ? message : 'Something went wrong. Please try again.');
			}
			return Promise.reject(err);
		}

		try {
			originalConfig._retry = true;

			if (!refreshPromise) {
				refreshPromise = refreshAccessToken().finally(() => {
					refreshPromise = null;
				});
			}

			const newAccessToken = await refreshPromise;
			originalConfig.headers = originalConfig.headers || {};
			originalConfig.headers.Authorization = `Bearer ${newAccessToken}`;
			return api(originalConfig);
		} catch (refreshErr) {
			toast.error('Session expired. Please login again.');
			clearTokensAndRedirect();
			return Promise.reject(refreshErr);
		}
	}
);

export default api;
export const authApi = {
	sendOtp: (phone: string) => api.post('/auth/send-otp', { phone }),
	verifyOtp: (phone: string, otp: string, name?: string, role?: string) => api.post('/auth/verify-otp', { phone, otp, name, role }),
	refresh: (refresh_token: string) => api.post('/auth/refresh', { refresh_token }),
	logout: (refresh_token: string) => api.post('/auth/logout', { refresh_token }),
	demoLogin: (type: 'customer' | 'worker') => api.post('/auth/demo-login', { type }),
	me: () => api.get('/auth/me'),
	updateProfile: (data: Record<string, unknown>) => api.patch('/auth/profile', data)
};
export const servicesApi = { 
	categories: () => api.get('/services/categories'), 
	workers: (params: Record<string, unknown>) => api.get('/services/workers', { params }), 
	worker: (id: string) => api.get(`/services/workers/${id}`), 
	slots: (wId: string, date?: string) => api.get(`/services/workers/${wId}/slots`, { params: date ? { date } : {} }), 
	reviews: (wId: string) => api.get(`/services/workers/${wId}/reviews`),
	smartMatch: (params: Record<string, unknown>) => api.get('/services/smart-match', { params }),
	pricingInfo: (params: Record<string, unknown>) => api.get('/services/pricing-info', { params }),
	calculatePrice: (data: Record<string, unknown>) => api.post('/services/calculate-price', data),
};
export const bookingsApi = { create: (data: Record<string, unknown>) => api.post('/bookings', data), list: (status?: string) => api.get('/bookings', { params: status ? { status } : {} }), get: (id: string) => api.get(`/bookings/${id}`), cancel: (id: string, reason?: string) => api.patch(`/bookings/${id}/cancel`, { reason }), dispute: (id: string, reason: string) => api.patch(`/bookings/${id}/dispute`, { reason }) };
export const paymentsApi = {
	createOrder: (booking_id: string) => api.post('/payments/create-order', { booking_id }),
	verify: (data: Record<string, unknown>) => api.post('/payments/verify', data),
	releaseLock: (booking_id: string) => api.post('/payments/release-lock', { booking_id }),
};
export const jobsApi = {
	available: () => api.get('/jobs/available'),
	accept: (id: string) => api.post(`/jobs/${id}/accept`),
	reject: (id: string, reason?: string) => api.post(`/jobs/${id}/reject`, { reason }),
	arriving: (id: string) => api.post(`/jobs/${id}/arriving`),
	start: (id: string) => api.post(`/jobs/${id}/start`),
	complete: (id: string) => api.post(`/jobs/${id}/complete`),
	earnings: () => api.get('/jobs/earnings'),
};
export const workerApi = {
	getAvailability: () => api.get('/workers/availability'),
	updateAvailability: (slots: Array<{ day_of_week: number; start_time: string; end_time: string }>) => api.post('/workers/availability', { slots }),
	getBlockedSlots: () => api.get('/workers/blocked-slots'),
	addBlockedSlot: (date: string, time_slot: string) => api.post('/workers/blocked-slots', { date, time_slot }),
	removeBlockedSlot: (id: string) => api.delete(`/workers/blocked-slots/${id}`),
};
export const notificationsApi = {
	list: (limit = 50) => api.get('/notifications', { params: { limit } }),
	unreadCount: () => api.get('/notifications/unread-count'),
	markRead: (id: string) => api.patch(`/notifications/${id}/read`),
	markAllRead: () => api.patch('/notifications/read-all'),
};
export const reviewsApi = { submit: (data: { booking_id: string; rating: number; comment?: string }) => api.post('/reviews', data) };
export const adminApi = {
	stats: () => api.get('/admin/stats'),
	showcase: () => api.get('/admin/showcase'),
	runDemoScenario: () => api.post('/admin/demo-scenario/run'),
	bookings: (s?: string, realOnly?: boolean) => api.get('/admin/bookings', { params: { ...(s ? { status: s } : {}), ...(realOnly ? { real_only: true } : {}) } }),
	workers: () => api.get('/admin/workers'),
	disputes: () => api.get('/admin/disputes'),
	resolveDispute: (id: string, resolution: 'completed' | 'cancelled') => api.patch(`/admin/bookings/${id}/resolve`, { resolution }),
	verifyWorker: (id: string, approved = true) => api.patch(`/admin/workers/${id}/verify`, { approved }),
	users: (role?: 'customer' | 'worker') => api.get('/admin/users', { params: role ? { role } : {} }),
	setUserBan: (id: string, is_active: boolean) => api.patch(`/admin/users/${id}/ban`, { is_active }),
	heatmapData: (timeframe?: 'today' | 'week' | 'month', category?: string, city?: string) => api.get('/admin/heatmap/data', { params: { timeframe, category, city } }),
	heatmapRealtime: () => api.get('/admin/heatmap/realtime'),
	heatmapSupply: () => api.get('/admin/heatmap/supply'),
	heatmapTopCities: (limit?: number) => api.get('/admin/heatmap/top-cities', { params: { limit } }),
};
