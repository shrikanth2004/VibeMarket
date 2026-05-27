import { api, getCurrentUser, showToast, formatPrice } from './api.js';
import { isLogged, updateNavbar } from './auth.js';

// Global state for uploaded files
let selectedFiles = [];
// Global state for existing images (when editing a product)
let existingImageUrls = [];

const FALLBACK_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80';
const AVATAR_EXPORT_SIZE = 400;
const AVATAR_CROP_SIZE = 280;

const avatarCropState = {
  image: null,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  startOffsetX: 0,
  startOffsetY: 0,
};

document.addEventListener('DOMContentLoaded', () => {
  // 1. Auth Guard redirect
  if (!isLogged()) {
    showToast('Redirecting to login...', 'info');
    window.location.href = 'login.html';
    return;
  }

  // 2. Tab Navigation setup
  setupDashboardTabs();

  // 3. Load Profile details
  loadProfileData();

  // 4. Load Tab Contents
  loadUserListings();
  loadUserFavorites();
  loadProfileSavedSearches();

  // 5. Profile Edit form submission
  const editProfileForm = document.getElementById('edit-profile-form');
  if (editProfileForm) {
    editProfileForm.addEventListener('submit', handleProfileUpdate);
  }

  setupAvatarUpload();

  // 6. Uploader Drag & Drop setup
  setupDragAndDrop();

  // 7. Product Listing Form submission
  const listingForm = document.getElementById('listing-form');
  if (listingForm) {
    listingForm.addEventListener('submit', handleListingSubmit);
  }

  // 8. Cancel Edit Listing Button
  const cancelBtn = document.getElementById('cancel-listing-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', resetListingForm);
  }
});

// Setup tab navigation clicks
function setupDashboardTabs() {
  const navItems = document.querySelectorAll('.profile-nav-item');
  const panes = document.querySelectorAll('.tab-pane');

  function switchTab(tabId) {
    navItems.forEach(nav => {
      const isMatch = nav.getAttribute('data-tab') === tabId;
      nav.classList.toggle('active', isMatch);
    });
    panes.forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Check URL parameters for starting tab
  const urlParams = new URLSearchParams(window.location.search);
  const activeTab = urlParams.get('tab');
  if (activeTab) {
    switchTab(activeTab);
  }
}

// Fetch active user details
async function loadProfileData() {
  try {
    const profile = await api.auth.getProfile();
    const avatarUrl = profile.avatar_url || FALLBACK_AVATAR;

    // Update Sidebar
    const avatarImg = document.getElementById('sidebar-avatar');
    const nameLabel = document.getElementById('sidebar-name');
    const roleLabel = document.getElementById('sidebar-role');

    if (avatarImg) avatarImg.src = avatarUrl;
    if (nameLabel) nameLabel.innerText = profile.full_name;
    if (roleLabel) roleLabel.innerText = profile.role;

    // Populate inputs in Edit Form
    const nameInput = document.getElementById('profile-name');
    const previewImg = document.getElementById('profile-avatar-preview');

    if (nameInput) nameInput.value = profile.full_name;
    if (previewImg) previewImg.src = avatarUrl;

  } catch (err) {
    console.error('Failed to load profile settings:', err);
  }
}

function setupAvatarUpload() {
  const fileInput = document.getElementById('profile-avatar-file');
  const pickBtn = document.getElementById('profile-avatar-pick-btn');
  const previewImg = document.getElementById('profile-avatar-preview');
  const modal = document.getElementById('avatar-crop-modal');
  const canvas = document.getElementById('avatar-crop-canvas');
  const zoomInput = document.getElementById('avatar-crop-zoom');
  const saveBtn = document.getElementById('avatar-crop-save');
  const cancelBtn = document.getElementById('avatar-crop-cancel');
  const backdrop = document.getElementById('avatar-crop-backdrop');

  if (!fileInput || !pickBtn || !modal || !canvas || !zoomInput || !saveBtn || !cancelBtn) return;

  const openPicker = () => fileInput.click();

  pickBtn.addEventListener('click', openPicker);
  if (previewImg) previewImg.addEventListener('click', openPicker);

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file from your gallery.', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('Image must be 10 MB or smaller.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        avatarCropState.image = img;
        avatarCropState.scale = 1;
        avatarCropState.offsetX = 0;
        avatarCropState.offsetY = 0;
        zoomInput.value = '1';
        drawAvatarCropPreview(canvas);
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  zoomInput.addEventListener('input', () => {
    avatarCropState.scale = parseFloat(zoomInput.value) || 1;
    drawAvatarCropPreview(canvas);
  });

  const startDrag = (clientX, clientY) => {
    avatarCropState.dragging = true;
    avatarCropState.dragStartX = clientX;
    avatarCropState.dragStartY = clientY;
    avatarCropState.startOffsetX = avatarCropState.offsetX;
    avatarCropState.startOffsetY = avatarCropState.offsetY;
  };

  const moveDrag = (clientX, clientY) => {
    if (!avatarCropState.dragging) return;
    avatarCropState.offsetX = avatarCropState.startOffsetX + (clientX - avatarCropState.dragStartX);
    avatarCropState.offsetY = avatarCropState.startOffsetY + (clientY - avatarCropState.dragStartY);
    drawAvatarCropPreview(canvas);
  };

  const endDrag = () => {
    avatarCropState.dragging = false;
  };

  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  });

  window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
  window.addEventListener('mouseup', endDrag);

  canvas.addEventListener('touchstart', (e) => {
    if (!e.touches[0]) return;
    e.preventDefault();
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (!e.touches[0]) return;
    e.preventDefault();
    moveDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  canvas.addEventListener('touchend', endDrag);

  const closeModal = () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    avatarCropState.image = null;
    endDrag();
  };

  cancelBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);

  saveBtn.addEventListener('click', async () => {
    if (!avatarCropState.image) return;

    saveBtn.disabled = true;
    saveBtn.innerText = 'Saving...';

    try {
      const blob = await exportCroppedAvatarBlob();
      await api.auth.uploadAvatar(blob);
      showToast('Profile photo updated!', 'success');
      await loadProfileData();
      await updateNavbar();
      closeModal();
    } catch (err) {
      showToast('Upload failed: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerText = 'Save photo';
    }
  });
}

function getAvatarCropMetrics(size) {
  const img = avatarCropState.image;
  if (!img) return null;

  const baseScale = Math.max(size / img.width, size / img.height);
  const scale = baseScale * avatarCropState.scale;
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  const x = (size - drawWidth) / 2 + avatarCropState.offsetX;
  const y = (size - drawHeight) / 2 + avatarCropState.offsetY;

  return { x, y, drawWidth, drawHeight };
}

function drawAvatarCropPreview(canvas) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const img = avatarCropState.image;
  if (!ctx || !img) return;

  const metrics = getAvatarCropMetrics(size);
  if (!metrics) return;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, metrics.x, metrics.y, metrics.drawWidth, metrics.drawHeight);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function exportCroppedAvatarBlob() {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_EXPORT_SIZE;
    canvas.height = AVATAR_EXPORT_SIZE;
    const ctx = canvas.getContext('2d');
    const metrics = getAvatarCropMetrics(AVATAR_CROP_SIZE);

    if (!ctx || !avatarCropState.image || !metrics) {
      reject(new Error('Could not prepare cropped image.'));
      return;
    }

    const scaleFactor = AVATAR_EXPORT_SIZE / AVATAR_CROP_SIZE;

    ctx.beginPath();
    ctx.arc(AVATAR_EXPORT_SIZE / 2, AVATAR_EXPORT_SIZE / 2, AVATAR_EXPORT_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(
      avatarCropState.image,
      metrics.x * scaleFactor,
      metrics.y * scaleFactor,
      metrics.drawWidth * scaleFactor,
      metrics.drawHeight * scaleFactor
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not create image file.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      0.92
    );
  });
}

// Save profile update form details
async function handleProfileUpdate(e) {
  e.preventDefault();
  const name = document.getElementById('profile-name').value.trim();
  const submitBtn = e.target.querySelector('button[type="submit"]');

  submitBtn.disabled = true;
  submitBtn.innerText = 'Updating Profile...';

  try {
    await api.auth.updateProfile(name);
    showToast('Profile updated successfully!', 'success');
    await loadProfileData();
    await updateNavbar();
  } catch (err) {
    showToast('Update failed: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Save Profile Updates';
  }
}

function describeSavedSearchRow(s) {
  const parts = [];
  if (s.search) parts.push(`"${s.search}"`);
  if (s.category) parts.push(s.category);
  if (s.location) parts.push(s.location);
  if (s.condition) parts.push(s.condition);
  if (s.min_price != null || s.max_price != null) {
    parts.push(`${s.min_price != null ? formatPrice(s.min_price) : '₹0'} – ${s.max_price != null ? formatPrice(s.max_price) : 'any'}`);
  }
  return s.label || parts.join(' · ') || 'Saved search';
}

async function loadProfileSavedSearches() {
  const container = document.getElementById('profile-saved-searches-list');
  if (!container) return;

  try {
    const searches = await api.savedSearches.list();

    if (searches.length === 0) {
      container.innerHTML = `
        <p style="color: var(--text-muted); text-align: center; padding: 32px 0;">
          No alerts yet. On the home page, set filters and tap <strong>Save Search Alert</strong>.
        </p>`;
      return;
    }

    container.innerHTML = searches.map((s) => `
      <div class="saved-search-row glass-panel">
        <div class="saved-search-row-body">
          <strong>${describeSavedSearchRow(s)}</strong>
          <span class="saved-search-meta">${s.alert_enabled ? '🔔 Alerts enabled' : 'Alerts paused'}</span>
        </div>
        <div class="saved-search-row-actions">
          <button type="button" class="action-btn edit toggle-alert-btn" data-id="${s.id}" data-enabled="${s.alert_enabled}">
            ${s.alert_enabled ? 'Pause' : 'Enable'}
          </button>
          <button type="button" class="action-btn delete remove-alert-btn" data-id="${s.id}">Remove</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.toggle-alert-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const enabled = btn.getAttribute('data-enabled') === 'true';
        try {
          await api.savedSearches.update(id, { alert_enabled: !enabled });
          showToast(enabled ? 'Alerts paused' : 'Alerts enabled', 'success');
          loadProfileSavedSearches();
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });

    container.querySelectorAll('.remove-alert-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Remove this search alert?')) return;
        try {
          await api.savedSearches.remove(id);
          showToast('Alert removed', 'info');
          loadProfileSavedSearches();
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });
  } catch (error) {
    container.innerHTML = `<p style="color: var(--accent-rose); text-align: center;">${error.message}</p>`;
  }
}

// Load active listings owned by this user
async function loadUserListings() {
  const container = document.getElementById('listings-list-container');
  if (!container) return;

  try {
    const user = getCurrentUser();
    if (!user) return;

    const listings = await api.products.list({ seller_id: user.id });

    if (listings.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 40px 0;">You don't have any active listings yet.</p>`;
      return;
    }

    container.innerHTML = listings.map(prod => {
      const thumbnail = prod.images && prod.images.length > 0 ? prod.images[0] : 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=600&q=80';
      const formattedPrice = formatPrice(prod.price);
      const status = prod.status || 'active';
      const statusLabel = { active: 'Active', sold: 'Sold', reserved: 'Reserved', draft: 'Draft' }[status] || status;

      return `
        <div class="user-listing-item ${status === 'sold' ? 'user-listing-sold' : ''}" data-id="${prod.id}">
          <img src="${thumbnail}" alt="${prod.title}" class="user-listing-thumb">
          <div class="user-listing-details">
            <div class="user-listing-title">${prod.title}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              ${prod.category} · ${prod.condition}
              <span class="listing-status-badge status-${status}" style="margin-left: 6px;">${statusLabel}</span>
            </div>
            <div class="user-listing-price" style="margin-top: 4px;">${formattedPrice}</div>
          </div>
          <div class="user-listing-actions">
            ${status === 'active' ? `<button class="action-btn mark-sold-btn" data-id="${prod.id}" type="button">Mark Sold</button>` : ''}
            ${status === 'sold' ? `<button class="action-btn edit relist-btn" data-id="${prod.id}" type="button">Relist</button>` : ''}
            <button class="action-btn edit" data-id="${prod.id}" title="Edit Listing" type="button">Edit</button>
            <button class="action-btn delete" data-id="${prod.id}" title="Delete Listing" type="button">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Bind edit/delete clicks
    container.querySelectorAll('.action-btn.delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this listing permanently?')) {
          try {
            await api.products.delete(id);
            showToast('Listing deleted successfully', 'success');
            loadUserListings();
          } catch (e) {
            showToast('Failed to delete listing: ' + e.message, 'error');
          }
        }
      });
    });

    container.querySelectorAll('.action-btn.edit:not(.relist-btn)').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await enterEditMode(id);
      });
    });

    container.querySelectorAll('.mark-sold-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Mark this listing as sold? Wishlist users will be notified.')) return;
        try {
          await api.products.updateStatus(id, 'sold');
          showToast('Listing marked as sold', 'success');
          loadUserListings();
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });

    container.querySelectorAll('.relist-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await api.products.updateStatus(id, 'active');
          showToast('Listing is active again', 'success');
          loadUserListings();
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });

  } catch (error) {
    container.innerHTML = `<p style="color: var(--accent-rose); text-align: center;">Failed to load listings: ${error.message}</p>`;
  }
}

// Edit Mode form setup
async function enterEditMode(productId) {
  try {
    const prod = await api.products.get(productId);
    
    // Set form fields
    document.getElementById('edit-product-id').value = prod.id;
    document.getElementById('product-title').value = prod.title;
    document.getElementById('product-category').value = prod.category;
    document.getElementById('product-condition').value = prod.condition;
    document.getElementById('product-price').value = prod.price;
    document.getElementById('product-location').value = prod.location;
    document.getElementById('product-description').value = prod.description;

    // Load existing images
    existingImageUrls = prod.images || [];
    selectedFiles = []; // Clear new file uploads
    
    // Update headers and actions
    document.getElementById('form-heading').innerText = 'Edit Product Listing';
    document.getElementById('submit-listing-btn').innerText = 'Save Changes';
    document.getElementById('cancel-listing-btn').style.display = 'block';

    renderImagePreviews();

    // Switch tab to post-listing
    document.getElementById('nav-post-tab-btn').click();

  } catch (err) {
    showToast('Failed to load listing edit data', 'error');
  }
}

// Reset Listing Form to default state
function resetListingForm() {
  document.getElementById('edit-product-id').value = '';
  document.getElementById('listing-form').reset();
  
  selectedFiles = [];
  existingImageUrls = [];
  
  document.getElementById('form-heading').innerText = 'Post a New Product';
  document.getElementById('submit-listing-btn').innerText = 'Publish Listing';
  document.getElementById('cancel-listing-btn').style.display = 'none';
  
  renderImagePreviews();
}

// Fetch user wishlist saved products
async function loadUserFavorites() {
  const grid = document.getElementById('favorites-grid-container');
  if (!grid) return;

  try {
    const favorites = await api.wishlist.list();

    if (favorites.length === 0) {
      grid.innerHTML = `<p style="color: var(--text-muted); text-align: center; grid-column: 1 / -1; padding: 40px 0;">No saved items in wishlist.</p>`;
      return;
    }

    grid.innerHTML = favorites.map(fav => {
      const prod = fav.products;
      if (!prod) return '';
      const thumbnail = prod.images && prod.images.length > 0 ? prod.images[0] : 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=600&q=80';
      const formattedPrice = formatPrice(prod.price);
      const condClass = prod.condition.toLowerCase().replace(' ', '_');

      return `
        <div class="product-card glass-panel" data-id="${prod.id}">
          <div class="card-image-wrapper">
            <span class="card-tag condition-${condClass}">${prod.condition}</span>
            <button class="wishlist-btn active" data-product-id="${prod.id}" title="Remove Favorite">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </button>
            <a href="product.html?id=${prod.id}">
              <img src="${thumbnail}" alt="${prod.title}" class="card-image" loading="lazy">
            </a>
          </div>
          <div class="card-body">
            <span class="card-category">${prod.category}</span>
            <h3 class="card-title">
              <a href="product.html?id=${prod.id}">${prod.title}</a>
            </h3>
            <div class="card-price">${formattedPrice}</div>
            <div class="card-footer" style="border: none; padding-top: 0;">
              <div class="card-location">
                <span>📍 ${prod.location}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Handle heart removal inside favorites pane
    grid.querySelectorAll('.wishlist-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const pId = btn.getAttribute('data-product-id');
        try {
          await api.wishlist.remove(pId);
          showToast('Removed from favorites', 'info');
          // Reload grids
          loadUserFavorites();
        } catch (err) {
          showToast('Failed to update wishlist', 'error');
        }
      });
    });

  } catch (error) {
    grid.innerHTML = `<p style="color: var(--accent-rose); text-align: center; grid-column: 1 / -1;">Failed to load saved items: ${error.message}</p>`;
  }
}

// Setup Drag and Drop File Upload
function setupDragAndDrop() {
  const dropzone = document.getElementById('image-dropzone');
  const fileInput = document.getElementById('product-files');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    handleFilesSelected(e.target.files);
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent-cyan)';
    dropzone.style.background = 'rgba(6, 182, 212, 0.05)';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--glass-border)';
    dropzone.style.background = 'none';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--glass-border)';
    dropzone.style.background = 'none';
    
    if (e.dataTransfer.files) {
      handleFilesSelected(e.dataTransfer.files);
    }
  });
}

// Queue selected files
function handleFilesSelected(files) {
  const totalCount = selectedFiles.length + existingImageUrls.length;
  if (totalCount + files.length > 5) {
    showToast('Maximum limit is 5 images per product.', 'info');
    return;
  }

  for (let file of files) {
    if (!file.type.startsWith('image/')) {
      showToast('Only image files are allowed!', 'error');
      continue;
    }
    selectedFiles.push(file);
  }

  renderImagePreviews();
}

// Render previews (both existing remote URLs and newly added files)
function renderImagePreviews() {
  const container = document.getElementById('file-previews-container');
  if (!container) return;

  container.innerHTML = '';

  // 1. Render existing remote URLs (when editing)
  existingImageUrls.forEach((url, idx) => {
    const div = document.createElement('div');
    div.className = 'image-preview-item';
    div.innerHTML = `
      <img src="${url}" alt="Existing product image">
      <div class="remove-preview" data-type="existing" data-index="${idx}">✕</div>
    `;
    container.appendChild(div);
  });

  // 2. Render local queued files
  selectedFiles.forEach((file, idx) => {
    const reader = new FileReader();
    const div = document.createElement('div');
    div.className = 'image-preview-item';
    
    reader.onload = (e) => {
      div.innerHTML = `
        <img src="${e.target.result}" alt="New image preview">
        <div class="remove-preview" data-type="new" data-index="${idx}">✕</div>
      `;
    };
    reader.readAsDataURL(file);
    container.appendChild(div);
  });

  // Attach delete handlers to preview buttons
  setTimeout(() => {
    container.querySelectorAll('.remove-preview').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = btn.getAttribute('data-type');
        const idx = parseInt(btn.getAttribute('data-index'));

        if (type === 'existing') {
          existingImageUrls.splice(idx, 1);
        } else if (type === 'new') {
          selectedFiles.splice(idx, 1);
        }

        renderImagePreviews();
      });
    });
  }, 100);
}

// Submit Product form (Post / Edit)
async function handleListingSubmit(e) {
  e.preventDefault();

  const title = document.getElementById('product-title').value.trim();
  const category = document.getElementById('product-category').value;
  const condition = document.getElementById('product-condition').value;
  const price = parseFloat(document.getElementById('product-price').value);
  const location = document.getElementById('product-location').value.trim();
  const description = document.getElementById('product-description').value.trim();
  
  const editId = document.getElementById('edit-product-id').value;
  const submitBtn = document.getElementById('submit-listing-btn');

  // Basic Validation
  if (!title || !category || !condition || isNaN(price) || !location || !description) {
    showToast('Please fill out all fields!', 'info');
    return;
  }

  if (selectedFiles.length === 0 && existingImageUrls.length === 0) {
    showToast('Please upload at least 1 image.', 'info');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerText = editId ? 'Saving Changes...' : 'Publishing Product...';

  // Pack variables into FormData
  const formData = new FormData();
  formData.append('title', title);
  formData.append('category', category);
  formData.append('condition', condition);
  formData.append('price', price.toString());
  formData.append('location', location);
  formData.append('description', description);

  // Append new files
  selectedFiles.forEach(file => {
    formData.append('images', file);
  });

  try {
    if (editId) {
      // Edit mode
      formData.append('existing_images', existingImageUrls.join(','));
      await api.products.update(editId, formData);
      showToast('Listing updated successfully!', 'success');
    } else {
      // Create mode
      await api.products.create(formData);
      showToast('Product published successfully!', 'success');
    }

    // Reset Form
    resetListingForm();

    // Reload lists and switch tabs
    loadUserListings();
    document.querySelector('.profile-nav-item[data-tab="my-listings"]').click();

  } catch (err) {
    showToast('Failed to save listing: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = editId ? 'Save Changes' : 'Publish Listing';
  }
}
