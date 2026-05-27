import { api, showToast, formatPrice } from './api.js';
import { isLogged, updateNavbar } from './auth.js';

let loadSeq = 0;

let currentFilters = {
  search: '',
  category: '',
  condition: '',
  min_price: '',
  max_price: '',
  location: '',
  sort_by: 'newest'
};

// Keep track of user's wishlisted product IDs to highlight hearts
let userWishlist = new Set();

function refreshWishlistState() {
  if (!isLogged()) return;
  api.wishlist.list()
    .then((wishlistData) => {
      userWishlist.clear();
      (wishlistData || []).forEach((item) => {
        if (item.products && item.products.id) {
          userWishlist.add(item.products.id);
        }
      });
      // Refresh heart icons if products already rendered
      document.querySelectorAll('.wishlist-btn[data-product-id]').forEach((btn) => {
        const id = btn.getAttribute('data-product-id');
        btn.classList.toggle('active', userWishlist.has(id));
      });
    })
    .catch((err) => console.error('Error fetching wishlist state:', err));
}

function getFiltersFromUI() {
  return {
    search: document.getElementById('global-search')?.value.trim() || currentFilters.search || '',
    category: currentFilters.category || '',
    condition: document.getElementById('filter-condition')?.value || currentFilters.condition || '',
    min_price: document.getElementById('filter-min-price')?.value || currentFilters.min_price || '',
    max_price: document.getElementById('filter-max-price')?.value || currentFilters.max_price || '',
    location: document.getElementById('filter-location')?.value || currentFilters.location || '',
    sort_by: document.getElementById('filter-sort')?.value || currentFilters.sort_by || 'newest',
  };
}

function buildSavedSearchPayload(filters) {
  const payload = {
    search: filters.search || null,
    category: filters.category || null,
    condition: filters.condition || null,
    location: filters.location || null,
    sort_by: filters.sort_by || 'newest',
    alert_enabled: true,
  };
  if (filters.min_price !== '' && filters.min_price != null) {
    payload.min_price = parseFloat(filters.min_price);
  }
  if (filters.max_price !== '' && filters.max_price != null) {
    payload.max_price = parseFloat(filters.max_price);
  }
  return payload;
}

function describeSavedSearch(s) {
  const parts = [];
  if (s.search) parts.push(`"${s.search}"`);
  if (s.category) parts.push(s.category);
  if (s.location) parts.push(s.location);
  if (s.condition) parts.push(s.condition);
  if (s.min_price != null || s.max_price != null) {
    const lo = s.min_price != null ? formatPrice(s.min_price) : '₹0';
    const hi = s.max_price != null ? formatPrice(s.max_price) : 'any';
    parts.push(`${lo} – ${hi}`);
  }
  return s.label || parts.join(' · ') || 'Saved search';
}

async function loadSavedSearchesPanel() {
  const panel = document.getElementById('saved-searches-panel');
  const list = document.getElementById('saved-searches-list');
  if (!panel || !list) return;

  if (!isLogged()) {
    panel.hidden = true;
    return;
  }

  try {
    const searches = await api.savedSearches.list();
    if (searches.length === 0) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;
    list.innerHTML = searches.slice(0, 5).map((s) => `
      <div class="saved-search-chip" data-id="${s.id}">
        <div class="saved-search-chip-text">
          <strong>${describeSavedSearch(s)}</strong>
          <span>${s.alert_enabled ? 'Alerts on' : 'Alerts off'}</span>
        </div>
        <button type="button" class="saved-search-remove" data-id="${s.id}" aria-label="Remove alert">✕</button>
      </div>
    `).join('');

    list.querySelectorAll('.saved-search-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await api.savedSearches.remove(id);
          showToast('Search alert removed', 'info');
          loadSavedSearchesPanel();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  } catch {
    panel.hidden = true;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateNavbar();
  loadProducts();
  refreshWishlistState();
  loadSavedSearchesPanel();

  // 3. Category chips event listeners
  const chips = document.querySelectorAll('.category-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      
      currentFilters.category = chip.getAttribute('data-category') || '';
      loadProducts();
    });
  });

  // 4. Global Search Bindings (Enter press)
  const searchInput = document.getElementById('global-search');
  const runSearch = () => {
    if (searchInput) {
      currentFilters.search = searchInput.value.trim();
      loadProducts();
    }
  };
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runSearch();
    });
  }
  const searchBtn = document.getElementById('global-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', runSearch);
  }

  // 5. Apply Advanced Filters
  const applyBtn = document.getElementById('apply-filters-btn');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const f = getFiltersFromUI();
      Object.assign(currentFilters, f);
      loadProducts();
    });
  }

  const saveSearchBtn = document.getElementById('save-search-btn');
  if (saveSearchBtn) {
    saveSearchBtn.addEventListener('click', async () => {
      if (!isLogged()) {
        showToast('Sign in to save search alerts', 'info');
        setTimeout(() => { window.location.href = 'login.html'; }, 1000);
        return;
      }

      const f = getFiltersFromUI();
      Object.assign(currentFilters, f);

      const hasFilter = f.search || f.category || f.condition || f.location || f.min_price || f.max_price;
      if (!hasFilter) {
        showToast('Apply at least one filter before saving an alert.', 'info');
        return;
      }

      saveSearchBtn.disabled = true;
      try {
        await api.savedSearches.create(buildSavedSearchPayload(f));
        showToast('Search alert saved! We’ll notify you about new matches.', 'success');
        loadSavedSearchesPanel();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        saveSearchBtn.disabled = false;
      }
    });
  }
});

// Load products and render cards grid
export async function loadProducts() {
  const grid = document.getElementById('products-grid-container');
  const countLabel = document.getElementById('product-count');
  if (!grid) return;

  const seq = ++loadSeq;

  if (countLabel) countLabel.innerText = 'Loading listings...';

  grid.innerHTML = `
    <div class="no-results" style="grid-column: 1 / -1; padding: 100px 0;">
      <div class="loader" aria-hidden="true"></div>
      <p>Loading listings...</p>
    </div>
  `;

  try {
    const data = await api.products.list(currentFilters);
    if (seq !== loadSeq) return;

    const products = Array.isArray(data) ? data : [];

    if (countLabel) {
      countLabel.innerText = `${products.length} item${products.length !== 1 ? 's' : ''} found`;
    }

    if (products.length === 0) {
      grid.innerHTML = `
        <div class="no-results">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
          </svg>
          <h3 style="font-size: 20px; font-weight: 600;">No products found</h3>
          <p style="color: var(--text-secondary);">Try adjusting your search filters or browse other categories.</p>
        </div>
      `;
      return;
    }

    // Render cards
    grid.innerHTML = products.map(prod => {
      const isFav = userWishlist.has(prod.id);
      const thumbnail = prod.images && prod.images.length > 0 ? prod.images[0] : 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=600&q=80';
      const formattedPrice = formatPrice(prod.price);
      const dateStr = new Date(prod.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
      const condClass = (prod.condition || 'Good').toLowerCase().replace(/\s+/g, '_');

      const listingStatus = prod.status || 'active';

      return `
        <div class="product-card glass-panel ${listingStatus === 'sold' ? 'product-card-sold' : ''}" data-id="${prod.id}">
          <div class="card-image-wrapper">
            <span class="card-tag condition-${condClass}">${prod.condition}</span>
            ${listingStatus !== 'active' ? `<span class="listing-status-badge status-${listingStatus}">${listingStatus}</span>` : ''}
            <button class="wishlist-btn ${isFav ? 'active' : ''}" data-product-id="${prod.id}" title="Save to Favorites">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </button>
            <a href="product.html?id=${prod.id}">
              <img src="${thumbnail}" alt="${prod.title}" class="card-image" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=600&q=80';">
            </a>
          </div>
          <div class="card-body">
            <span class="card-category">${prod.category}</span>
            <h3 class="card-title">
              <a href="product.html?id=${prod.id}">${prod.title}</a>
            </h3>
            <div class="card-price">${formattedPrice}</div>
            <div class="card-footer">
              <div class="card-location">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 14px; height: 14px; color: var(--accent-cyan);">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                <span>${prod.location}</span>
              </div>
              <span class="card-date">${dateStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind Wishlist Clicks
    grid.querySelectorAll('.wishlist-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!isLogged()) {
          showToast('Please sign in to save favorites!', 'info');
          setTimeout(() => window.location.href = 'login.html', 1000);
          return;
        }

        const productId = btn.getAttribute('data-product-id');
        const isActive = btn.classList.contains('active');

        try {
          if (isActive) {
            await api.wishlist.remove(productId);
            btn.classList.remove('active');
            userWishlist.delete(productId);
            showToast('Removed from favorites', 'info');
          } else {
            await api.wishlist.add(productId);
            btn.classList.add('active');
            userWishlist.add(productId);
            showToast('Added to favorites', 'success');
          }
        } catch (err) {
          showToast('Failed to update wishlist', 'error');
        }
      });
    });

  } catch (error) {
    if (seq !== loadSeq) return;
    if (countLabel) countLabel.innerText = 'Could not load listings';
    grid.innerHTML = `
      <div class="no-results">
        <h3 style="font-size: 20px; color: var(--accent-rose);">Error loading items</h3>
        <p style="color: var(--text-secondary);">${error.message || 'Please check that the server is running.'}</p>
        <button type="button" class="nav-btn primary" id="retry-load-products" style="margin-top: 16px;">Try Again</button>
      </div>
    `;
    document.getElementById('retry-load-products')?.addEventListener('click', () => loadProducts());
  }
}
