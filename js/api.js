// VibeMarket Client API Wrapper — Firebase Auth Edition
import { identifyUser, resetPostHog, track } from './posthog.js';

import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

// Firebase web config — these are PUBLIC keys, safe to commit
// TODO: Replace with your Firebase project config from Firebase Console > Project Settings > General > Your apps > Web app
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCZwr88hebvrX7EygM3QGGwDR2DJQIuuU0",
  authDomain: "pythonfullstack-c0f8f.firebaseapp.com",
  projectId: "pythonfullstack-c0f8f",
  storageBucket: "pythonfullstack-c0f8f.firebasestorage.app",
  messagingSenderId: "382599110508",
  appId: "1:382599110508:web:fb4b13e80ba7b55feb1d49",
  measurementId: "G-JM51P1E0YF"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// API base URL — same origin when served by FastAPI
function resolveApiBase() {
  const { protocol, hostname, port, origin } = window.location;
  if (protocol === 'http:' || protocol === 'https:') {
    return `${origin}/api`;
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `http://${hostname}:${port || '8000'}/api`;
  }
  return 'http://127.0.0.1:8000/api';
}

export const API_BASE = resolveApiBase();

const REQUEST_TIMEOUT_MS = 25000;

// Helper: get the current Firebase user's ID token
async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

// Helper: Token persistence (stores the Firebase ID token for API calls)
export function getAccessToken() {
  return localStorage.getItem('access_token');
}

export function setAccessToken(token) {
  if (token) {
    localStorage.setItem('access_token', token);
  } else {
    localStorage.removeItem('access_token');
  }
}

export function getCurrentUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

export function setCurrentUser(user) {
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    localStorage.removeItem('user');
  }
}

export function clearSession() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
}

export function isLogged() {
  return getAccessToken() !== null;
}

/** Format amounts in Indian Rupees */
export function formatPrice(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

// Global Toast Alert Helper
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = '';
  if (type === 'success') icon = '✓ ';
  if (type === 'error') icon = '✗ ';
  if (type === 'info') icon = 'ℹ ';
  toast.innerText = icon + message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut var(--transition-fast) forwards';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// Base Fetch Wrapper
async function request(endpoint, method = 'GET', body = null, isMultipart = false) {
  const token = getAccessToken();
  const headers = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!isMultipart && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = isMultipart || body instanceof FormData ? body : JSON.stringify(body);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  options.signal = controller.signal;

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    clearTimeout(timeoutId);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const detail = data?.detail;
      const errorMsg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
          : `HTTP error: ${response.status}`;
      throw new Error(errorMsg);
    }
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Is the server running?');
    }
    console.error(`API Request Error [${method} ${endpoint}]:`, error);
    throw error;
  }
}

// Exposed API Endpoints
export const api = {
  // Authentication (Firebase)
  auth: {
    loginWithGoogle: async () => {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      setAccessToken(idToken);

      // Verify token with backend and get/create profile
      const profile = await request('/auth/verify-token', 'POST');
      setCurrentUser(profile);

      // ── PostHog: identify user & capture login event ──────────────────────
      identifyUser(profile.id, {
        email: profile.email,
        name:  profile.full_name,
        role:  profile.role,
      });
      track('user_logged_in', {
        method: 'google',
        email:  profile.email,
        name:   profile.full_name,
        role:   profile.role,
      });

      return result;
    },

    logout: async () => {
      const user = getCurrentUser();
      // ── PostHog: capture logout before clearing session ───────────────────
      track('user_logged_out', { email: user?.email || '' });
      resetPostHog();

      try {
        await signOut(auth);
      } catch (e) {
        console.error('Firebase sign out error:', e);
      }
      clearSession();
    },

    getProfile: () => request('/auth/me', 'GET'),

    updateProfile: async (fullName) => {
      const res = await request('/auth/profile', 'PUT', { full_name: fullName });
      if (res.profile) {
        const u = getCurrentUser() || {};
        setCurrentUser({ ...u, ...res.profile });
      }
      // ── PostHog: profile updated ──────────────────────────────────────
      track('profile_updated', { email: getCurrentUser()?.email || '' });
      return res;
    },

    uploadAvatar: async (file) => {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await request('/auth/profile/avatar', 'POST', formData, true);
      if (res.profile) {
        const u = getCurrentUser() || {};
        setCurrentUser({ ...u, ...res.profile });
      }
      return res;
    }
  },

  // Products Marketplace
  products: {
    list: (filters = {}) => {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
          params.append(key, filters[key]);
        }
      });
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      return request(`/products${queryStr}`, 'GET');
    },

    get: (id) => request(`/products/${id}`, 'GET'),

    create: async (formData) => {
      const result = await request('/products', 'POST', formData, true);
      // ── PostHog: item listed ─────────────────────────────────────────────
      track('item_listed', {
        title:    formData.get ? formData.get('title')    : '',
        category: formData.get ? formData.get('category') : '',
        price:    formData.get ? formData.get('price')    : '',
      });
      return result;
    },

    update: (id, formData) => request(`/products/${id}`, 'PUT', formData, true),

    updateStatus: async (id, status) => {
      const result = await request(`/products/${id}/status`, 'PATCH', { status });
      // ── PostHog: item sold ─────────────────────────────────────────────
      if (status === 'sold') {
        track('item_sold', { product_id: id });
      }
      return result;
    },

    delete: (id) => request(`/products/${id}`, 'DELETE')
  },

  savedSearches: {
    list: () => request('/saved-searches', 'GET'),
    create: (data) => request('/saved-searches', 'POST', data),
    update: (id, data) => request(`/saved-searches/${id}`, 'PUT', data),
    remove: (id) => request(`/saved-searches/${id}`, 'DELETE'),
  },

  // Wishlist / Favorites
  wishlist: {
    list: () => request('/wishlist', 'GET'),
    add: (productId) => request(`/wishlist/${productId}`, 'POST'),
    remove: (productId) => request(`/wishlist/${productId}`, 'DELETE')
  },

  // Reviews
  reviews: {
    list: (productId) => request(`/reviews/${productId}`, 'GET'),
    create: (productId, rating, comment) =>
      request(`/reviews/${productId}`, 'POST', { rating, comment })
  },

  // Comments
  comments: {
    list: (productId) => request(`/comments/${productId}`, 'GET'),
    create: (productId, content) =>
      request(`/comments/${productId}`, 'POST', { content })
  },

  // Notifications
  notifications: {
    list: () => request('/notifications', 'GET'),
    read: (id) => request(`/notifications/${id}/read`, 'PUT'),
    readAll: () => request('/notifications/read-all', 'PUT')
  },

  // Admin Dashboard
  admin: {
    stats: () => request('/admin/stats', 'GET'),
    listings: () => request('/admin/listings', 'GET'),
    users: () => request('/admin/users', 'GET'),
    updateRole: (userId, role) => request(`/admin/users/${userId}/role`, 'PUT', { role }),
    deleteListing: (productId) => request(`/admin/listings/${productId}`, 'DELETE')
  }
};

// Listen for Firebase auth state changes to keep token fresh
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const token = await user.getIdToken();
    setAccessToken(token);
  }
});

// Refresh token periodically (tokens expire after 1 hour)
setInterval(async () => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken(true);
    setAccessToken(token);
  }
}, 50 * 60 * 1000); // Refresh every 50 minutes
