// Frontend Subscription Handler for Cyan OS Landing Page
// Handle $699 Premium subscription flow

const BACKEND_URL = 'https://translator-backend-pi.vercel.app';

// User management (localStorage)
function getCurrentUser() {
  const userStr = localStorage.getItem('cyan_user');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function setUser(userData) {
  localStorage.setItem('cyan_user', JSON.stringify(userData));
}

function clearUser() {
  localStorage.removeItem('cyan_user');
}

// Generate unique user ID for anonymous users
function generateUserId() {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Get or create user
function getOrCreateUser() {
  let user = getCurrentUser();
  
  if (!user) {
    user = {
      id: generateUserId(),
      email: null,
      name: null,
      plan: 'free',
      created_at: new Date().toISOString()
    };
    setUser(user);
  }
  
  return user;
}

// Subscription functions
async function createPremiumSubscription() {
  const user = getOrCreateUser();
  
  try {
    showLoading('Creating subscription...');
    
    // Create subscription on backend
    const response = await fetch(`${BACKEND_URL}/api/payment/subscription/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: user.id
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to create subscription');
    }
    
    // Store subscription info
    user.subscription_id = data.subscription_id;
    user.approval_url = data.approval_url;
    setUser(user);
    
    // Redirect to PayPal for approval
    window.location.href = data.approval_url;
    
  } catch (error) {
    console.error('Subscription creation failed:', error);
    showError('Failed to create subscription: ' + error.message);
  }
}

// Check subscription status
async function checkSubscriptionStatus() {
  const user = getCurrentUser();
  
  if (!user || !user.subscription_id) {
    return { status: 'none' };
  }
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/payment/subscription/status?id=${user.subscription_id}`);
    
    if (!response.ok) {
      throw new Error('Failed to check status');
    }
    
    const data = await response.json();
    return data;
    
  } catch (error) {
    console.error('Status check failed:', error);
    return { status: 'error', error: error.message };
  }
}

// Activate subscription (after PayPal approval)
async function activateSubscription() {
  const user = getCurrentUser();
  
  if (!user || !user.subscription_id) {
    showError('No subscription found');
    return;
  }
  
  try {
    showLoading('Activating subscription...');
    
    const response = await fetch(`${BACKEND_URL}/api/payment/subscription/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: user.id,
        subscription_id: user.subscription_id
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to activate subscription');
    }
    
    // Update user plan
    user.plan = 'premium';
    user.subscription_active = true;
    setUser(user);
    
    showSuccess('Subscription activated successfully!');
    
    // Redirect to dashboard or premium features
    setTimeout(() => {
      window.location.href = '/premium-dashboard';
    }, 2000);
    
  } catch (error) {
    console.error('Activation failed:', error);
    showError('Failed to activate subscription: ' + error.message);
  }
}

// Handle PayPal return
async function handlePayPalReturn() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token'); // PayPal subscription token
  const ba_token = urlParams.get('ba_token'); // Billing agreement token
  
  if (token || ba_token) {
    // User returned from PayPal, activate subscription
    await activateSubscription();
  }
}

// UI Functions
function showLoading(message = 'Processing...') {
  const modal = document.getElementById('subscription-modal');
  if (modal) {
    modal.innerHTML = `
      <div class="modal-content">
        <div class="loading-spinner"></div>
        <h3>${message}</h3>
        <p>Please wait while we process your request...</p>
      </div>
    `;
    modal.style.display = 'flex';
  }
}

function showSuccess(message) {
  const modal = document.getElementById('subscription-modal');
  if (modal) {
    modal.innerHTML = `
      <div class="modal-content success">
        <div class="success-icon">✓</div>
        <h3>Success!</h3>
        <p>${message}</p>
        <button onclick="closeModal()" class="btn btn-primary">Continue</button>
      </div>
    `;
    modal.style.display = 'flex';
  }
}

function showError(message) {
  const modal = document.getElementById('subscription-modal');
  if (modal) {
    modal.innerHTML = `
      <div class="modal-content error">
        <div class="error-icon">✕</div>
        <h3>Error</h3>
        <p>${message}</p>
        <button onclick="closeModal()" class="btn btn-secondary">Close</button>
      </div>
    `;
    modal.style.display = 'flex';
  }
}

function closeModal() {
  const modal = document.getElementById('subscription-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Update UI based on subscription status
function updateSubscriptionUI() {
  const user = getCurrentUser();
  const getStartedBtn = document.getElementById('get-started-btn');
  const claimSpotBtn = document.getElementById('claim-spot-btn');
  const premiumFeatures = document.getElementById('premium-features');
  
  if (user && user.plan === 'premium' && user.subscription_active) {
    // User has premium subscription
    if (getStartedBtn) getStartedBtn.style.display = 'none';
    if (claimSpotBtn) claimSpotBtn.style.display = 'none';
    if (premiumFeatures) premiumFeatures.style.display = 'block';
  } else {
    // User needs to subscribe
    if (getStartedBtn) getStartedBtn.style.display = 'block';
    if (claimSpotBtn) claimSpotBtn.style.display = 'block';
    if (premiumFeatures) premiumFeatures.style.display = 'none';
  }
}

// Initialize subscription flow
function initSubscriptionFlow() {
  // Check if user returned from PayPal
  handlePayPalReturn();
  
  // Update UI
  updateSubscriptionUI();
  
  // Periodically check subscription status
  setInterval(async () => {
    const status = await checkSubscriptionStatus();
    const user = getCurrentUser();
    
    if (user && status.status === 'ACTIVE' && user.plan !== 'premium') {
      // Subscription was activated externally (webhook)
      user.plan = 'premium';
      user.subscription_active = true;
      setUser(user);
      updateSubscriptionUI();
    }
  }, 30000); // Check every 30 seconds
}

// Button event handlers
function handleGetStarted() {
  // For "Get Started" - could be free trial or basic features
  const user = getOrCreateUser();
  
  if (user.plan === 'free') {
    // Show premium upgrade prompt
    showPremiumUpgradeModal();
  } else {
    // Redirect to dashboard
    window.location.href = '/dashboard';
  }
}

function handleClaimSpot() {
  // For "Claim Your Spot" - direct to premium subscription
  createPremiumSubscription();
}

function showPremiumUpgradeModal() {
  const modal = document.getElementById('subscription-modal');
  if (modal) {
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Upgrade to Premium</h2>
        <div class="premium-features-list">
          <div class="feature">
            <div class="feature-icon">🎯</div>
            <div class="feature-text">
              <h4>Unlimited Translations</h4>
              <p>No more limits on translation volume</p>
            </div>
          </div>
          <div class="feature">
            <div class="feature-icon">🚀</div>
            <div class="feature-text">
              <h4>Priority Processing</h4>
              <p>Faster translation speeds</p>
            </div>
          </div>
          <div class="feature">
            <div class="feature-icon">🎤</div>
            <div class="feature-text">
              <h4>Voice Cloning</h4>
              <p>Create custom AI voices</p>
            </div>
          </div>
          <div class="feature">
            <div class="feature-icon">💎</div>
            <div class="feature-text">
              <h4>Premium Support</h4>
              <p>24/7 customer support</p>
            </div>
          </div>
        </div>
        <div class="pricing">
          <div class="price-tag">$699<span>/month</span></div>
          <p>Limited time offer - Claim your spot!</p>
        </div>
        <div class="modal-actions">
          <button onclick="closeModal()" class="btn btn-secondary">Maybe Later</button>
          <button onclick="createPremiumSubscription()" class="btn btn-primary">Upgrade Now</button>
        </div>
      </div>
    `;
    modal.style.display = 'flex';
  }
}

// CSS for subscription modals
const subscriptionStyles = `
<style>
.subscription-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: none;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  text-align: center;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #4285f4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

.success-icon {
  font-size: 48px;
  color: #4caf50;
  margin-bottom: 1rem;
}

.error-icon {
  font-size: 48px;
  color: #f44336;
  margin-bottom: 1rem;
}

.premium-features-list {
  margin: 2rem 0;
  text-align: left;
}

.feature {
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
}

.feature-icon {
  font-size: 24px;
  margin-right: 1rem;
}

.feature-text h4 {
  margin: 0 0 0.5rem 0;
  color: #333;
}

.feature-text p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.pricing {
  margin: 2rem 0;
}

.price-tag {
  font-size: 36px;
  font-weight: bold;
  color: #4285f4;
}

.price-tag span {
  font-size: 18px;
  color: #666;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 2rem;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary {
  background: #4285f4;
  color: white;
}

.btn-primary:hover {
  background: #3367d6;
}

.btn-secondary {
  background: #f8f9fa;
  color: #333;
  border: 1px solid #ddd;
}

.btn-secondary:hover {
  background: #e9ecef;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
`;

// Add styles to page
document.head.insertAdjacentHTML('beforeend', subscriptionStyles);

// Export functions for global access
window.handleGetStarted = handleGetStarted;
window.handleClaimSpot = handleClaimSpot;
window.createPremiumSubscription = createPremiumSubscription;
window.checkSubscriptionStatus = checkSubscriptionStatus;
window.activateSubscription = activateSubscription;
window.closeModal = closeModal;

// Initialize on page load
document.addEventListener('DOMContentLoaded', initSubscriptionFlow);
