import axios from 'axios';

// Importing the stores at module scope is safe: they are only *invoked* inside
// interceptors (at request time, not at module-eval time), so any circular
// reference between authStore <-> client resolves via live bindings by then.
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';

const TOKEN_KEY = 'novelforge_token';

const client = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach auth token (if any) to outgoing requests.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    // Requests aborted via AbortController surface as cancellations; skip toasts.
    const canceled = axios.isCancel(error) || error.code === 'ERR_CANCELED';
    const status = error.response?.status;

    if (status === 401) {
      useAuthStore.getState().logout();
    }

    const message = error.response?.data?.detail || '网络连接失败';
    if (!canceled) {
      console.error('API Error:', message);
      useUIStore.getState().showToast('error', message);
    }
    return Promise.reject(error);
  },
);

export default client;
