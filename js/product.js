import { api, getCurrentUser, showToast, formatPrice } from './api.js';
import { isLogged } from './auth.js';

let productId = '';
let currentImageIndex = 0;
let productImages = [];
let selectedRating = 0;

// ── Recently Viewed ────────────────────────────────────────────────────────
const RECENTLY_VIEWED_KEY = 'recently_viewed';
const RECENTLY_VIEWED_MAX = 10;

function trackRecentlyViewed(id) {
  if (!id) return;
  try {
    const existing = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]');
    // Move to front, remove duplicates, cap at max
    const updated = [id, ...existing.filter(i => i !== id)].slice(0, RECENTLY_VIEWED_MAX);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Recently viewed tracking failed:', e);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Get product ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  productId = urlParams.get('id');

  if (!productId) {
    showToast('Invalid listing ID', 'error');
    setTimeout(() => window.location.href = 'index.html', 1500);
    return;
  }

  // 2. Track this product as recently viewed
  trackRecentlyViewed(productId);

  // 3. Fetch and render data
  await loadProductDetails();
  await loadComments();
  await loadReviews();

  // 3. Initialize interactive inputs based on auth status
  if (isLogged()) {
    // Enable Q&A comment input
    const commentInput = document.getElementById('new-comment-input');
    const sendBtn = document.getElementById('send-comment-btn');
    const commentAuth = document.getElementById('comment-auth-warning');
    
    if (commentInput && sendBtn) {
      commentInput.removeAttribute('disabled');
      sendBtn.removeAttribute('disabled');
    }
    if (commentAuth) {
      commentAuth.style.display = 'none';
    }

    // Show rating form panel
    const reviewPanel = document.getElementById('write-review-panel');
    const reviewAuth = document.getElementById('review-auth-warning');
    if (reviewPanel) reviewPanel.style.display = 'flex';
    if (reviewAuth) reviewAuth.style.display = 'none';

    // Interactive Star Rating selection
    setupStarRatingSelector();
  }

  // 4. Bind Comment posting
  const sendCommentBtn = document.getElementById('send-comment-btn');
  const commentInput = document.getElementById('new-comment-input');
  if (sendCommentBtn && commentInput) {
    sendCommentBtn.addEventListener('click', postComment);
    commentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') postComment();
    });
  }

  // 5. Bind Review posting
  const submitReviewBtn = document.getElementById('submit-review-btn');
  if (submitReviewBtn) {
    submitReviewBtn.addEventListener('click', postReview);
  }
});

// Load listing details
async function loadProductDetails() {
  const container = document.getElementById('product-detail-container');
  if (!container) return;

  try {
    const prod = await api.products.get(productId);
    document.title = `${prod.title} - VibeMarket`;

    productImages = prod.images || [];
    currentImageIndex = 0;

    const formattedPrice = formatPrice(prod.price);
    const dateStr = new Date(prod.created_at).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
    const seller = prod.profiles || { full_name: 'Unknown Seller', avatar_url: '' };
    const listingStatus = prod.status || 'active';
    const soldBanner = listingStatus === 'sold'
      ? '<div class="product-sold-banner" role="status">This item has been sold</div>'
      : listingStatus === 'reserved'
        ? '<div class="product-sold-banner product-reserved-banner" role="status">Reserved by a buyer</div>'
        : '';
    
    // Check if item is wishlisted by current user
    let isFav = false;
    if (isLogged()) {
      try {
        const favs = await api.wishlist.list();
        isFav = favs.some(item => item.products && item.products.id === prod.id);
      } catch(e) {}
    }

    // Left Gallery HTML
    const galleryHtml = `
      <div class="product-gallery">
        <div class="main-carousel-wrapper">
          ${productImages.map((img, idx) => `
            <img src="${img}" alt="${prod.title}" class="main-carousel-image ${idx === 0 ? 'active' : ''}" data-index="${idx}">
          `).join('')}
          
          <!-- Prev/Next buttons if multiple images -->
          ${productImages.length > 1 ? `
            <button class="carousel-btn prev" id="carousel-prev-btn">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width: 20px; height: 20px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button class="carousel-btn next" id="carousel-next-btn">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width: 20px; height: 20px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          ` : ''}
        </div>
        
        <!-- Thumbnail strip -->
        ${productImages.length > 1 ? `
          <div class="thumbnail-strip">
            ${productImages.map((img, idx) => `
              <div class="thumbnail-item ${idx === 0 ? 'active' : ''}" data-index="${idx}">
                <img src="${img}" alt="Thumbnail">
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Description panel -->
        <div class="glass-panel product-description-panel" style="margin-top: 16px;">
          <h3>Product Description</h3>
          <div class="product-description-content">
            ${prod.description.replace(/\n/g, '<br>')}
          </div>
        </div>
      </div>
    `;

    // Right Sidebar HTML
    const sidebarHtml = `
      <div class="product-sidebar">
        
        <!-- Info Card -->
        <div class="glass-panel product-info-panel">
          ${soldBanner}
          <div class="product-info-header">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
              <span class="card-category" style="font-size: 14px;">${prod.category}</span>
              <button class="wishlist-btn ${isFav ? 'active' : ''}" id="detail-wishlist-btn" title="Add to Wishlist" style="position: static; flex-shrink: 0;">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px;">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </button>
            </div>
            <h1 class="product-detail-title" style="margin-top: 8px;">${prod.title}</h1>
            <div class="product-detail-price" style="margin-top: 12px;">${formattedPrice}</div>
          </div>

          <div class="product-meta-grid">
            <div class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 1 1 .512 1.358L12 12.75l-.234-.122a.75.75 0 1 1 .512-1.358l.041.02Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
              </svg>
              <span>Condition: <strong>${prod.condition}</strong></span>
            </div>
            <div class="meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
              <span>Location: <strong>${prod.location}</strong></span>
            </div>
          </div>

          <div style="font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--glass-border); padding-top: 16px;">
            Listing ID: ${prod.id}<br>
            Posted: ${dateStr}
          </div>
        </div>

        <!-- Seller Profile Card -->
        <div class="glass-panel seller-panel">
          <h3 style="font-size: 14px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 16px;">Seller Profile</h3>
          <div class="seller-info">
            <img src="${seller.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'}" alt="Seller Avatar" class="seller-avatar">
            <div>
              <div class="seller-name">${seller.full_name}</div>
              <div class="seller-role">${seller.role}</div>
            </div>
          </div>

          <!-- Follow Seller Button (hidden for own listings) -->
          ${isLogged() && getCurrentUser()?.id !== prod.seller_id ? `
            <button id="follow-seller-btn" class="form-submit-btn" data-seller-id="${prod.seller_id}"
              style="background: var(--bg-secondary); border: 1px solid var(--glass-border); color: white; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 10px;">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 18px; height: 18px; color: var(--accent-cyan);"><path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" /></svg>
              <span id="follow-btn-label">Follow Seller</span>
            </button>
          ` : ''}

          <button id="chat-start-btn" class="form-submit-btn" style="background: var(--bg-secondary); border: 1px solid var(--glass-border); color: white; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 18px; height: 18px; color: var(--accent-cyan);">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
            Start Q&A Discussion
          </button>
        </div>

      </div>
    `;

    // Mark Sold to Buyer Modal (only for seller) — insert BEFORE overwriting innerHTML
    const currentUser = getCurrentUser();
    const sellerOwnedActive = isLogged() && currentUser?.id === prod.seller_id && prod.status === 'active';

    container.innerHTML = galleryHtml + sidebarHtml;

    // Inject modal into body after innerHTML set
    if (sellerOwnedActive) {
      const existingModal = document.getElementById('sold-to-buyer-modal');
      if (existingModal) existingModal.remove();
      const modalEl = document.createElement('div');
      modalEl.id = 'sold-to-buyer-modal';
      modalEl.className = 'avatar-crop-modal';
      modalEl.setAttribute('aria-hidden', 'true');
      modalEl.setAttribute('role', 'dialog');
      modalEl.innerHTML = `
        <div class="avatar-crop-backdrop" id="sold-modal-backdrop"></div>
        <div class="avatar-crop-dialog glass-panel" style="max-width: 420px;">
          <h3 style="margin-bottom: 8px;">Mark as Sold</h3>
          <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;">Optionally enter the buyer's name or leave blank for a cash/anonymous sale.</p>
          <div class="form-group">
            <label for="sold-buyer-name" style="font-size: 13px;">Buyer Name (optional)</label>
            <input type="text" id="sold-buyer-name" class="form-input" placeholder="e.g. Rahul Kumar" style="margin-top: 6px;">
          </div>
          <div class="avatar-crop-actions" style="margin-top: 20px;">
            <button type="button" class="form-submit-btn secondary" id="sold-modal-cancel">Cancel</button>
            <button type="button" class="form-submit-btn" id="sold-modal-confirm">Confirm Sale</button>
          </div>
        </div>
      `;
      document.body.appendChild(modalEl);
      setupSoldToBuyerModal(prod);
    }


    // 5. Setup Carousel events
    initCarousel();
    
    // 6. Setup Wishlist detail button
    const favBtn = document.getElementById('detail-wishlist-btn');
    if (favBtn) {
      favBtn.addEventListener('click', async () => {
        if (!isLogged()) {
          showToast('Please login to wishlist items', 'info');
          setTimeout(() => window.location.href = 'login.html', 1000);
          return;
        }
        const isActive = favBtn.classList.contains('active');
        try {
          if (isActive) {
            await api.wishlist.remove(productId);
            favBtn.classList.remove('active');
            showToast('Removed from favorites', 'info');
          } else {
            await api.wishlist.add(productId);
            favBtn.classList.add('active');
            showToast('Added to favorites', 'success');
          }
        } catch (e) {
          showToast('Wishlist action failed', 'error');
        }
      });
    }

    // Scroll to Q&A chat on contact click
    const chatBtn = document.getElementById('chat-start-btn');
    if (chatBtn) {
      chatBtn.addEventListener('click', () => {
        document.getElementById('new-comment-input').focus();
        document.getElementById('new-comment-input').scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Follow Seller button logic
    const followBtn = document.getElementById('follow-seller-btn');
    if (followBtn && isLogged()) {
      const sellerId = followBtn.getAttribute('data-seller-id');
      // Check current follow state
      try {
        const { is_following } = await api.sellers.isFollowing(sellerId);
        updateFollowBtn(followBtn, is_following);
      } catch (e) { /* ignore */ }

      followBtn.addEventListener('click', async () => {
        const isFollowing = followBtn.getAttribute('data-following') === 'true';
        followBtn.disabled = true;
        try {
          if (isFollowing) {
            await api.sellers.unfollow(sellerId);
            showToast('Unfollowed seller', 'info');
            updateFollowBtn(followBtn, false);
          } else {
            await api.sellers.follow(sellerId);
            showToast('Now following seller! You\'ll be notified of new listings.', 'success');
            updateFollowBtn(followBtn, true);
          }
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          followBtn.disabled = false;
        }
      });
    }

  } catch (err) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 100px 0;">
        <h3 style="color: var(--accent-rose);">Error loading listing</h3>
        <p style="color: var(--text-secondary); margin-top: 8px;">${err.message}</p>
        <a href="index.html" class="nav-btn primary" style="display: inline-block; margin-top: 16px;">Back Home</a>
      </div>
    `;
  }
}

// Carousel slider logic
function initCarousel() {
  const prevBtn = document.getElementById('carousel-prev-btn');
  const nextBtn = document.getElementById('carousel-next-btn');
  const imgs = document.querySelectorAll('.main-carousel-image');
  const thumbs = document.querySelectorAll('.thumbnail-item');

  if (!nextBtn || imgs.length <= 1) return;

  function setIndex(index) {
    currentImageIndex = (index + imgs.length) % imgs.length;
    
    imgs.forEach((img, idx) => {
      img.classList.toggle('active', idx === currentImageIndex);
    });
    
    thumbs.forEach((thumb, idx) => {
      thumb.classList.toggle('active', idx === currentImageIndex);
    });
  }

  prevBtn.addEventListener('click', () => setIndex(currentImageIndex - 1));
  nextBtn.addEventListener('click', () => setIndex(currentImageIndex + 1));

  thumbs.forEach(thumb => {
    thumb.addEventListener('click', () => {
      const idx = parseInt(thumb.getAttribute('data-index'));
      setIndex(idx);
    });
  });
}

// Comments / Chat logic
async function loadComments() {
  const feed = document.getElementById('comments-feed-container');
  if (!feed) return;

  try {
    const comments = await api.comments.list(productId);
    const currentUser = getCurrentUser();

    if (comments.length === 0) {
      feed.innerHTML = `<p style="color: var(--text-muted); text-align: center; margin-top: 40px;">No messages yet. Ask a question about this listing!</p>`;
      return;
    }

    feed.innerHTML = comments.map(c => {
      const profile = c.profiles || { full_name: 'User', avatar_url: '' };
      const isSelf = currentUser && currentUser.id === c.user_id;
      const timeStr = new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const avatar = profile.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80';

      return `
        <div class="chat-bubble-container ${isSelf ? 'self' : ''}">
          <img src="${avatar}" alt="Avatar" class="chat-bubble-avatar">
          <div>
            <div class="chat-bubble">
              ${c.content}
            </div>
            <div class="chat-bubble-meta">
              <span class="chat-bubble-sender">${isSelf ? 'You' : profile.full_name}</span>
              <span>${timeStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Scroll to bottom of chat
    feed.scrollTop = feed.scrollHeight;

  } catch (error) {
    console.error('Failed to load comments:', error);
  }
}

async function postComment() {
  const input = document.getElementById('new-comment-input');
  const btn = document.getElementById('send-comment-btn');
  if (!input || !input.value.trim()) return;

  const content = input.value.trim();
  input.value = '';
  input.disabled = true;
  btn.disabled = true;

  try {
    await api.comments.create(productId, content);
    await loadComments();
  } catch (e) {
    showToast('Failed to post comment: ' + e.message, 'error');
  } finally {
    input.disabled = false;
    btn.disabled = false;
    input.focus();
  }
}

// Reviews & Ratings logic
async function loadReviews() {
  const list = document.getElementById('reviews-list-container');
  const scoreLabel = document.getElementById('rating-avg-score');
  const starRow = document.getElementById('rating-avg-stars');
  const countLabel = document.getElementById('rating-total-count');

  if (!list) return;

  try {
    const reviews = await api.reviews.list(productId);
    const count = reviews.length;

    // Calculate rating aggregates
    let avg = 0.0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    
    if (count > 0) {
      const sum = reviews.reduce((acc, curr) => {
        distribution[curr.rating]++;
        return acc + curr.rating;
      }, 0);
      avg = sum / count;
    }

    // Update aggregate UI labels
    if (scoreLabel) scoreLabel.innerText = avg.toFixed(1);
    if (countLabel) countLabel.innerText = `${count} review${count !== 1 ? 's' : ''}`;
    if (starRow) {
      starRow.innerHTML = getStarRowHtml(avg);
    }

    // Update rating bar widths
    for (let r = 1; r <= 5; r++) {
      const barFill = document.querySelector(`#rating-bars-container .rating-bar-row:nth-child(${6 - r}) .rating-bar-fill`);
      const valLabel = document.getElementById(`bar-${r}-val`);
      if (barFill && valLabel) {
        const pct = count > 0 ? (distribution[r] / count) * 100 : 0;
        barFill.style.width = `${pct}%`;
        valLabel.innerText = distribution[r];
      }
    }

    // Render review list
    if (count === 0) {
      list.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px 0;">No reviews written yet.</p>`;
      return;
    }

    list.innerHTML = reviews.map(r => {
      const profile = r.profiles || { full_name: 'Anonymous', avatar_url: '' };
      const dateStr = new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      const avatar = profile.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80';

      return `
        <div class="review-item">
          <img src="${avatar}" alt="${profile.full_name}" class="review-avatar">
          <div class="review-body">
            <div class="review-header">
              <span class="review-author">${profile.full_name}</span>
              <span class="review-date">${dateStr}</span>
            </div>
            <div class="review-rating-stars">
              ${getStarRowHtml(r.rating)}
            </div>
            <div class="review-comment">${r.comment}</div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Failed to load reviews:', error);
  }
}

// Generate stars HTML helper
function getStarRowHtml(rating) {
  let starsHtml = '';
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.5;

  for (let i = 1; i <= 5; i++) {
    if (i <= fullStars) {
      starsHtml += '<span style="color: #d49a14;">★</span>';
    } else if (i === fullStars + 1 && halfStar) {
      starsHtml += '<span style="color: #d49a14; opacity: 0.85;">★</span>'; // simplification
    } else {
      starsHtml += '<span style="color: var(--text-muted);">★</span>';
    }
  }
  return starsHtml;
}

// Interactive Star Selection setup
function setupStarRatingSelector() {
  const stars = document.querySelectorAll('#star-selector span');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      selectedRating = parseInt(star.getAttribute('data-star'));
      
      stars.forEach(s => {
        const sVal = parseInt(s.getAttribute('data-star'));
        s.classList.toggle('active', sVal <= selectedRating);
      });
    });
  });
}

// Submit a rating/review
async function postReview() {
  const commentInput = document.getElementById('review-comment-input');
  if (selectedRating === 0) {
    showToast('Please select a star rating first!', 'info');
    return;
  }

  const comment = commentInput ? commentInput.value.trim() : '';
  if (!comment) {
    showToast('Please type a brief review comment!', 'info');
    return;
  }

  const submitBtn = document.getElementById('submit-review-btn');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Submitting...';

  try {
    await api.reviews.create(productId, selectedRating, comment);
    showToast('Review submitted successfully!', 'success');
    
    // Clear form
    selectedRating = 0;
    if (commentInput) commentInput.value = '';
    document.querySelectorAll('#star-selector span').forEach(s => s.classList.remove('active'));
    
    // Hide panel (one review per session/user is typical)
    document.getElementById('write-review-panel').style.display = 'none';

    // Reload
    await loadProductDetails();
    await loadReviews();
  } catch (error) {
    showToast('Review submission failed: ' + error.message, 'error');
    submitBtn.disabled = false;
    submitBtn.innerText = 'Submit Review';
  }
}

// ── Follow Button Helper ───────────────────────────────────────────────────
function updateFollowBtn(btn, isFollowing) {
  btn.setAttribute('data-following', isFollowing ? 'true' : 'false');
  const label = document.getElementById('follow-btn-label');
  if (label) label.textContent = isFollowing ? 'Unfollow Seller' : 'Follow Seller';
  btn.style.borderColor = isFollowing ? 'var(--accent-cyan)' : 'var(--glass-border)';
}

// ── Mark Sold to Buyer Modal ──────────────────────────────────────────────
function setupSoldToBuyerModal(prod) {
  const modal = document.getElementById('sold-to-buyer-modal');
  const backdrop = document.getElementById('sold-modal-backdrop');
  const cancelBtn = document.getElementById('sold-modal-cancel');
  const confirmBtn = document.getElementById('sold-modal-confirm');

  if (!modal) return;

  // Intercept the Mark Sold button in the listing area (profile page sets status directly;
  // here on the product page we open the modal first)
  const openModal = () => {
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  };

  const closeModal = () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  };

  backdrop.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  confirmBtn.addEventListener('click', async () => {
    const buyerName = document.getElementById('sold-buyer-name')?.value.trim() || '';
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving...';
    try {
      await api.transactions.recordSale({
        product_id: prod.id,
        buyer_name: buyerName || null,
        sale_price: prod.price,
      });
      showToast('Sale recorded! Listing marked as sold.', 'success');
      closeModal();
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      showToast('Failed to record sale: ' + err.message, 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm Sale';
    }
  });

  // Add a "Mark Sold" button to the product info panel for the seller
  const infoPanel = document.querySelector('.product-info-panel');
  if (infoPanel && prod.status === 'active') {
    const markSoldBtn = document.createElement('button');
    markSoldBtn.id = 'product-page-mark-sold-btn';
    markSoldBtn.className = 'form-submit-btn';
    markSoldBtn.style.cssText = 'margin-top: 12px; background: linear-gradient(135deg, #d97706, #b45309); width: 100%;';
    markSoldBtn.textContent = '🏷️ Mark as Sold';
    markSoldBtn.addEventListener('click', openModal);
    infoPanel.appendChild(markSoldBtn);
  }
}
