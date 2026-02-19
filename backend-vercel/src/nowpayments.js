const fetch = require('node-fetch')
const crypto = require('crypto')
const supa = require('./lib/supabase')

const PLAN_PRICE_USD = {
  basic: 29,
  standard: 59,
  pro: 99,
  team: 299,
  executive_pro_annual: 699,
  premium: 699
}

function apiBase() {
  return 'https://api.nowpayments.io/v1'
}

function getApiKey() {
  return (process.env.NOWPAYMENTS_API_KEY || '').trim()
}

function getIpnSecret() {
  return (process.env.NOWPAYMENTS_IPN_SECRET || '').trim()
}

function getDefaultPayCurrency() {
  return (process.env.NOWPAYMENTS_PAY_CURRENCY || 'usdtbsc').trim().toLowerCase()
}

function hostBase(req) {
  const h = req.headers['x-forwarded-host'] || req.headers.host || ''
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${h}`
}

function planFromKey(planKey) {
  if (planKey === 'premium') return 'executive_pro_annual'
  return planKey
}

function getAdminSecret() {
  const prod = (process.env.ADMIN_SECRET || '').trim()
  const dev = (process.env.ADMIN_SECRET_DEV || '').trim()
  const env = (process.env.NODE_ENV || '').trim().toLowerCase()
  return env === 'development' ? (dev || prod) : prod
}

function isAdmin(req) {
  const s = getAdminSecret()
  const h = (req.headers['x-admin-secret'] || '').toString().trim()
  return Boolean(s && h && s === h)
}

function encodeUser(userId) {
  return Buffer.from(String(userId), 'utf8').toString('base64url')
}

function decodeUser(encoded) {
  try {
    return Buffer.from(String(encoded), 'base64url').toString('utf8')
  } catch (_) {
    return ''
  }
}

function buildOrderId(planKey, userId) {
  const safePlan = String(planKey || 'executive_pro_annual').replace(/[^a-z0-9_]/gi, '_').toLowerCase()
  return `crypto~${safePlan}~${encodeUser(userId)}~${Date.now()}`
}

function extractFromOrder(orderId) {
  const parts = String(orderId || '').split('~')
  if (parts.length !== 4 || parts[0] !== 'crypto') return { planKey: '', userId: '' }
  return { planKey: parts[1], userId: decodeUser(parts[2]) }
}

function resolvePaymentUrl(payment) {
  const directUrl = payment?.payment_url || payment?.invoice_url || payment?.url
  if (directUrl) return String(directUrl)
  const invoiceId = payment?.invoice_id || payment?.iid
  if (invoiceId) return `https://nowpayments.io/payment/?iid=${encodeURIComponent(String(invoiceId))}`
  return ''
}

async function createInvoice(amount, orderId, description, ipnUrl, successUrl, cancelUrl, payCurrency) {
  const body = {
    price_amount: Number(amount),
    price_currency: 'USD',
    order_id: String(orderId),
    order_description: description,
    ipn_callback_url: ipnUrl,
    success_url: successUrl,
    cancel_url: cancelUrl,
    is_fixed_rate: true,
    pay_currency: String(payCurrency || getDefaultPayCurrency()).toLowerCase()
  }

  const r = await fetch(`${apiBase()}/invoice`, {
    method: 'POST',
    headers: { 'x-api-key': getApiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const text = await r.text()
  let j = null
  try {
    j = JSON.parse(text)
  } catch (_) {
    j = { raw: text }
  }
  return { ok: r.ok, status: r.status, data: j }
}

async function createPaymentFromInvoice(invoiceId, payCurrency, purchaseId, orderDescription, customerEmail) {
  const body = {
    iid: Number(invoiceId),
    pay_currency: String(payCurrency || getDefaultPayCurrency()).toLowerCase()
  }
  if (purchaseId) body.purchase_id = Number(purchaseId)
  if (orderDescription) body.order_description = String(orderDescription)
  if (customerEmail) body.customer_email = String(customerEmail)

  const r = await fetch(`${apiBase()}/invoice-payment`, {
    method: 'POST',
    headers: { 'x-api-key': getApiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const text = await r.text()
  let j = null
  try {
    j = JSON.parse(text)
  } catch (_) {
    j = { raw: text }
  }
  return { ok: r.ok, status: r.status, data: j }
}

function normalizePaymentList(payload) {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload.payments)) return payload.payments
  if (Array.isArray(payload.results)) return payload.results
  return []
}

async function listRecentPayments() {
  const url = `${apiBase()}/payment?limit=100&page=0&sortBy=created_at&orderBy=desc`
  const r = await fetch(url, {
    headers: { 'x-api-key': getApiKey(), 'Content-Type': 'application/json' }
  })
  const text = await r.text()
  let j = null
  try {
    j = JSON.parse(text)
  } catch (_) {
    j = { raw: text }
  }
  return { ok: r.ok, status: r.status, data: j }
}

async function createPayment(amount, orderId, description, ipnUrl, successUrl, cancelUrl, payCurrency) {
  const body = {
    price_amount: Number(amount),
    price_currency: 'USD',
    pay_currency: String(payCurrency || getDefaultPayCurrency()).toLowerCase(),
    order_id: String(orderId),
    order_description: description,
    ipn_callback_url: ipnUrl,
    success_url: successUrl,
    cancel_url: cancelUrl
  }

  const r = await fetch(`${apiBase()}/payment`, {
    method: 'POST',
    headers: { 'x-api-key': getApiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const text = await r.text()
  let j = null
  try {
    j = JSON.parse(text)
  } catch (_) {
    j = { raw: text }
  }

  try {
    if (r.ok && j && j.payment_id && !j.invoice_id) {
      const details = await getPaymentById(j.payment_id)
      if (details.ok && details.data && details.data.invoice_id) {
        j.invoice_id = details.data.invoice_id
      }
    }
  } catch (_) {}

  return { ok: r.ok, status: r.status, data: j }
}

async function getPaymentById(paymentId) {
  const r = await fetch(`${apiBase()}/payment/${encodeURIComponent(String(paymentId || ''))}`, {
    headers: { 'x-api-key': getApiKey(), 'Content-Type': 'application/json' }
  })
  const text = await r.text()
  let j = null
  try {
    j = JSON.parse(text)
  } catch (_) {
    j = { raw: text }
  }
  return { ok: r.ok, status: r.status, data: j }
}

function isPaidStatus(status) {
  const s = String(status || '').toLowerCase()
  return s === 'finished' || s === 'confirmed'
}

async function applyPlanForUser(userId, planKey) {
  if (!userId || !planKey) return
  try {
    const monthStart = `${new Date().toISOString().slice(0, 7)}-01`
    const { data: updated } = await supa.client
      .from('users')
      .update({
        plan: planKey
      })
      .eq('google_id', userId)
      .select('id')

    if (!updated || updated.length === 0) {
      await supa.client
        .from('users')
        .insert({
          google_id: userId,
          plan: planKey,
          daily_chars: 0,
          last_reset: monthStart
        })
    }
  } catch (_) {}
}

async function createVoiceChangePayment(req, res) {
  try {
    const userId = req.body.user_id || ''
    const deviceId = req.body.device_id || ''
    const amount = Number(req.body.amount || 5.0)
    if (!getApiKey()) return res.status(501).json({ error: 'nowpayments_not_configured' })
    if (!userId || !deviceId) return res.status(400).json({ error: 'missing_params' })

    const plan = await supa.getUserPlan(userId)
    if (plan !== 'premium' && plan !== 'executive_pro_annual') return res.status(403).json({ error: 'not_allowed' })

    const base = hostBase(req)
    const orderId = `voice_${userId.slice(0, 8)}_${deviceId.slice(0, 12)}_${Date.now()}`
    const response = await createPayment(
      amount,
      orderId,
      'Voice change fee',
      `${base}/api/payment/now/webhook`,
      `${base}/?crypto=success`,
      `${base}/?crypto=cancel`,
      req.body.pay_currency
    )

    const paymentUrl = resolvePaymentUrl(response.data)
    if (!response.ok || !response.data || !response.data.payment_id) {
      return res.status(400).json({ error: 'nowpayments_create_failed', details: response.data })
    }

    await supa.recordVoiceChange(userId, deviceId, amount, 'nowpayments', 'pending', orderId)

    res.json({
      ok: true,
      payment_id: response.data.payment_id,
      invoice_id: response.data.invoice_id,
      payment_url: paymentUrl,
      order_id: orderId,
      pay_currency: response.data.pay_currency,
      pay_address: response.data.pay_address,
      pay_amount: response.data.pay_amount,
      amount
    })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
}

async function createPlanPayment(req, res) {
  try {
    const userId = req.body.user_id || ''
    const requestedPlan = req.body.plan_key || 'executive_pro_annual'
    const planKey = planFromKey(requestedPlan)
    const amount = Number(req.body.amount || PLAN_PRICE_USD[planKey] || PLAN_PRICE_USD.executive_pro_annual)

    if (!getApiKey()) return res.status(501).json({ error: 'nowpayments_not_configured' })
    if (!userId || !planKey || !PLAN_PRICE_USD[planKey]) return res.status(400).json({ error: 'missing_params' })

    const base = process.env.FRONTEND_URL || hostBase(req)
    const returnUrl = req.body.return_url || `${base}/?crypto=success`
    const cancelUrl = req.body.cancel_url || `${base}/?crypto=cancel`
    const orderId = buildOrderId(planKey, userId)

    const preferredCurrency = String(req.body.pay_currency || getDefaultPayCurrency()).toLowerCase()

    const hosted = await createInvoice(
      amount,
      orderId,
      `Cyan plan ${planKey}`,
      `${hostBase(req)}/api/payment/now/webhook`,
      returnUrl,
      cancelUrl,
      preferredCurrency
    )

    const hostedUrl = resolvePaymentUrl(hosted.data)
    if (hosted.ok && hostedUrl) {
      const invoiceId = hosted.data?.id || hosted.data?.invoice_id || hosted.data?.iid
      let invoicePayment = null
      try {
        if (invoiceId) {
          invoicePayment = await createPaymentFromInvoice(
            invoiceId,
            preferredCurrency,
            hosted.data?.purchase_id || hosted.data?.purchaseId,
            `Cyan plan ${planKey}`,
            req.body.customer_email
          )
        }
      } catch (_) {
        invoicePayment = null
      }

      return res.json({
        ok: true,
        hosted: true,
        invoice_id: invoiceId,
        payment_id: invoicePayment?.data?.payment_id || '',
        payment_url: hostedUrl,
        order_id: orderId,
        pay_currency: preferredCurrency,
        plan_key: planKey,
        amount
      })
    }

    const response = await createPayment(
      amount,
      orderId,
      `Cyan plan ${planKey}`,
      `${hostBase(req)}/api/payment/now/webhook`,
      returnUrl,
      cancelUrl,
      preferredCurrency
    )

    const paymentUrl = resolvePaymentUrl(response.data)
    if (!response.ok || !response.data || !response.data.payment_id) {
      return res.status(400).json({ error: 'nowpayments_create_failed', details: response.data, hosted_details: hosted.data })
    }

    res.json({
      ok: true,
      hosted: false,
      payment_id: response.data.payment_id,
      invoice_id: response.data.invoice_id,
      payment_url: paymentUrl,
      order_id: orderId,
      pay_currency: response.data.pay_currency,
      pay_address: response.data.pay_address,
      pay_amount: response.data.pay_amount,
      plan_key: planKey,
      amount
    })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
}

async function activatePlanPaymentByOrder(req, res) {
  try {
    const userId = req.body.user_id || ''
    const fallbackPlan = planFromKey(req.body.plan_key || 'executive_pro_annual')
    const orderId = req.body.order_id || ''

    if (!getApiKey()) return res.status(501).json({ error: 'nowpayments_not_configured' })
    if (!userId || !orderId) return res.status(400).json({ error: 'missing_params' })

    const response = await listRecentPayments()
    if (!response.ok) {
      return res.status(400).json({ error: 'nowpayments_lookup_failed', details: response.data })
    }

    const payments = normalizePaymentList(response.data)
    const related = payments.filter((p) => String(p.order_id || '') === String(orderId))
    const paid = related.find((p) => isPaidStatus(p.payment_status))
    if (!paid) {
      return res.status(202).json({ ok: false, error: 'not_paid_yet' })
    }

    const extracted = extractFromOrder(paid.order_id || orderId)
    const planKey = extracted.planKey || fallbackPlan
    const orderUserId = extracted.userId || userId
    if (orderUserId !== userId) return res.status(403).json({ error: 'order_user_mismatch' })

    await applyPlanForUser(userId, planKey)
    res.json({ ok: true, plan_key: planKey, payment_id: paid.payment_id, status: paid.payment_status })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
}

async function adminForceActivatePlan(req, res) {
  try {
    if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' })

    const requestedPlan = req.body.plan_key || req.body.plan || 'executive_pro_annual'
    const fallbackPlan = planFromKey(requestedPlan)
    const userId = req.body.user_id || req.body.userId || ''
    const orderId = req.body.order_id || req.body.orderId || ''

    let effectiveUserId = userId
    let effectivePlanKey = fallbackPlan

    if (orderId && String(orderId).startsWith('crypto~')) {
      const extracted = extractFromOrder(orderId)
      if (extracted.userId) effectiveUserId = extracted.userId
      if (extracted.planKey) effectivePlanKey = extracted.planKey
    }

    if (!effectiveUserId || !effectivePlanKey) return res.status(400).json({ error: 'missing_params' })

    await applyPlanForUser(effectiveUserId, effectivePlanKey)
    res.json({ ok: true, user_id: effectiveUserId, plan_key: effectivePlanKey })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
}

async function createPremiumPayment(req, res) {
  req.body = { ...req.body, plan_key: req.body.plan_key || 'executive_pro_annual' }
  return createPlanPayment(req, res)
}

async function activatePlanPayment(req, res) {
  try {
    const userId = req.body.user_id || ''
    const paymentId = req.body.payment_id || ''
    const fallbackPlan = planFromKey(req.body.plan_key || 'executive_pro_annual')
    const orderId = req.body.order_id || ''

    if (!getApiKey()) return res.status(501).json({ error: 'nowpayments_not_configured' })
    if (!userId || !paymentId) return res.status(400).json({ error: 'missing_params' })

    const response = await getPaymentById(paymentId)
    if (!response.ok || !response.data) {
      return res.status(400).json({ error: 'nowpayments_lookup_failed', details: response.data })
    }

    const status = String(response.data.payment_status || '').toLowerCase()
    if (!isPaidStatus(status)) {
      return res.status(202).json({ ok: false, error: 'not_paid_yet', status })
    }

    const extracted = extractFromOrder(response.data.order_id || orderId)
    const planKey = extracted.planKey || fallbackPlan
    const orderUserId = extracted.userId || userId

    if (orderUserId !== userId) return res.status(403).json({ error: 'order_user_mismatch' })

    await applyPlanForUser(userId, planKey)
    res.json({ ok: true, plan_key: planKey, payment_id: paymentId, status })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
}

function verifyIpn(req) {
  const secret = getIpnSecret()
  if (!secret) return true
  const sig = req.headers['x-nowpayments-sig'] || req.headers['X-NOWPayments-Sig']
  if (!sig) return false

  const bodyObj = req.body && typeof req.body === 'object' ? req.body : {}
  const sorted = {}
  for (const k of Object.keys(bodyObj).sort()) sorted[k] = bodyObj[k]

  const body = JSON.stringify(sorted)
  const expected = crypto.createHmac('sha512', secret).update(body).digest('hex')
  return String(expected).toLowerCase() === String(sig).toLowerCase()
}

async function recordIpn(ev, sig) {
  try {
    const orderId = ev.order_id || ev.orderid || ''
    const paymentId = ev.payment_id || ev.paymentid || ''
    const status = ev.payment_status || ev.paymentstatus || ''
    await supa.client
      .from('nowpayments_ipn_logs')
      .insert({
        order_id: orderId ? String(orderId) : null,
        payment_id: paymentId ? String(paymentId) : null,
        payment_status: status ? String(status) : null,
        sig: sig ? String(sig) : null,
        raw: ev || {}
      })
  } catch (_) {}
}

async function ipn(req, res) {
  try {
    if (!verifyIpn(req)) return res.status(401).json({ error: 'invalid_signature' })
    const ev = req.body || {}
    const sig = req.headers['x-nowpayments-sig'] || req.headers['X-NOWPayments-Sig'] || ''
    await recordIpn(ev, sig)
    const status = String(ev.payment_status || '').toLowerCase()
    const orderId = ev.order_id || ''
    if (!orderId) return res.json({ ok: true })

    if (isPaidStatus(status)) {
      if (orderId.startsWith('crypto~')) {
        const { planKey, userId } = extractFromOrder(orderId)
        if (planKey && userId) await applyPlanForUser(userId, planKey)
      } else if (orderId.startsWith('voice_')) {
        await supa.client.from('voice_changes').update({ status: 'captured' }).eq('order_id', orderId)
      }
    }

    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
}

module.exports = {
  createVoiceChangePayment,
  createPremiumPayment,
  createPlanPayment,
  activatePlanPayment,
  activatePlanPaymentByOrder,
  adminForceActivatePlan,
  ipn
}
