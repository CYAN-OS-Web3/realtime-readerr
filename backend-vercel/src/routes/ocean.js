const ttsRoutes = require('./tts')
const ttsRouter = require('../os/ttsRouter')
const telemetry = require('../os/telemetry')
const supa = require('../lib/supabase')

function getOceanProxySecret(req){
  const h = (req.headers['x-ocean-proxy-secret'] || req.headers['x-ocean-secret'] || '').toString().trim()
  return h
}

function getOceanConsumer(req){
  const h = (req.headers['x-ocean-consumer'] || req.headers['x-ocean-consumer-address'] || '').toString().trim()
  return h
}

function oceanElevenEnabled(){
  return ((process.env.OCEAN_ALLOW_ELEVENLABS || '').toString().trim().toLowerCase() === 'true')
}

async function requireOceanConsumer(req, res){
  const secret = (process.env.OCEAN_PROXY_SECRET || '').toString().trim()
  if (!secret) return res.status(501).json({ error: 'ocean_not_configured' })
  const got = getOceanProxySecret(req)
  if (!got || got !== secret) return res.status(401).json({ error: 'unauthorized' })
  const consumer = getOceanConsumer(req)
  if (!consumer) return res.status(400).json({ error: 'missing_consumer' })
  const consumerId = await supa.getOrCreateOceanConsumer(consumer)
  if (!consumerId) return res.status(500).json({ error: 'consumer_create_failed' })
  req.ocean = { consumer, consumerId }
  return null
}

async function checkOceanQuota(req, res, chars){
  const consumerId = req.ocean && req.ocean.consumerId
  if (!consumerId) return res.status(500).json({ error: 'consumer_missing' })
  const ok = await supa.checkAndIncrementOceanQuota(consumerId, chars)
  if (!ok) return res.status(429).json({ error: 'ocean_quota_exceeded' })
  return null
}

async function speak(req, res){
  const gate = await requireOceanConsumer(req, res)
  if (gate) return gate
  const text = req.body.text || ''
  const q = await checkOceanQuota(req, res, text.length)
  if (q) return q
  if (!oceanElevenEnabled()){
    req.body.user_id = null
    return ttsRoutes.speak(req, res)
  }
  const startMs = Date.now()
  const ctx = req.cyan || { requestId: null, sessionId: null, userId: null, deviceId: null, startMs }
  let provider = null
  let chain = []
  try{
    const consumerId = req.ocean.consumerId
    const languageCode = (req.body.language || 'en-US')
    const gender = (req.body.gender || 'female').toLowerCase()
    const voiceId = (req.body.voice_id || '').toString().trim()
    const plan = voiceId ? 'pro' : 'ocean'
    const result = await ttsRouter.speakRouted({
      userId: consumerId,
      text,
      languageCode,
      gender,
      plan,
      deviceVoiceId: voiceId
    })
    provider = result.provider
    chain = result.chain || []
    const audioBase64 = result.audio.toString('base64')
    res.json({ audio: audioBase64, contentType: result.contentType })
    const totalMs = Date.now() - startMs
    await telemetry.logEvent(ctx, 'ocean_tts_speak', {
      provider,
      chain,
      chars: text.length,
      language: languageCode,
      total_ms: totalMs
    })
  }catch(e){
    const totalMs = Date.now() - startMs
    const timings = `total;dur=${totalMs},error;dur=${totalMs}`
    res.set('Server-Timing', timings)
    await telemetry.logEvent(ctx, 'ocean_tts_speak_error', {
      error: e && e.message ? e.message : 'unknown',
      total_ms: totalMs,
      provider,
      chain
    })
    res.status(500).json({ error: 'server_error' })
  }
}

async function cloneAndSpeak(req, res){
  const gate = await requireOceanConsumer(req, res)
  if (gate) return gate
  const text = req.body.text || ''
  const q = await checkOceanQuota(req, res, text.length)
  if (q) return q
  req.body.user_id = null
  return ttsRoutes.cloneAndSpeak(req, res)
}

async function cloneAndStream(req, res){
  const gate = await requireOceanConsumer(req, res)
  if (gate) return gate
  const text = req.body.text || ''
  const q = await checkOceanQuota(req, res, text.length)
  if (q) return q
  req.body.user_id = null
  return ttsRoutes.cloneAndStream(req, res)
}

async function speakChunked(req, res){
  const gate = await requireOceanConsumer(req, res)
  if (gate) return gate
  const text = req.body.text || ''
  const q = await checkOceanQuota(req, res, text.length)
  if (q) return q
  req.body.user_id = null
  return ttsRoutes.speakChunked(req, res)
}

module.exports = { speak, cloneAndSpeak, cloneAndStream, speakChunked }
