import { api, getCurrentUser, showToast, formatPrice } from './api.js';
import { isLogged } from './auth.js';

// Global state for uploaded files
let selectedFiles = [];
// Global state for existing images (when editing a product)
let existingImageUrls = [];

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

  // 5. Profile Edit form submission
  const editProfileForm = document.getElementById('edit-profile-form');
  if (editProfileForm) {
    editProfileForm.addEventListener('submit', handleProfileUpdate);
  }

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
    const fallbackAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80';

    // Update Sidebar
    const avatarImg = document.getElementById('sidebar-avatar');
    const nameLabel = document.getElementById('sidebar-name');
    const roleLabel = document.getElementById('sidebar-role');

    if (avatarImg) avatarImg.src = profile.avatar_url || fallbackAvatar;
    if (nameLabel) nameLabel.innerText = profile.full_name;
    if (roleLabel) roleLabel.innerText = profile.role;

    // Populate inputs in Edit Form
    const nameInput = document.getElementById('profile-name');
    const avatarInput = document.getElementById('profile-avatar-url');

    if (nameInput) nameInput.value = profile.full_name;
    if (avatarInput) avatarInput.value = profile.avatar_url || '';

  } catch (err) {
    console.error('Failed to load profile settings:', err);
  }
}

// Save profile update form details
async function handleProfileUpdate(e) {
  e.preventDefault();
  const name = document.getElementById('profile-name').value;
  const avatar = document.getElementById('profile-avatar-url').value;
  const submitBtn = e.target.querySelector('button[type="submit"]');

  submitBtn.disabled = true;
  submitBtn.innerText = 'Updating Profile...';

  try {
    await api.auth.updateProfile(name, avatar || null);
    showToast('Profile updated successfully!', 'success');
    await loadProfileData(); // Reload UI
  } catch (err) {
    showToast('Update failed: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Save Profile Updates';
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
      
      return `
        <div class="user-listing-item" data-id="${prod.id}">
          <img src="${thumbnail}" alt="${prod.title}" class="user-listing-thumb">
          <div class="user-listing-details">
            <div class="user-listing-title">${prod.title}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">Category: ${prod.category} | Condition: ${prod.condition}</div>
            <div class="user-listing-price" style="margin-top: 4px;">${formattedPrice}</div>
          </div>
          <div class="user-listing-actions">
            <button class="action-btn edit" data-id="${prod.id}" title="Edit Listing">Edit</button>
            <button class="action-btn delete" data-id="${prod.id}" title="Delete Listing">Delete</button>
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

    container.querySelectorAll('.action-btn.edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await enterEditMode(id);
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
