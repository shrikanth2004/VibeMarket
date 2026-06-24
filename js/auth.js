import { api, getAccessToken, getCurrentUser, showToast } from './api.js';

export function isLogged() {
  return getAccessToken() !== null;
}

export function isAdmin() {
  const user = getCurrentUser();
  return user && user.role === 'admin';
}

// Update navbar structure dynamically based on auth status
export async function updateNavbar() {
  const actionsContainer = document.getElementById('nav-actions-container');
  if (!actionsContainer) return;

  if (isLogged()) {
    const user = getCurrentUser() || { full_name: 'User', email: '' };
    const adminLink = isAdmin()
      ? `<a href="admin.html" class="dropdown-item" style="color: var(--accent-cyan);">
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 16px; height: 16px; display: inline; margin-right: 4px; vertical-align: middle;">
             <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
           </svg>
           Admin Console
         </a>`
      : '';

    actionsContainer.innerHTML = `
      <!-- Sell Product Link -->
      <a href="profile.html?tab=post-listing" class="nav-btn primary">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width: 16px; height: 16px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Sell Item
      </a>

      <!-- Notifications Bell -->
      <button class="nav-btn icon-only" id="notifications-bell" title="Notifications">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 20px; height: 20px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        <span class="badge" id="notifications-badge" style="display: none;">0</span>

        <div class="dropdown-panel glass-panel notifications-panel" id="notifications-dropdown">
          <div class="dropdown-header">Notifications</div>
          <div class="notification-list" id="notifications-list">
            <div style="padding: 16px; text-align: center; color: var(--text-muted);">No new notifications</div>
          </div>
        </div>
      </button>

      <!-- Profile Dropdown -->
      <div class="user-menu" id="user-menu-trigger">
        <img src="${user.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'}" alt="Avatar" class="user-avatar">
        <span class="user-name">${user.full_name}</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width: 12px; height: 12px; color: var(--text-secondary);">
          <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>

        <div class="dropdown-panel glass-panel" id="user-dropdown">
          <div class="dropdown-header">Signed in as<br><strong>${user.email}</strong></div>
          <a href="profile.html" class="dropdown-item">My Dashboard</a>
          <a href="profile.html?tab=my-favorites" class="dropdown-item">My Favorites</a>
          ${adminLink}
          <div class="dropdown-item logout logout-btn" id="logout-nav-action" style="border-top: 1px solid var(--glass-border);">Log Out</div>
        </div>
      </div>
    `;

    setupDropdowns();
    loadNotifications();
  }
}

function setupDropdowns() {
  const bell = document.getElementById('notifications-bell');
  const bellDropdown = document.getElementById('notifications-dropdown');
  const userTrigger = document.getElementById('user-menu-trigger');
  const userDropdown = document.getElementById('user-dropdown');

  if (bell && bellDropdown) {
    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpening = !bellDropdown.classList.contains('active');
      bellDropdown.classList.toggle('active');
      if (userDropdown) userDropdown.classList.remove('active');

      if (isOpening) {
        // Immediately hide the badge the moment the panel is opened
        const badge = document.getElementById('notifications-badge');
        if (badge) badge.style.display = 'none';

        // Mark all as read on the server in the background
        api.notifications.readAll().catch(() => {});

        // Remove unread highlight from all visible items
        document.querySelectorAll('.notification-item.unread').forEach(el => {
          el.classList.remove('unread');
        });
      }
    });
  }

  if (userTrigger && userDropdown) {
    userTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('active');
      if (bellDropdown) bellDropdown.classList.remove('active');
    });
  }

  window.addEventListener('click', () => {
    if (bellDropdown) bellDropdown.classList.remove('active');
    if (userDropdown) userDropdown.classList.remove('active');
  });

  const logoutBtn = document.getElementById('logout-nav-action');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await api.auth.logout();
      showToast('Logged out successfully', 'info');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 500);
    });
  }
}

async function loadNotifications() {
  const badge = document.getElementById('notifications-badge');
  const list = document.getElementById('notifications-list');
  if (!badge || !list) return;

  try {
    const notifications = await api.notifications.list();
    const unread = notifications.filter(n => !n.is_read);

    if (unread.length > 0) {
      badge.innerText = unread.length;
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }

    if (notifications.length === 0) {
      list.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted);">No new notifications</div>`;
      return;
    }

    list.innerHTML = notifications.slice(0, 10).map(n => {
      const timeStr = new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `
        <div class="notification-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-link="${n.link_url || '#'}">
          <div style="font-weight: 600;">${n.title}</div>
          <div style="color: var(--text-secondary); margin-top: 2px;">${n.message}</div>
          <div class="time">${timeStr}</div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const link = item.getAttribute('data-link');
        item.classList.remove('unread');

        if (link && link !== '#') {
          window.location.href = link;
        }
      });
    });

  } catch (error) {
    console.error('Failed to load notifications:', error);
  }
}

// Handle login page form bindings
document.addEventListener('DOMContentLoaded', () => {
  // Handle Google Login
  const googleLoginBtn = document.getElementById('google-login-btn');
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      googleLoginBtn.disabled = true;
      googleLoginBtn.innerHTML = 'Connecting...';
      try {
        await api.auth.loginWithGoogle();
        showToast('Successfully logged in with Google!', 'success');
        setTimeout(() => {
          window.location.href = 'profile.html';
        }, 800);
      } catch (err) {
        showToast(err.message, 'error');
        googleLoginBtn.disabled = false;
        googleLoginBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align: middle; margin-right: 8px;">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        `;
      }
    });
  }

  // Auto initialize navbar on all loaded pages
  updateNavbar();
});
