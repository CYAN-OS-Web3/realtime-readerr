const express = require('express')
const cors = require('cors')
const multer = require('multer')
const ttsRoutes = require('../src/routes/tts')
const sttRoutes = require('../src/routes/stt')
const debugRoutes = require('../src/routes/debug')
const user = require('../src/user')
const payment = require('../src/payment')
const voice = require('../src/voice')
const subscription = require('../src/subscription')
const nowpay = require('../src/nowpayments')
const admin = require('../src/admin')
const { buildContext } = require('../src/os/context')
const osTts = require('../src/os/ttsRouter')
const { buildOpenApiSpec } = require('../src/os/openapi')
const paypalRoutes = require('../src/routes/paypal')
const oceanRoutes = require('../src/routes/ocean')
const auth = require('../src/auth')

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '25mb' }))

app.use((req, res, next) => {
  req.cyan = buildContext(req)
  res.set('x-request-id', req.cyan.requestId)
  res.set('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-rapidapi-proxy-secret, x-rapidapi-host, x-rapidapi-key')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

const rapidApiProxySecret = (process.env.RAPIDAPI_PROXY_SECRET || '').toString().trim()
const rapidApiOnly = ((process.env.RAPIDAPI_ONLY || '').toString().trim().toLowerCase() === 'true')

app.use((req, res, next) => {
  if (!rapidApiOnly) return next()
  const p = req.path || ''
  if (p === '/api/health' || p === '/health') return next()
  if (p === '/api/_prewarm') return next()
  if (p === '/api/openapi.json' || p === '/api/docs') return next()
  if (p === '/api/payment/now/webhook' || p === '/payment/now/webhook') return next()
  if (p.startsWith('/api/payment/now/') || p.startsWith('/payment/now/')) return next()
  if (p === '/api/payment/webhook' || p === '/payment/webhook') return next()
  if (p.startsWith('/api/payment/subscription/') || p.startsWith('/payment/subscription/')) return next()
  if (p === '/api/paypal/webhook' || p === '/paypal/webhook') return next()
  if (p.startsWith('/api/ocean/') || p.startsWith('/ocean/')) return next()

  if (!rapidApiProxySecret) return res.status(503).json({ error: 'rapidapi_proxy_secret_missing' })

  const s = (req.headers['x-rapidapi-proxy-secret'] || '').toString().trim()
  if (s && s === rapidApiProxySecret) return next()
  return res.status(401).json({ error: 'unauthorized' })
})

const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } })
app.post('/api/tts/speak', ttsRoutes.speak)
app.post('/api/tts/clone-and-speak', upload.single('sample'), ttsRoutes.cloneAndSpeak)
app.post('/api/tts/clone-and-stream', upload.single('sample'), ttsRoutes.cloneAndStream)
app.post('/api/tts/speak-chunked', ttsRoutes.speakChunked)
app.post('/api/tts/speak-stream', ttsRoutes.speakStream)
app.post('/api/tts/speak-pcm-stream', ttsRoutes.speakPcmStream)

app.post('/api/ocean/tts/speak', oceanRoutes.speak)
app.post('/api/ocean/tts/clone-and-speak', upload.single('sample'), oceanRoutes.cloneAndSpeak)
app.post('/api/ocean/tts/clone-and-stream', upload.single('sample'), oceanRoutes.cloneAndStream)
app.post('/api/ocean/tts/speak-chunked', oceanRoutes.speakChunked)

// Aliases without /api prefix to support Vercel function mount patterns
app.post('/tts/speak', ttsRoutes.speak)
app.post('/tts/clone-and-speak', upload.single('sample'), ttsRoutes.cloneAndSpeak)
app.post('/tts/clone-and-stream', upload.single('sample'), ttsRoutes.cloneAndStream)
app.post('/tts/speak-chunked', ttsRoutes.speakChunked)
app.post('/tts/speak-stream', ttsRoutes.speakStream)
app.post('/tts/speak-pcm-stream', ttsRoutes.speakPcmStream)

app.post('/ocean/tts/speak', oceanRoutes.speak)
app.post('/ocean/tts/clone-and-speak', upload.single('sample'), oceanRoutes.cloneAndSpeak)
app.post('/ocean/tts/clone-and-stream', upload.single('sample'), oceanRoutes.cloneAndStream)
app.post('/ocean/tts/speak-chunked', oceanRoutes.speakChunked)

app.get('/api/user/quota', user.getQuota)
app.get('/api/plans', user.getPlans)
app.get('/api/user/history', user.getHistory)
app.get('/user/quota', user.getQuota)
app.get('/plans', user.getPlans)
app.get('/user/history', user.getHistory)
app.post('/api/payment/voice-change/create', payment.createVoiceChangeOrder)
app.post('/api/voice/assign', upload.single('sample'), voice.assignVoice)
app.post('/api/voice/update', upload.single('sample'), voice.updateVoice)
app.post('/api/voice/update/complete', upload.single('sample'), voice.completeVoiceUpdate)
app.post('/api/payment/voice-change/capture', payment.captureVoiceChangeOrder)
app.post('/api/fake-pay', payment.fakePaymentPage) // Add fake payment route

// STT (Speech-to-Text) endpoints
app.post('/api/stt/recognize', sttRoutes.recognizeSpeech)
app.post('/api/stt/stream', sttRoutes.streamSpeech)

// Debug endpoints
app.get('/api/debug/env', debugRoutes.debugEnv)

// Test endpoint for debugging
app.get('/api/test', require('./test'))
app.get('/test', require('./test'))

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.get('/health', (req, res) => res.json({ ok: true }))

app.get('/api/meta', (req, res) => {
  res.json({
    ok: true,
    vercel_git_commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    git_commit: process.env.GIT_COMMIT || null,
    allow_free_voice_changes: ((process.env.ALLOW_FREE_VOICE_CHANGES || '').toString().trim().toLowerCase() === 'true'),
  })
})

app.post('/api/auth/exchange', auth.exchange)
app.post('/auth/exchange', auth.exchange)

app.get('/api/os/status', (req, res) => {
  res.json({ ok: true, providers: osTts.status() })
})
app.get('/os/status', (req, res) => {
  res.json({ ok: true, providers: osTts.status() })
})

app.get('/api/openapi.json', (req, res) => {
  const forwardedHost = (req.headers['x-forwarded-host'] || '').toString().trim()
  const baseUrl = forwardedHost ? `https://${forwardedHost}` : null
  res.json(buildOpenApiSpec(baseUrl))
})

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Global error:', err)
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'file_upload_error', details: err.message })
  }
  res.status(500).json({ error: 'internal_server_error', details: err.message || 'unknown' })
})

app.get('/api/docs', (req, res) => {
  const specUrl = '/api/openapi.json'
  res.set('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Cyan API Docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>window.ui=SwaggerUIBundle({url:${JSON.stringify(specUrl)},dom_id:'#swagger-ui',persistAuthorization:true,displayRequestDuration:true});</script></body></html>`)
})

app.get('/docs', (req, res) => res.redirect('/api/docs'))
app.get('/openapi.json', (req, res) => res.redirect('/api/openapi.json'))
app.get('/', (req, res) => res.redirect('/api/docs'))

// Prewarm route: triggers light initializations to reduce cold-start latency
app.get('/api/_prewarm', async (req, res) => {
  try {
    // Touch Google TTS only if configured with API key
    try {
      if ((process.env.GOOGLE_API_KEY || '').trim()){
        const g = require('../src/lib/google')
        await g.speak('ok', 'en-US', 'en-US-Wavenet-F')
      }
    } catch (_) {}
    // Touch Supabase if configured
    try { const supa = require('../src/lib/supabase'); await supa.client.from('users').select('id').limit(1) } catch (_) {}
    res.json({ ok: true })
  } catch (e) {
    res.status(200).json({ ok: true })
  }
})

// NOWPayments (crypto) endpoints
app.post('/api/payment/now/voice-change/create', nowpay.createVoiceChangePayment)
app.post('/api/payment/now/premium/create', nowpay.createPremiumPayment)
app.post('/api/payment/now/plan/create', nowpay.createPlanPayment)
app.post('/api/payment/now/activate', nowpay.activatePlanPayment)
app.post('/api/payment/now/activate-order', nowpay.activatePlanPaymentByOrder)
app.post('/api/payment/now/admin/force-activate', nowpay.adminForceActivatePlan)
app.post('/api/payment/now/webhook', nowpay.ipn)
app.post('/payment/now/voice-change/create', nowpay.createVoiceChangePayment)
app.post('/payment/now/premium/create', nowpay.createPremiumPayment)
app.post('/payment/now/plan/create', nowpay.createPlanPayment)
app.post('/payment/now/activate', nowpay.activatePlanPayment)
app.post('/payment/now/activate-order', nowpay.activatePlanPaymentByOrder)
app.post('/payment/now/admin/force-activate', nowpay.adminForceActivatePlan)
app.post('/payment/now/webhook', nowpay.ipn)

// PayPal endpoints
app.post('/api/paypal/voice-order/create', paypalRoutes.createVoiceIdOrder)
app.post('/api/paypal/webhook', paypalRoutes.captureWebhook)
app.post('/paypal/voice-order/create', paypalRoutes.createVoiceIdOrder)
app.post('/paypal/webhook', paypalRoutes.captureWebhook)

app.post('/api/admin/plan/set', admin.setPlan)
app.post('/api/admin/voice/remove', admin.removeVoice)
app.post('/api/admin/voice/set', admin.setDeviceVoiceManual)
app.post('/api/admin/voicechange/status', admin.setVoiceChangeStatus)
app.post('/admin/plan/set', admin.setPlan)
app.post('/admin/voice/remove', admin.removeVoice)
app.post('/admin/voice/set', admin.setDeviceVoiceManual)
app.post('/admin/voicechange/status', admin.setVoiceChangeStatus)
app.post('/api/payment/subscription/create', subscription.createSubscription)
app.get('/api/payment/subscription/status', subscription.getSubscriptionStatus)
app.post('/api/payment/subscription/activate', subscription.activateSubscription)
app.post('/api/payment/webhook', subscription.webhook)
app.post('/payment/subscription/create', subscription.createSubscription)
app.get('/payment/subscription/status', subscription.getSubscriptionStatus)
app.post('/payment/subscription/activate', subscription.activateSubscription)
app.post('/payment/webhook', subscription.webhook)

module.exports = (req, res) => app(req, res)
