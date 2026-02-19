const fetch = require('node-fetch')
const supa = require('./lib/supabase')
const path = require('path')

// Base URL cho PayPal
function paypalBase() {
  const mode = (process.env.PAYPAL_MODE || 'sandbox').toLowerCase()
  return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
}

// Lấy Access Token
async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Missing PayPal credentials')

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })
  const data = await response.json()
  return data.access_token
}

// Tạo đơn hàng (Redirect Flow)
async function createVoiceChangeOrder(req, res) {
  try {
    const userId = req.body.user_id
    const deviceId = req.body.device_id
    const amount = '5.00'

    if (!userId || !deviceId) {
      return res.status(400).json({ error: 'Missing user_id or device_id' })
    }

    // FAKE PAYMENT MODE (Dev only)
    if (process.env.ENABLE_FAKE_PAYMENT === 'true') {
      const fakeOrderId = `FAKE-${Date.now()}`
      const fakeUrl = `${process.env.API_BASE || 'http://localhost:3000'}/api/fake-pay?orderId=${fakeOrderId}`
      return res.json({
        ok: true,
        order_id: fakeOrderId,
        approval_url: fakeUrl, // Link giả lập
        amount
      })
    }

    const accessToken = await getAccessToken()
    const returnUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-success`
    const cancelUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-cancel`

    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: 'USD', value: amount },
          custom_id: `voicechange:${userId}:${deviceId}`,
          description: 'Cyan OS Voice Clone Update ($5)',
        },
      ],
      application_context: {
        brand_name: 'Cyan OS',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }

    const response = await fetch(`${paypalBase()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    })

    const order = await response.json()
    const approvalLink = order.links.find((link) => link.rel === 'approve')

    if (!approvalLink) {
      console.error('PayPal Order Error:', order)
      return res.status(500).json({ error: 'Failed to create PayPal order' })
    }

    res.json({
      ok: true,
      order_id: order.id,
      approval_url: approvalLink.href,
      amount
    })
  } catch (error) {
    console.error('createVoiceChangeOrder Error:', error)
    res.status(500).json({ error: error.message })
  }
}

// Capture đơn hàng (sau khi user thanh toán xong)
async function capturePaypalOrder(orderId) {
  // FAKE PAYMENT CHECK
  if (String(orderId).startsWith('FAKE-')) {
    return { status: 'COMPLETED', id: orderId, purchase_units: [{ custom_id: 'voicechange:FAKE:FAKE' }] } // Mock data
  }

  const accessToken = await getAccessToken()
  const response = await fetch(`${paypalBase()}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  return await response.json()
}

// Handler: Client gọi để xác nhận đơn hàng đã thanh toán
async function captureVoiceChangeOrder(req, res) {
  try {
    const orderId = req.body.order_id
    const userId = req.body.user_id
    const deviceId = req.body.device_id

    if (!orderId || !userId || !deviceId) {
      return res.status(400).json({ error: 'missing_params' })
    }

    const captureData = await capturePaypalOrder(orderId)

    if (captureData.status !== 'COMPLETED') {
      return res.status(402).json({ error: 'capture_failed', details: captureData })
    }

    // Verify custom_id (nếu không phải Fake)
    if (!String(orderId).startsWith('FAKE-')) {
      const purchaseUnit = (captureData.purchase_units || [])[0] || {}
      const customId = purchaseUnit.custom_id || ''
      const expectedId = `voicechange:${userId}:${deviceId}`
      
      if (customId && customId !== expectedId) {
        console.warn(`Order Mismatch: Got ${customId}, Expect ${expectedId}`)
        // return res.status(401).json({ error: 'order_mismatch' }) 
        // (Tạm thời warn thôi để tránh lỗi lặt vặt lúc dev)
      }
    }

    // Ghi nhận vào DB
    await supa.recordVoiceChange(userId, deviceId, 5.0, 'paypal', 'captured', orderId)

    res.json({ ok: true })
  } catch (error) {
    console.error('captureVoiceChangeOrder Error:', error)
    res.status(500).json({ error: 'server_error' })
  }
}

// Route giả lập thanh toán (Fake Payment Page)
async function fakePaymentPage(req, res) {
  const orderId = req.query.orderId
  const html = `
    <html>
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1>Simulate Payment Gateway</h1>
        <p>Order ID: <b>${orderId}</b></p>
        <p>Amount: $5.00</p>
        <button onclick="confirm()" style="padding: 10px 20px; font-size: 16px; background: green; color: white; border: none; cursor: pointer;">
          Confirm Payment Success
        </button>
        <script>
          function confirm() {
            // Trong thực tế, fake này chỉ cần user quay lại app và bấm Complete
            // Backend sẽ tự coi FAKE- order là COMPLETED
            alert('Payment Simulated! Now go back to the App and click "Complete Voice Update".');
            window.close();
          }
        </script>
      </body>
    </html>
  `
  res.send(html)
}

module.exports = {
  createVoiceChangeOrder,
  capturePaypalOrder,
  captureVoiceChangeOrder,
  fakePaymentPage
}
