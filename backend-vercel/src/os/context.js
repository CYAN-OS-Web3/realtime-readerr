const crypto = require('crypto')

function getRequestId(req){
  const existing = (req.headers['x-request-id'] || '').toString().trim()
  if (existing) return existing
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return crypto.randomBytes(16).toString('hex')
}

function getSessionId(req){
  const h = (req.headers['x-session-id'] || '').toString().trim()
  if (h) return h
  const b = req.body || {}
  return (b.session_id || b.device_id || '').toString().trim() || null
}

function getDeviceId(req){
  const b = req.body || {}
  return (b.device_id || '').toString().trim() || null
}

function buildContext(req){
  const b = req.body || {}
  const rapidApiKey = (req.headers['x-rapidapi-key'] || '').toString().trim() || null
  const rapidApiUser = (req.headers['x-rapidapi-user'] || '').toString().trim() || null
  return {
    requestId: getRequestId(req),
    sessionId: getSessionId(req),
    userId: (b.user_id || '').toString().trim() || null,
    deviceId: getDeviceId(req),
    consumer: rapidApiUser ? { source: 'rapidapi', user: rapidApiUser, key: rapidApiKey } : null,
    startMs: Date.now()
  }
}

module.exports = { buildContext }
