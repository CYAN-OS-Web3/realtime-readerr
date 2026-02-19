const fetch = require('node-fetch')
const supa = require('./lib/supabase')

function paypalBase() {
  const mode = (process.env.PAYPAL_MODE || 'sandbox').toLowerCase()
  return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
}

function planIdFromKey(planKey) {
  const map = {
    basic: process.env.PAYPAL_PLAN_ID_BASIC,
    standard: process.env.PAYPAL_PLAN_ID_STANDARD,
    pro: process.env.PAYPAL_PLAN_ID_PRO,
    team: process.env.PAYPAL_PLAN_ID_TEAM,
    executive_pro_annual: process.env.PAYPAL_PLAN_ID_PREMIUM,
    premium: process.env.PAYPAL_PLAN_ID_PREMIUM
  }

  return map[planKey] || process.env.PAYPAL_PLAN_ID_PREMIUM || ''
}

async function paypalToken() {
  const cid = process.env.PAYPAL_CLIENT_ID || ''
  const sec = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET || ''
  const b64 = Buffer.from(`${cid}:${sec}`).toString('base64')
  const r = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${b64}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  })
  const j = await r.json()
  return j.access_token
}

async function createSubscription(req, res) {
  try {
    const userId = req.body.user_id || ''
    const planKey = req.body.plan_key || 'premium'
    const planId = planIdFromKey(planKey)
    const fallbackOrigin = process.env.FRONTEND_URL || 'https://cyan-os-landingpage.vercel.app'
    const returnUrl = req.body.return_url || `${fallbackOrigin}/?checkout=success`
    const cancelUrl = req.body.cancel_url || `${fallbackOrigin}/?checkout=cancel`

    if (!userId || !planId) return res.status(400).json({ error: 'missing_params' })

    const token = await paypalToken()
    const body = {
      plan_id: planId,
      custom_id: `${planKey}:${userId}`,
      application_context: {
        brand_name: 'Cyan Translator',
        user_action: 'SUBSCRIBE_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl
      }
    }

    const r = await fetch(`${paypalBase()}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    const j = await r.json()
    const approve = (j.links || []).find((l) => l.rel === 'approve')

    if (!r.ok || !j.id || !approve || !approve.href) {
      return res.status(400).json({ error: 'paypal_create_failed', details: j })
    }

    res.json({ ok: true, subscription_id: j.id, approval_url: approve.href, plan_key: planKey })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
}

async function getSubscriptionStatus(req, res) {
  try {
    const subscriptionId = req.query.id || ''
    if (!subscriptionId) return res.status(400).json({ error: 'missing_id' })

    const token = await paypalToken()
    const r = await fetch(`${paypalBase()}/v1/billing/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const j = await r.json()
    res.json({ id: j.id, status: j.status })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
}

async function activateSubscription(req, res) {
  try {
    const userId = req.body.user_id || ''
    const subscriptionId = req.body.subscription_id || ''
    const planKey = req.body.plan_key || 'premium'
    if (!userId || !subscriptionId) return res.status(400).json({ error: 'missing_params' })

    const token = await paypalToken()
    const r = await fetch(`${paypalBase()}/v1/billing/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const j = await r.json()
    if (j.status !== 'ACTIVE') return res.status(402).json({ error: 'not_active', status: j.status })

    // Best-effort backend persistence. Frontend remains source of truth for session state.
    try {
      const now = new Date().toISOString()
      const monthStart = `${new Date().toISOString().slice(0, 7)}-01`
      const { data: updated } = await supa.client
        .from('users')
        .update({
          plan: planKey,
          paypal_subscription_id: subscriptionId,
          updated_at: now
        })
        .eq('google_id', userId)
        .select('id')

      if (!updated || updated.length === 0) {
        await supa.client
          .from('users')
          .insert({
            google_id: userId,
            plan: planKey,
            paypal_subscription_id: subscriptionId,
            daily_chars: 0,
            last_reset: monthStart,
            updated_at: now
          })
      }
    } catch (_) {}

    res.json({ ok: true, status: j.status, plan_key: planKey, subscription_id: subscriptionId })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
}

function parseCustomId(customId) {
  const s = String(customId || '')
  const i = s.indexOf(':')
  if (i <= 0) return { planKey: '', userId: '' }
  return { planKey: s.slice(0, i), userId: s.slice(i + 1) }
}

async function webhook(req, res) {
  try {
    const event = req.body || {}
    const type = event.event_type || ''
    if (type === 'BILLING.SUBSCRIPTION.ACTIVATED') {
      const id = event.resource && event.resource.id
      if (id) {
        const token = await paypalToken()
        const r = await fetch(`${paypalBase()}/v1/billing/subscriptions/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const j = await r.json()

        const extracted = parseCustomId(j.custom_id)
        const planKey = extracted.planKey || 'premium'
        const userId = extracted.userId || ''
        if (userId) {
          const now = new Date().toISOString()
          const monthStart = `${new Date().toISOString().slice(0, 7)}-01`
          const { data: updated } = await supa.client
            .from('users')
            .update({ plan: planKey, paypal_subscription_id: id, updated_at: now })
            .eq('google_id', userId)
            .select('id')
          if (!updated || updated.length === 0) {
            await supa.client
              .from('users')
              .insert({ google_id: userId, plan: planKey, paypal_subscription_id: id, daily_chars: 0, last_reset: monthStart, updated_at: now })
          }
        }
      }
    }

    if (type === 'BILLING.SUBSCRIPTION.CANCELLED') {
      const id = event.resource && event.resource.id
      if (id) {
        await supa.client
          .from('users')
          .update({ plan: 'free', paypal_subscription_id: null, updated_at: new Date().toISOString() })
          .eq('paypal_subscription_id', id)
      }
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
}

module.exports = { createSubscription, getSubscriptionStatus, activateSubscription, webhook }
