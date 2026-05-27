import { api, getCurrentUser, showToast, formatPrice } from './api.js';
import { isLogged } from './auth.js';

const STATUS_LABELS = {
  active: 'Active',
  sold: 'Sold',
  reserved: 'Reserved',
  draft: 'Draft',
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!isLogged()) {
    showToast('Admin login required.', 'error');
    window.location.href = 'login.html';
    return;
  }

  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Access denied: Administrator credentials required.', 'error');
    setTimeout(() => window.location.href = 'index.html', 1200);
    return;
  }

  setupAdminTabs();
  await loadAdminDashboard();
});

function setupAdminTabs() {
  const btnListings = document.getElementById('btn-admin-listings');
  const btnUsers = document.getElementById('btn-admin-users');
  const secListings = document.getElementById('sec-admin-listings');
  const secUsers = document.getElementById('sec-admin-users');

  if (!btnListings || !btnUsers) return;

  btnListings.addEventListener('click', () => {
    btnListings.classList.add('active');
    btnUsers.classList.remove('active');
    secListings.style.display = 'block';
    secUsers.style.display = 'none';
  });

  btnUsers.addEventListener('click', () => {
    btnUsers.classList.add('active');
    btnListings.classList.remove('active');
    secUsers.style.display = 'block';
    secListings.style.display = 'none';
  });
}

function renderCategoryChart(categories) {
  const container = document.getElementById('chart-category-bars');
  if (!container) return;

  if (!categories || categories.length === 0) {
    container.innerHTML = '<p class="admin-chart-empty">No listing data yet.</p>';
    return;
  }

  const max = Math.max(...categories.map((c) => c.count), 1);
  container.innerHTML = categories.map((item) => {
    const pct = Math.round((item.count / max) * 100);
    return `
      <div class="admin-bar-row">
        <span class="admin-bar-label">${item.category}</span>
        <div class="admin-bar-track">
          <div class="admin-bar-fill" style="width: ${pct}%"></div>
        </div>
        <span class="admin-bar-count">${item.count}</span>
      </div>
    `;
  }).join('');
}

function renderTrendChart(containerId, data, barClass) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = '<p class="admin-chart-empty">No data yet.</p>';
    return;
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  container.innerHTML = `
    <div class="admin-trend-bars">
      ${data.map((d) => {
        const pct = Math.max(8, Math.round((d.count / max) * 100));
        const day = new Date(d.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short' });
        return `
          <div class="admin-trend-col" title="${d.date}: ${d.count}">
            <div class="admin-trend-bar ${barClass}" style="height: ${pct}%"></div>
            <span class="admin-trend-value">${d.count}</span>
            <span class="admin-trend-day">${day}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function showMigrationBanner(migration) {
  const banner = document.getElementById('admin-migration-banner');
  const message = document.getElementById('admin-migration-message');
  if (!banner) return;

  if (migration && !migration.ready) {
    banner.hidden = false;
    if (message && migration.hint) {
      message.innerHTML = `${migration.hint} Open <strong>Supabase Dashboard → SQL Editor</strong>, paste the contents of <code>migrations/add_features.sql</code>, and run it.`;
    }
    showToast('Run the database migration to unlock all features.', 'info');
  } else {
    banner.hidden = true;
  }
}

function renderStats(stats) {
  if (stats.migration) {
    showMigrationBanner(stats.migration);
  }

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  set('stat-total-users', stats.total_users);
  set('stat-active-listings', stats.active_listings);
  set('stat-sold-listings', stats.sold_listings);
  set('stat-avg-price', formatPrice(stats.avg_price));
  set('stat-total-reviews', stats.total_reviews);
  set('stat-total-wishlists', stats.total_wishlists);
  set('stat-new-users-7d', `+${stats.new_users_7d} this week`);
  set('stat-new-listings-7d', `+${stats.new_listings_7d} this week`);
  set('stat-total-listings-sub', `${stats.total_listings} total`);

  renderCategoryChart(stats.listings_by_category);
  renderTrendChart('chart-listings-trend', stats.listings_per_day, 'trend-listings');
  renderTrendChart('chart-users-trend', stats.users_per_day, 'trend-users');
}

async function loadAdminDashboard() {
  const listingsBody = document.getElementById('admin-listings-table-body');
  const usersBody = document.getElementById('admin-users-table-body');

  try {
    const [stats, listings, users] = await Promise.all([
      api.admin.stats(),
      api.admin.listings(),
      api.admin.users(),
    ]);

    renderStats(stats);

    if (listingsBody) {
      if (listings.length === 0) {
        listingsBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px 0;">No listings on the platform.</td></tr>`;
      } else {
        listingsBody.innerHTML = listings.map((prod) => {
          const thumbnail = prod.images?.[0] || 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=600&q=80';
          const priceStr = formatPrice(prod.price);
          const dateStr = new Date(prod.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
          const sellerName = prod.profiles?.full_name || 'Unknown';
          const status = prod.status || 'active';
          const statusClass = `listing-status-badge status-${status}`;

          return `
            <tr data-product-id="${prod.id}">
              <td>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <img src="${thumbnail}" alt="" style="width: 48px; height: 36px; object-fit: cover; border-radius: var(--radius-sm);">
                  <div>
                    <a href="product.html?id=${prod.id}" target="_blank" style="font-weight: 600; text-decoration: underline;">${prod.title}</a>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${prod.condition}</div>
                  </div>
                </div>
              </td>
              <td><span style="font-size: 13px;">${prod.category}</span></td>
              <td><span class="${statusClass}">${STATUS_LABELS[status] || status}</span></td>
              <td><span style="font-size: 12px;">${sellerName}</span></td>
              <td style="font-weight: 700; color: var(--accent-cyan);">${priceStr}</td>
              <td style="font-size: 13px; color: var(--text-secondary);">${dateStr}</td>
              <td>
                <button class="action-btn delete admin-delete-btn" data-product-id="${prod.id}" style="padding: 6px 12px; font-size: 11px;">Delete</button>
              </td>
            </tr>
          `;
        }).join('');

        listingsBody.querySelectorAll('.admin-delete-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-product-id');
            if (!confirm('Force delete this listing from the platform?')) return;
            try {
              await api.admin.deleteListing(id);
              showToast('Listing deleted', 'success');
              await loadAdminDashboard();
            } catch (err) {
              showToast('Action failed: ' + err.message, 'error');
            }
          });
        });
      }
    }

    if (usersBody) {
      if (users.length === 0) {
        usersBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px 0;">No profiles found.</td></tr>`;
      } else {
        usersBody.innerHTML = users.map((user) => {
          const dateStr = new Date(user.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
          const roleClass = user.role === 'admin' ? 'admin' : 'user';
          const currentLoggedIn = getCurrentUser();
          const isSelf = currentLoggedIn && currentLoggedIn.id === user.id;

          const actionBtn = isSelf
            ? '<span style="font-size: 11px; color: var(--text-muted);">Current admin</span>'
            : `<button class="action-btn edit change-role-btn" data-user-id="${user.id}" data-role="${user.role}" style="padding: 6px 12px; font-size: 11px;">
                Set ${user.role === 'admin' ? 'User' : 'Admin'}
              </button>`;

          return `
            <tr data-user-id="${user.id}">
              <td style="font-weight: 600;">${user.full_name}</td>
              <td style="font-family: monospace; font-size: 11px;">${user.id.substring(0, 8)}…</td>
              <td><span class="badge-role ${roleClass}">${user.role}</span></td>
              <td style="font-size: 13px; color: var(--text-secondary);">${dateStr}</td>
              <td>${actionBtn}</td>
            </tr>
          `;
        }).join('');

        usersBody.querySelectorAll('.change-role-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const userId = btn.getAttribute('data-user-id');
            const currentRole = btn.getAttribute('data-role');
            const newRole = currentRole === 'admin' ? 'user' : 'admin';
            if (!confirm(`Set this user to '${newRole}'?`)) return;
            try {
              await api.admin.updateRole(userId, newRole);
              showToast('Role updated', 'success');
              await loadAdminDashboard();
            } catch (e) {
              showToast('Failed: ' + e.message, 'error');
            }
          });
        });
      }
    }
  } catch (error) {
    showToast('Dashboard load error: ' + error.message, 'error');
  }
}
