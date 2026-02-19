const fetch = require('node-fetch')

const clientId = process.env.PAYPAL_CLIENT_ID || ''
const clientSecret = process.env.PAYPAL_CLIENT_SECRET || ''
const webhookId = process.env.PAYPAL_WEBHOOK_ID || ''
const baseUrl = process.env.NODE_ENV === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'

async function getAccessToken() {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const r = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`PayPal token failed: ${j.error_description}`)
  return j.access_token
}

async function createOrderForVoiceId(userId, deviceId, voiceId, price = '4.99', currency = 'USD') {
  const token = await getAccessToken()
  const payload = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: `${userId}:${deviceId}:${voiceId}`,
      description: `Cyan OS-lite - Save voice ID ${voiceId} for device ${deviceId}`,
      amount: { currency_code: currency, value: price }
    }]
  }
  const r = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `${Date.now()}-${userId}`
    },
    body: JSON.stringify(payload)
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`PayPal create order failed: ${j.message || JSON.stringify(j)}`)
  return j
}

async function captureOrder(orderId) {
  const token = await getAccessToken()
  const r = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`PayPal capture failed: ${j.message || JSON.stringify(j)}`)
  return j
}

function parseWebhookSignature(headers, body) {
  // Simplified: in production, verify with PayPal webhook cert
  return {
    isValid: headers['paypal-auth-algo'] && headers['paypal-transmission-id'] && headers['paypal-cert-id'],
    event: headers['paypal-event-type'],
    body
  }
}

module.exports = {
  createOrderForVoiceId,
  captureOrder,
  parseWebhookSignature
}
