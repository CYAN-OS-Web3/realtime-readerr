const crypto = require('crypto')
const fetch = require('node-fetch')

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function b64urlJson(obj) {
  return b64url(JSON.stringify(obj))
}

function getAuthSecret() {
  return (process.env.CYAN_AUTH_SECRET || '').toString().trim()
}

function signToken(payload) {
  const secret = getAuthSecret()
  if (!secret) return null
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerB64 = b64urlJson(header)
  const payloadB64 = b64urlJson(payload)
  const data = `${headerB64}.${payloadB64}`
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64')
  const sigB64 = sig.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${data}.${sigB64}`
}

function verifyToken(token) {
  const secret = getAuthSecret()
  if (!secret) return null
  const t = (token || '').toString().trim()
  const parts = t.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  const data = `${headerB64}.${payloadB64}`
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64')
  const expectedB64 = expected.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  if (expectedB64 !== sigB64) return null
  let payload = null
  try {
    payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch (_) {
    return null
  }
  const exp = Number(payload && payload.exp ? payload.exp : 0)
  if (exp && Date.now() / 1000 > exp) return null
  return payload
}

function getTokenFromRequest(req) {
  const h = (req.headers['x-cyan-token'] || '').toString().trim()
  if (h) return h
  const a = (req.headers['authorization'] || '').toString().trim()
  if (a.toLowerCase().startsWith('bearer ')) return a.slice(7).trim()
  return ''
}

function getAuthUserId(req) {
  const tok = getTokenFromRequest(req)
  if (!tok) return null
  const payload = verifyToken(tok)
  if (!payload || !payload.sub) return null
  return String(payload.sub)
}

async function exchangeGoogleToken(accessToken) {
  const token = (accessToken || '').toString().trim()
  if (!token) return null
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!r.ok) return null
    const j = await r.json()
    if (!j || !j.id) return null
    return j
  } catch (_) {
    return null
  }
}

async function exchange(req, res) {
  try {
    const authSecret = getAuthSecret()
    if (!authSecret) return res.status(501).json({ error: 'auth_not_configured' })
    const accessToken = (req.body && req.body.access_token) || (req.headers['x-google-access-token'] || '')
    const profile = await exchangeGoogleToken(accessToken)
    if (!profile) return res.status(401).json({ error: 'invalid_google_token' })
    const userId = String(profile.id)
    const exp = Math.floor(Date.now() / 1000) + 60 * 30
    const token = signToken({ sub: userId, exp })
    if (!token) return res.status(500).json({ error: 'token_sign_failed' })
    res.json({ ok: true, user_id: userId, token, exp })
  } catch (_) {
    res.status(500).json({ error: 'server_error' })
  }
}

module.exports = { getAuthUserId, exchange }
