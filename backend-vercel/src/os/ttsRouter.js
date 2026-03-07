const eleven = require('../lib/elevenlabs')
const gtts = require('../lib/google')
const aztts = require('../lib/azure')
const supa = require('../lib/supabase')
const crypto = require('crypto')

function delay(ms){
  return new Promise(resolve => setTimeout(resolve, ms))
}

const providerCircuit = new Map()

function circuitAllows(provider){
  const state = providerCircuit.get(provider)
  if (!state) return true
  if (state.openUntil && state.openUntil > Date.now()) return false
  // Cooldown expired; reset
  providerCircuit.delete(provider)
  return true
}

function recordSuccess(provider){
  providerCircuit.delete(provider)
}

function recordFailure(provider){
  const now = Date.now()
  const state = providerCircuit.get(provider) || { failures: 0, openUntil: 0 }
  state.failures += 1
  if (state.failures >= 3){
    const cooldown = Math.min(60000, 2000 * state.failures)
    state.openUntil = now + cooldown
  }
  providerCircuit.set(provider, state)
}

function hasAzure(){
  return !!((process.env.AZURE_SPEECH_KEY || '').trim() && (process.env.AZURE_SPEECH_REGION || '').trim())
}

async function attemptProvider({ name, fn, timeoutMs = 0, retries = 2, backoffBaseMs = 150 }){
  if (!circuitAllows(name)){
    return { ok: false, name, error: 'circuit_open', latencyMs: 0 }
  }
  let last = null
  for (let attempt = 0; attempt <= retries; attempt++){
    last = await tryProvider(name, fn, timeoutMs)
    if (last.ok){
      recordSuccess(name)
      return last
    }
    recordFailure(name)
    if (attempt < retries){
      const wait = backoffBaseMs * Math.pow(2, attempt)
      await delay(wait)
      if (!circuitAllows(name)){
        return { ok: false, name, error: 'circuit_open', latencyMs: last.latencyMs }
      }
    }
  }
  return last || { ok: false, name, error: 'unknown', latencyMs: 0 }
}

function hasGoogle(){
  return !!((process.env.GOOGLE_API_KEY || '').trim())
}

function hasEleven(){
  return !!((process.env.ELEVENLABS_API_KEY || '').trim())
}

async function tryProvider(name, fn, timeoutMs){
  const start = Date.now()
  if (timeoutMs && timeoutMs > 0){
    return await Promise.race([
      fn().then((result) => ({ ok: true, name, result, latencyMs: Date.now() - start })),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, name, error: 'timeout', latencyMs: Date.now() - start }), timeoutMs))
    ])
  }
  try{
    const result = await fn()
    return { ok: true, name, result, latencyMs: Date.now() - start }
  } catch (e){
    return { ok: false, name, error: e && e.message ? e.message : 'error', latencyMs: Date.now() - start }
  }
}

async function speakRouted({ userId, text, languageCode, gender, plan, deviceVoiceId, preferredEngine }){
  const gVoice = gender === 'male' ? 'en-US-Wavenet-D' : 'en-US-Wavenet-F'
  const aVoice = gender === 'male' ? 'en-US-GuyNeural' : 'en-US-JennyNeural'
  const preferred = (preferredEngine || '').toString().trim().toLowerCase()
  const hash = crypto.createHash('sha256').update(`${text}|${languageCode}|${gender}|${preferred || ''}|${deviceVoiceId || ''}|${plan || ''}`).digest('hex')

  // Check cache first
  try {
    const cached = await supa.getCachedTts(hash)
    if (cached && cached.audio) {
      return {
        audio: Buffer.from(cached.audio, 'base64'),
        contentType: cached.contentType || 'audio/mpeg',
        provider: cached.provider || 'cache',
        chain: [{ provider: 'cache', ok: true, latency_ms: 0, error: null }]
      }
    }
  } catch (_) {}
  const attempts = []
  if ((plan === 'pro' || plan === 'premium' || plan === 'team' || plan === 'executive_pro_annual') && hasEleven()){
    const defaultVoiceId = (process.env.ELEVENLABS_DEFAULT_VOICE_ID || '').toString().trim()
    const voiceId = (deviceVoiceId || defaultVoiceId || '').toString().trim()
    if (voiceId){
      attempts.push(async () => {
        const ok = await supa.checkAndIncrementElevenCredits(userId, (text || '').length, plan)
        if (!ok) return { ok: false, name: 'elevenlabs', error: 'elevenlabs_credits_exhausted', latencyMs: 0 }
        return await attemptProvider({
          name: 'elevenlabs',
          timeoutMs: 0,
          retries: 1,
          backoffBaseMs: 200,
          fn: () => eleven.speakText(voiceId, text, 'high', 350)
        })
      })
    }
  }
  if (hasGoogle()) {
    attempts.push(() => attemptProvider({
      name: 'google',
      timeoutMs: 0,
      retries: 2,
      backoffBaseMs: 150,
      fn: () => gtts.speak(text, languageCode, gVoice)
    }))
  }
  if (hasAzure()) {
    attempts.push(() => attemptProvider({
      name: 'azure',
      timeoutMs: 0,
      retries: 2,
      backoffBaseMs: 150,
      fn: () => aztts.speak(text, aVoice)
    }))
  }

  if (preferred){
    attempts.sort((a, b) => {
      const ar = a.toString().includes(`'${preferred}'`) ? 0 : 1
      const br = b.toString().includes(`'${preferred}'`) ? 0 : 1
      return ar - br
    })
  }

  const chain = []
  for (const run of attempts){
    const r = await run()
    chain.push({ provider: r.name, ok: r.ok, latency_ms: r.latencyMs, error: r.ok ? null : r.error })
    if (r.ok){
      // Save to cache (base64) if small enough
      try{
        const b64 = Buffer.from(r.result).toString('base64')
        // Optional size guard: skip if >2MB
        if (b64.length <= 2_000_000){
          await supa.putCachedTts(hash, b64, 'audio/mpeg', r.name)
        }
      }catch(_){ }
      return { audio: r.result, contentType: 'audio/mpeg', provider: r.name, chain }
    }
  }
  const last = chain[chain.length - 1]
  throw new Error(last && last.error ? last.error : 'tts_failed')
}

async function cloneStreamRouted({ voiceId, text }){
  if (!hasEleven()) throw new Error('elevenlabs_not_configured')
  const start = Date.now()
  const stream = await eleven.speakTextStream(voiceId, text)
  return { stream, contentType: 'audio/mpeg', provider: 'elevenlabs', startMs: start }
}

module.exports = {
  speakRouted,
  cloneStreamRouted,
  status: () => ({
    elevenlabs: hasEleven(),
    google: hasGoogle(),
    azure: hasAzure()
  })
}
