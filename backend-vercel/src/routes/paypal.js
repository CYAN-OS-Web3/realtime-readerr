const paypal = require('../paypal')
const supa = require('../lib/supabase')
const telemetry = require('../os/telemetry')

async function createVoiceIdOrder(req, res) {
  const startMs = Date.now()
  const ctx = req.cyan || { requestId: null, sessionId: null, userId: null, deviceId: null, startMs }
  try {
    const { userId, deviceId, voiceId, price, currency } = req.body
    if (!userId || !deviceId || !voiceId) {
      return res.status(400).json({ error: 'missing userId, deviceId, or voiceId' })
    }
    const order = await paypal.createOrderForVoiceId(userId, deviceId, voiceId, price, currency)
    const approvalUrl = order.links?.find(l => l.rel === 'approve')?.href
    if (!approvalUrl) throw new Error('PayPal approval URL not found')
    await telemetry.logEvent(ctx, 'paypal_voice_order_created', {
      userId,
      deviceId,
      voiceId,
      price,
      currency,
      orderId: order.id,
      total_ms: Date.now() - startMs
    })
    res.json({
      orderId: order.id,
      approvalUrl,
      price,
      currency
    })
  } catch (e) {
    await telemetry.logEvent(ctx, 'paypal_voice_order_error', {
      error: e && e.message ? e.message : 'unknown',
      total_ms: Date.now() - startMs
    })
    res.status(500).json({ error: 'server_error' })
  }
}

async function captureWebhook(req, res) {
  const startMs = Date.now()
  const ctx = req.cyan || { requestId: null, sessionId: null, userId: null, deviceId: null, startMs }
  try {
    const signature = paypal.parseWebhookSignature(req.headers, req.body)
    if (!signature.isValid) {
      return res.status(401).json({ error: 'invalid_webhook_signature' })
    }
    const eventType = signature.event
    const eventBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const purchase = eventBody.purchase_units?.[0]
      const reference = purchase?.reference_id
      if (!reference) throw new Error('Missing reference_id')
      const [userId, deviceId, voiceId] = reference.split(':')
      if (!userId || !deviceId || !voiceId) throw new Error('Invalid reference_id format')
      // Save voiceId to Supabase for this user/device
      await supa.setDeviceVoice(userId, deviceId, voiceId)
      await telemetry.logEvent(ctx, 'paypal_voice_captured', {
        userId,
        deviceId,
        voiceId,
        orderId: eventBody.id,
        total_ms: Date.now() - startMs
      })
    }
    res.status(200).send('OK')
  } catch (e) {
    await telemetry.logEvent(ctx, 'paypal_webhook_error', {
      error: e && e.message ? e.message : 'unknown',
      total_ms: Date.now() - startMs
    })
    res.status(500).json({ error: 'server_error' })
  }
}

module.exports = { createVoiceIdOrder, captureWebhook }
