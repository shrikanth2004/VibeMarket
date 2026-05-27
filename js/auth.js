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

    // Populate navbar with notifications bell, profile dropdown, and Sell button
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
        
        <!-- Notifications Dropdown -->
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

    // Dropdown toggles
    setupDropdowns();
    
    // Fetch notifications
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
      bellDropdown.classList.toggle('active');
      if (userDropdown) userDropdown.classList.remove('active');
    });
  }

  if (userTrigger && userDropdown) {
    userTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('active');
      if (bellDropdown) bellDropdown.classList.remove('active');
    });
  }

  // Close dropdowns on window clicks
  window.addEventListener('click', () => {
    if (bellDropdown) bellDropdown.classList.remove('active');
    if (userDropdown) userDropdown.classList.remove('active');
  });

  // Logout listener
  const logoutBtn = document.getElementById('logout-nav-action');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      api.auth.logout();
      showToast('Logged out successfully', 'info');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 500);
    });
  }
}

// Fetch notifications and update badge unreads
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

    // Handle clicks
    list.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        const id = item.getAttribute('data-id');
        const link = item.getAttribute('data-link');
        
        try {
          await api.notifications.read(id);
        } catch (err) {
          console.error(err);
        }

        if (link && link !== '#') {
          window.location.href = link;
        } else {
          loadNotifications(); // Reload list
        }
      });
    });

  } catch (error) {
    console.error('Failed to load notifications:', error);
  }
}

// Handle login page form bindings
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const tabLoginBtn = document.getElementById('tab-login-btn');
  const tabSignupBtn = document.getElementById('tab-signup-btn');
  const descText = document.getElementById('form-description-text');

  // Toggle Forms
  if (tabLoginBtn && tabSignupBtn && loginForm && signupForm) {
    
    // Check URL params for pre-selecting sign up tab
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'signup') {
      showSignUp();
    }

    tabLoginBtn.addEventListener('click', showSignIn);
    tabSignupBtn.addEventListener('click', showSignUp);

    function showSignIn() {
      tabLoginBtn.style.background = 'var(--bg-secondary)';
      tabLoginBtn.style.color = 'var(--accent-cyan)';
      tabSignupBtn.style.background = 'none';
      tabSignupBtn.style.color = 'var(--text-secondary)';
      
      loginForm.style.display = 'block';
      signupForm.style.display = 'none';
      descText.innerText = 'Sign in to list items, favorites, and post comments';
    }

    function showSignUp() {
      tabSignupBtn.style.background = 'var(--bg-secondary)';
      tabSignupBtn.style.color = 'var(--accent-cyan)';
      tabLoginBtn.style.background = 'none';
      tabLoginBtn.style.color = 'var(--text-secondary)';
      
      signupForm.style.display = 'block';
      loginForm.style.display = 'none';
      descText.innerText = 'Register to create your personal storefront';
    }
  }

  // Handle Login submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const pass = document.getElementById('login-password').value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      submitBtn.disabled = true;
      submitBtn.innerText = 'Signing In...';

      try {
        await api.auth.login(email, pass);
        showToast('Successfully logged in!', 'success');
        
        // Redirect back or dashboard
        setTimeout(() => {
          window.location.href = 'profile.html';
        }, 800);
      } catch (err) {
        showToast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.innerText = 'Sign In';
      }
    });
  }

  // Handle Signup submission
  let signupCooldown = false;
  function startSignupCooldown() {
    signupCooldown = true;
    const btn = document.getElementById('signup-form').querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Please wait...';
    }
    setTimeout(() => {
      signupCooldown = false;
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Create Account';
      }
    }, 30000);
  }
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name').value;
      const email = document.getElementById('signup-email').value;
      const pass = document.getElementById('signup-password').value;
      const submitBtn = signupForm.querySelector('button[type="submit"]');

      submitBtn.disabled = true;
      submitBtn.innerText = 'Creating Account...';

      try {
        await api.auth.signup(email, pass, name);
        showToast('Signup successful! You can now log in.', 'success');
        
        // Auto sign in immediately if email verification is disabled
        try {
          await api.auth.login(email, pass);
          setTimeout(() => {
            window.location.href = 'profile.html';
          }, 800);
        } catch (loginErr) {
          // If sign in fails (e.g. requires email confirmation), switch back to login tab
          submitBtn.disabled = false;
          submitBtn.innerText = 'Create Account';
          document.getElementById('tab-login-btn').click();
        }
      } catch (err) {
        // Handle rate limit errors specially
        const msg = err.message || '';
        if (msg.toLowerCase().includes('rate limit')) {
          showToast('Too many attempts, try again later.', 'error');
          startSignupCooldown();
        } else {
          showToast(msg, 'error');
          submitBtn.disabled = false;
          submitBtn.innerText = 'Create Account';
        }
      }
    });
  }

  // Auto initialize navbar on all loaded pages
  updateNavbar();
});
