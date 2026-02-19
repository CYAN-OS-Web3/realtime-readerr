# Cyan OS Subscription Implementation Guide

## 📋 Overview

Implement $699 Premium subscription flow for landing page with:
- "Get Started" button (free trial/basic features)
- "Claim Your Spot" button (premium subscription)
- PayPal payment integration
- Local storage user management
- Frontend-only subscription handling

## 🔧 Backend Endpoints Available

### 1. **Create Subscription**
```
POST /api/payment/subscription/create
Body: { user_id: "user_123" }
Response: { 
  ok: true, 
  subscription_id: "I-BW452GLLEP1G", 
  approval_url: "https://www.paypal.com/webapps/billing/subscriptions?ba_token=..." 
}
```

### 2. **Check Subscription Status**
```
GET /api/payment/subscription/status?id=I-BW452GLLEP1G
Response: { id: "I-BW452GLLEP1G", status: "ACTIVE" }
```

### 3. **Activate Subscription**
```
POST /api/payment/subscription/activate
Body: { user_id: "user_123", subscription_id: "I-BW452GLLEP1G" }
Response: { ok: true }
```

### 4. **Webhook (PayPal → Backend)**
```
POST /api/payment/webhook
Headers: PayPal webhook verification
Body: PayPal subscription events
```

## 🚀 Frontend Implementation

### 1. **Add HTML to Landing Page**
```html
<!-- Subscription Modal -->
<div id="subscription-modal" class="subscription-modal"></div>

<!-- Buttons -->
<button id="get-started-btn" onclick="handleGetStarted()" class="btn btn-primary">
  Get Started
</button>

<button id="claim-spot-btn" onclick="handleClaimSpot()" class="btn btn-premium">
  Claim Your Spot - $699
</button>

<!-- Premium Features (hidden by default) -->
<div id="premium-features" style="display: none;">
  <h2>🎉 Premium Features Unlocked!</h2>
  <!-- Premium content -->
</div>
```

### 2. **Add JavaScript**
```html
<script src="frontend-subscription-handler.js"></script>
```

### 3. **CSS Styling**
```css
.btn-premium {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px 32px;
  font-size: 18px;
  font-weight: bold;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-premium:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
}
```

## 📱 User Flow

### **Get Started Button:**
1. Click → Check if user exists
2. Free user → Show premium upgrade modal
3. Premium user → Redirect to dashboard

### **Claim Your Spot Button:**
1. Click → Create PayPal subscription
2. Redirect to PayPal for approval
3. User approves → Return to site
4. Activate subscription → Unlock premium features

### **PayPal Flow:**
1. Frontend: `POST /api/payment/subscription/create`
2. Backend: Create PayPal subscription
3. Frontend: Redirect to `approval_url`
4. PayPal: User approves subscription
5. PayPal: Redirect back to site with `token`
6. Frontend: `POST /api/payment/subscription/activate`
7. Backend: Update user plan to premium

## 🔐 Environment Variables (Backend)

```env
# PayPal Configuration
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret
PAYPAL_PLAN_ID_PREMIUM=your-paypal-plan-id
PAYPAL_MODE=sandbox  # or live

# Webhook
PAYPAL_WEBHOOK_ID=your-webhook-id
```

## 📊 Data Storage

### **Frontend (localStorage):**
```javascript
{
  id: "user_1234567890_abc123",
  email: null,
  name: null,
  plan: "premium",
  subscription_id: "I-BW452GLLEP1G",
  subscription_active: true,
  created_at: "2024-02-13T..."
}
```

### **Backend (Supabase):**
```sql
users table:
- id (text, primary key)
- email (text)
- name (text)
- plan (text: free/premium)
- paypal_subscription_id (text)
- created_at (timestamp)
- updated_at (timestamp)
```

## 🎯 Premium Features

### **What to unlock:**
- Unlimited translations
- Priority processing
- Voice cloning
- Premium support
- Advanced features

### **UI Updates:**
- Hide "Claim Your Spot" button
- Show premium dashboard
- Display premium badge
- Enable advanced features

## 🔄 Webhook Handling

### **PayPal Events:**
- `BILLING.SUBSCRIPTION.ACTIVATED` → Update user to premium
- `BILLING.SUBSCRIPTION.CANCELLED` → Downgrade to free
- `BILLING.SUBSCRIPTION.SUSPENDED` → Suspend access

### **Backend Processing:**
1. Verify webhook signature
2. Parse subscription events
3. Update user plan in database
4. Frontend checks status periodically

## 🧪 Testing

### **Sandbox Mode:**
1. Use PayPal sandbox credentials
2. Test with sandbox accounts
3. Verify subscription flow
4. Test webhook events

### **Production Checklist:**
- [ ] PayPal live credentials
- [ ] Webhook URL configured
- [ ] SSL certificate
- [ ] Error handling
- [ ] User support flow

## 🚀 Deployment Steps

### 1. **Add to Landing Page:**
```html
<!-- Before closing </body> -->
<script src="frontend-subscription-handler.js"></script>
```

### 2. **Update Buttons:**
```html
<button onclick="handleGetStarted()">Get Started</button>
<button onclick="handleClaimSpot()">Claim Your Spot - $699</button>
```

### 3. **Add Modal:**
```html
<div id="subscription-modal" class="subscription-modal"></div>
```

### 4. **Test Flow:**
1. Click "Claim Your Spot"
2. Complete PayPal flow
3. Verify premium features unlock
4. Test subscription persistence

## 📞 Support

### **User Issues:**
- Subscription not activating → Check webhook status
- Payment failed → Contact PayPal support
- Features not unlocked → Refresh page

### **Admin Tools:**
- Check subscription status via API
- Manual plan updates via admin endpoints
- Webhook event monitoring
