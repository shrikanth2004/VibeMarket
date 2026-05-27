// VibeMarket Client API Wrapper

// API base URL — same origin when served by FastAPI, fallback for local dev
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

// Helper: Token persistence
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
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
}

export function isLogged() {
  return getAccessToken() !== null;
}

/** Format amounts in Indian Rupees (₹) */
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
  toast.innerText = message;
  
  // Icon placeholder based on type
  let icon = '';
  if (type === 'success') icon = '✓ ';
  if (type === 'error') icon = '✗ ';
  if (type === 'info') icon = 'ℹ ';
  toast.innerText = icon + message;

  container.appendChild(toast);
  
  // Remove after 3.5 seconds
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
  // Authentication
  auth: {
    signup: (email, password, fullName) => 
      request('/auth/signup', 'POST', { email, password, full_name: fullName }),
    
    login: async (email, password) => {
      const res = await request('/auth/login', 'POST', { email, password });
      if (res.access_token) {
        setAccessToken(res.access_token);
        // Fetch full profile details immediately to save roles/names
        try {
          const profile = await request('/auth/me', 'GET');
          setCurrentUser(profile);
        } catch (e) {
          setCurrentUser(res.user);
        }
      }
      return res;
    },
    
    logout: () => {
      clearSession();
    },
    
    getProfile: () => request('/auth/me', 'GET'),
    
    updateProfile: async (fullName) => {
      const res = await request('/auth/profile', 'PUT', { full_name: fullName });
      // Sync user storage
      if (res.profile) {
        const u = getCurrentUser() || {};
        setCurrentUser({ ...u, ...res.profile });
      }
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
    
    create: (formData) => request('/products', 'POST', formData, true),
    
    update: (id, formData) => request(`/products/${id}`, 'PUT', formData, true),

    updateStatus: (id, status) => request(`/products/${id}/status`, 'PATCH', { status }),
    
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
    read: (id) => request(`/notifications/${id}/read`, 'PUT')
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
