import { api, getCurrentUser, showToast, formatPrice } from './api.js';
import { isLogged } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Admin Guard Checks
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

  // 2. Tab Navigation setup
  setupAdminTabs();

  // 3. Load Admin metrics and data
  await loadAdminDashboard();
});

// Setup Listings vs Users tabs
function setupAdminTabs() {
  const btnListings = document.getElementById('btn-admin-listings');
  const btnUsers = document.getElementById('btn-admin-users');
  const secListings = document.getElementById('sec-admin-listings');
  const secUsers = document.getElementById('sec-admin-users');

  if (btnListings && btnUsers && secListings && secUsers) {
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
}

// Fetch dashboard data
async function loadAdminDashboard() {
  const listingsBody = document.getElementById('admin-listings-table-body');
  const usersBody = document.getElementById('admin-users-table-body');
  
  const totalUsersLabel = document.getElementById('stat-total-users');
  const totalListingsLabel = document.getElementById('stat-total-listings');
  const avgPriceLabel = document.getElementById('stat-avg-price');

  try {
    // 1. Fetch Users
    const users = await api.admin.users();
    if (totalUsersLabel) totalUsersLabel.innerText = users.length;

    // 2. Fetch Listings (all of them, bypassing search filters)
    const listings = await api.products.list();
    if (totalListingsLabel) totalListingsLabel.innerText = listings.length;

    // 3. Calculate Average Price
    if (listings.length > 0) {
      const sum = listings.reduce((acc, curr) => acc + parseFloat(curr.price), 0);
      const avg = sum / listings.length;
      if (avgPriceLabel) {
        avgPriceLabel.innerText = formatPrice(avg);
      }
    } else {
      if (avgPriceLabel) avgPriceLabel.innerText = formatPrice(0);
    }

    // 4. Render listings table
    if (listingsBody) {
      if (listings.length === 0) {
        listingsBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 40px 0;">No active listings on the platform.</td></tr>`;
      } else {
        listingsBody.innerHTML = listings.map(prod => {
          const thumbnail = prod.images && prod.images.length > 0 ? prod.images[0] : 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=600&q=80';
          const priceStr = formatPrice(prod.price);
          const dateStr = new Date(prod.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
          const sellerName = prod.profiles ? prod.profiles.full_name : 'Unknown';

          return `
            <tr data-product-id="${prod.id}">
              <td>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <img src="${thumbnail}" alt="" style="width: 48px; height: 36px; object-fit: cover; border-radius: var(--radius-sm);">
                  <div>
                    <a href="product.html?id=${prod.id}" target="_blank" style="font-weight: 600; text-decoration: underline;">${prod.title}</a>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Condition: ${prod.condition}</div>
                  </div>
                </div>
              </td>
              <td><span style="font-size: 13px;">${prod.category}</span></td>
              <td><span style="font-family: monospace; font-size: 11px;">${prod.seller_id.substring(0, 8)}... (${sellerName})</span></td>
              <td style="font-weight: 700; color: var(--accent-cyan);">${priceStr}</td>
              <td style="font-size: 13px; color: var(--text-secondary);">${dateStr}</td>
              <td>
                <button class="action-btn delete admin-delete-btn" data-product-id="${prod.id}" style="padding: 6px 12px; font-size: 11px;">Force Delete</button>
              </td>
            </tr>
          `;
        }).join('');

        // Bind listing force delete
        listingsBody.querySelectorAll('.admin-delete-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-product-id');
            if (confirm('Moderate: Are you sure you want to FORCE delete this listing from the platform? The seller will receive a moderation notification.')) {
              try {
                await api.admin.deleteListing(id);
                showToast('Listing moderated and deleted', 'success');
                await loadAdminDashboard(); // Reload data
              } catch (err) {
                showToast('Action failed: ' + err.message, 'error');
              }
            }
          });
        });
      }
    }

    // 5. Render users table
    if (usersBody) {
      if (users.length === 0) {
        usersBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px 0;">No profiles found.</td></tr>`;
      } else {
        usersBody.innerHTML = users.map(user => {
          const dateStr = new Date(user.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
          const roleClass = user.role === 'admin' ? 'admin' : 'user';
          
          // Disable self demotion
          const currentLoggedIn = getCurrentUser();
          const isSelf = currentLoggedIn && currentLoggedIn.id === user.id;

          const actionBtn = isSelf 
            ? '<span style="font-size: 11px; color: var(--text-muted);">Current Active Admin</span>'
            : `<button class="action-btn edit change-role-btn" data-user-id="${user.id}" data-role="${user.role}" style="padding: 6px 12px; font-size: 11px;">
                Toggle to ${user.role === 'admin' ? 'User' : 'Admin'}
              </button>`;

          return `
            <tr data-user-id="${user.id}">
              <td style="font-weight: 600;">${user.full_name}</td>
              <td style="font-family: monospace; font-size: 11px;">${user.id}</td>
              <td><span class="badge-role ${roleClass}">${user.role}</span></td>
              <td style="font-size: 13px; color: var(--text-secondary);">${dateStr}</td>
              <td>${actionBtn}</td>
            </tr>
          `;
        }).join('');

        // Bind user role change clicks
        usersBody.querySelectorAll('.change-role-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const userId = btn.getAttribute('data-user-id');
            const currentRole = btn.getAttribute('data-role');
            const newRole = currentRole === 'admin' ? 'user' : 'admin';

            if (confirm(`Change user privileges? Set user to '${newRole}' role?`)) {
              try {
                await api.admin.updateRole(userId, newRole);
                showToast('User privileges updated', 'success');
                await loadAdminDashboard();
              } catch (e) {
                showToast('Failed to change role: ' + e.message, 'error');
              }
            }
          });
        });
      }
    }

  } catch (error) {
    showToast('Dashboard load error: ' + error.message, 'error');
  }
}
