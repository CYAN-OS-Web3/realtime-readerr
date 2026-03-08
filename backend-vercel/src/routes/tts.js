const eleven = require('../lib/elevenlabs')
const supa = require('../lib/supabase')
const gtts = require('../lib/google')
const aztts = require('../lib/azure')
const ttsRouter = require('../os/ttsRouter')
const telemetry = require('../os/telemetry')
const watermark = require('../os/watermark')
const auth = require('../auth')

// Simple in-memory cache for character counting (per request)
const requestCharCache = new Map()

// Clean up cache every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [key, data] of requestCharCache.entries()) {
    if (now - data.timestamp > 300000) { // 5 minutes
      requestCharCache.delete(key)
    }
  }
}, 60000) // Check every minute

// Helper function to check and cache ElevenLabs credits usage
async function checkAndIncrementElevenCreditsWithCache(userId, chars, plan, requestId) {
  if (!userId) return true
  
  // Create cache key for this request
  const cacheKey = `eleven:${userId}:${requestId}`
  const cached = requestCharCache.get(cacheKey)
  
  if (cached) {
    // Already counted chars for this request, just check if still within limits
    const totalChars = cached.chars + chars
    const limit = supa.ELEVEN_CREDITS[plan] || supa.ELEVEN_CREDITS.free || 0
    return totalChars <= limit
  }
  
  // First time for this request, check and increment quota
  const ok = await supa.checkAndIncrementElevenCredits(userId, chars, plan)
  if (ok) {
    // Cache the result
    requestCharCache.set(cacheKey, {
      chars: chars,
      timestamp: Date.now(),
      plan: plan
    })
  }
  
  return ok
}

// Helper function to check and cache character usage
async function checkAndIncrementCharsWithCache(userId, chars, plan, requestId) {
  if (!userId) return true
  
  // Create cache key for this request
  const cacheKey = `${userId}:${requestId}`
  const cached = requestCharCache.get(cacheKey)
  
  if (cached) {
    // Already counted chars for this request, just check if still within limits
    const totalChars = cached.chars + chars
    const limit = supa.PLAN_LIMITS[plan] || supa.PLAN_LIMITS.free || 10000
    return totalChars <= limit
  }
  
  // First time for this request, check and increment quota
  const ok = await supa.checkAndIncrementQuota(userId, chars, 'standard')
  if (ok) {
    // Cache the result
    requestCharCache.set(cacheKey, {
      chars: chars,
      timestamp: Date.now(),
      plan: plan
    })
  }
  
  return ok
}

async function speak(req, res){
  const startMs = Date.now()
  const ctx = req.cyan || { requestId: null, sessionId: null, userId: null, deviceId: null, startMs }
  let provider = null
  let chain = []
  try{
    const oceanConsumerId = req.ocean && req.ocean.consumerId ? String(req.ocean.consumerId) : null
    const tokenUserId = auth.getAuthUserId(req)
    const rawUserId = req.body.user_id ?? null
    const userId = tokenUserId || (rawUserId ? String(rawUserId) : null)
    if (!userId && !oceanConsumerId) return res.status(400).json({ error: 'missing_user_id' })
    if (tokenUserId && rawUserId && String(rawUserId) !== tokenUserId) return res.status(401).json({ error: 'user_mismatch' })
    const limiterId = userId || `ocean:${oceanConsumerId}`
    const text = req.body.text || ''
    const gender = (req.body.gender || 'female').toLowerCase()
    const chars = text.length
    
    // Check provider-specific request limits
    const preferredEngine = (req.body.tts_engine || req.body.ttsEngine || '').toString().trim().toLowerCase()
    let expectedProvider = preferredEngine || 'elevenlabs'
    if (expectedProvider === 'waveNet' || expectedProvider === 'google') expectedProvider = 'google'
    
    const maxCharsPerRequest = supa.PROVIDER_REQUEST_LIMITS[expectedProvider] || supa.PROVIDER_REQUEST_LIMITS.google
    if (chars > maxCharsPerRequest) {
      return res.status(400).json({ 
        error: 'text_too_long', 
        message: `Text exceeds ${maxCharsPerRequest} characters for ${expectedProvider} provider`,
        max_chars: maxCharsPerRequest,
        provider: expectedProvider
      })
    }
    
    if (!oceanConsumerId) {
      const ok = await checkAndIncrementCharsWithCache(userId, chars, 'standard', ctx.requestId)
      if (!ok) return res.status(429).json({ error: 'rate_limit_exceeded' })
    }
    
    // Additional charge for RapidAPI users (deduct from their quota)
    const isRapidApi = req.headers['x-rapidapi-key'] && req.headers['x-rapidapi-user']
    if (isRapidApi && !oceanConsumerId) {
      // Deduct additional chars from quota as RapidAPI fee
      const rapidApiFee = Math.ceil(chars * 0.1) // 10% extra charge for RapidAPI
      const ok = await checkAndIncrementCharsWithCache(userId, rapidApiFee, 'standard', `${ctx.requestId}-rapidapi-fee`)
      if (!ok) return res.status(429).json({ error: 'rapidapi_quota_exceeded' })
    }
    const languageCode = (req.body.language || 'en-US')
    const plan = oceanConsumerId ? 'ocean' : await supa.getUserPlan(userId)
    
    // Anti-abuse: check for RapidAPI consumer and apply slightly higher limits (not 3x anymore)
    let rateLimitTokens = Math.max(1, Math.ceil(chars / 10))
    if (isRapidApi) {
      // Only 1.5x cost for RapidAPI (more reasonable)
      rateLimitTokens = Math.max(rateLimitTokens * 1.5, Math.ceil(chars / 7))
    }
    const allow = await supa.checkRateLimit(limiterId, rateLimitTokens, plan)
    if (!allow) return res.status(429).json({ error: 'too_many_requests' })
    let deviceVoiceId = null
    const deviceId = (req.body.device_id || '').trim()
    if (deviceId){
      try{ deviceVoiceId = await supa.getDeviceVoice(userId, deviceId) }catch(_){}
    }
    const result = await ttsRouter.speakRouted({ userId, text, languageCode, gender, plan, deviceVoiceId, preferredEngine })
    provider = result.provider
    chain = result.chain || []
    const audioBase64 = result.audio.toString('base64')
    res.json({ audio: audioBase64, contentType: result.contentType })
    const totalMs = Date.now() - startMs
    await telemetry.logEvent(ctx, 'tts_speak', {
      plan,
      provider,
      chain,
      chars,
      language: languageCode,
      total_ms: totalMs
    })
    try{ await supa.logTranslation(userId, text, languageCode, chars, { type:'speak', gender, provider, request_id: ctx.requestId }) }catch(_){ }
  }catch(e){
    const totalMs = Date.now() - startMs
    const timings = `total;dur=${totalMs},error;dur=${totalMs}`
    res.set('Server-Timing', timings)
    await telemetry.logEvent(ctx, 'tts_speak_error', {
      error: e && e.message ? e.message : 'unknown',
      total_ms: totalMs,
      provider,
      chain
    })
    res.status(500).json({ error:'server_error' })
  }
}

async function speakStream(req, res){
  const startMs = Date.now()
  const ctx = req.cyan || { requestId: null, sessionId: null, userId: null, deviceId: null, startMs }
  let provider = null
  let chain = []
  try{
    const oceanConsumerId = req.ocean && req.ocean.consumerId ? String(req.ocean.consumerId) : null
    const tokenUserId = auth.getAuthUserId(req)
    const rawUserId = req.body.user_id ?? null
    const userId = tokenUserId || (rawUserId ? String(rawUserId) : null)
    if (!userId && !oceanConsumerId) return res.status(400).json({ error: 'missing_user_id' })
    if (tokenUserId && rawUserId && String(rawUserId) !== tokenUserId) return res.status(401).json({ error: 'user_mismatch' })
    const limiterId = userId || `ocean:${oceanConsumerId}`

    const text = req.body.text || ''
    const gender = (req.body.gender || 'female').toLowerCase()
    const chars = text.length
    const languageCode = (req.body.language || 'en-US')
    const preferredEngine = (req.body.tts_engine || req.body.ttsEngine || '').toString().trim().toLowerCase()
    
    // Check provider-specific request limits
    let expectedProvider = preferredEngine || 'elevenlabs'
    if (expectedProvider === 'waveNet' || expectedProvider === 'google') expectedProvider = 'google'
    
    const maxCharsPerRequest = supa.PROVIDER_REQUEST_LIMITS[expectedProvider] || supa.PROVIDER_REQUEST_LIMITS.google
    if (chars > maxCharsPerRequest) {
      return res.status(400).json({ 
        error: 'text_too_long', 
        message: `Text exceeds ${maxCharsPerRequest} characters for ${expectedProvider} provider`,
        max_chars: maxCharsPerRequest,
        provider: expectedProvider
      })
    }

    if (!oceanConsumerId) {
      const ok = await checkAndIncrementCharsWithCache(userId, chars, 'standard', ctx.requestId)
      if (!ok) return res.status(429).json({ error: 'rate_limit_exceeded' })
    }
    
    // Additional charge for RapidAPI users (deduct from their quota)
    const isRapidApi = req.headers['x-rapidapi-key'] && req.headers['x-rapidapi-user']
    if (isRapidApi && !oceanConsumerId) {
      // Deduct additional chars from quota as RapidAPI fee
      const rapidApiFee = Math.ceil(chars * 0.1) // 10% extra charge for RapidAPI
      const ok = await checkAndIncrementCharsWithCache(userId, rapidApiFee, 'standard', `${ctx.requestId}-rapidapi-fee`)
      if (!ok) return res.status(429).json({ error: 'rapidapi_quota_exceeded' })
    }

    const plan = oceanConsumerId ? 'ocean' : await supa.getUserPlan(userId)
    
    // Anti-abuse: check for RapidAPI consumer and apply slightly higher limits (not 3x anymore)
    let rateLimitTokens = Math.max(1, Math.ceil(chars / 10))
    if (isRapidApi) {
      // Only 1.5x cost for RapidAPI (more reasonable)
      rateLimitTokens = Math.max(rateLimitTokens * 1.5, Math.ceil(chars / 7))
    }
    const allow = await supa.checkRateLimit(limiterId, rateLimitTokens, plan)
    if (!allow) return res.status(429).json({ error: 'too_many_requests' })

    let deviceVoiceId = null
    const deviceId = (req.body.device_id || '').trim()
    if (deviceId){
      try{ deviceVoiceId = await supa.getDeviceVoice(userId, deviceId) }catch(_){}
    }
    const defaultVoiceId = (process.env.ELEVENLABS_DEFAULT_VOICE_ID || '').toString().trim()
    const voiceId = (deviceVoiceId || defaultVoiceId || '').toString().trim()

    const canStreamEleven = (plan === 'pro' || plan === 'premium' || plan === 'team' || plan === 'executive_pro_annual')
    if (canStreamEleven && voiceId) {
      const ok = await checkAndIncrementElevenCreditsWithCache(userId, chars, plan, ctx.requestId)
      if (!ok) return res.status(402).json({ error: 'elevenlabs_credits_exhausted' })
      provider = 'elevenlabs'
      chain = [{ provider: 'elevenlabs', ok: true, latency_ms: 0, error: null }]
      res.set('Content-Type','audio/mpeg')
      res.set('Cache-Control','no-store')
      res.set('Connection','keep-alive')
      res.set('Transfer-Encoding','chunked')
      if (typeof res.flushHeaders === 'function') res.flushHeaders()
      const stream = await eleven.speakTextStream(voiceId, text)
      const onClose = async () => { try{ stream.destroy() }catch(_){} }
      req.on('close', onClose)
      req.on('aborted', onClose)
      stream.on('error', () => { try{ res.end() }catch(_){} })
      stream.pipe(res)
      stream.on('end', async () => {
        const totalMs = Date.now() - startMs
        try{ res.end() }catch(_){}
        await telemetry.logEvent(ctx, 'tts_speak_stream', { plan, provider, chain, chars, language: languageCode, total_ms: totalMs })
      })
      return
    }

    const result = await ttsRouter.speakRouted({ userId, text, languageCode, gender, plan, deviceVoiceId, preferredEngine })
    provider = result.provider
    chain = result.chain || []
    res.set('Content-Type', result.contentType || 'audio/mpeg')
    res.set('Cache-Control','no-store')
    res.send(result.audio)
    const totalMs = Date.now() - startMs
    await telemetry.logEvent(ctx, 'tts_speak_stream', { plan, provider, chain, chars, language: languageCode, total_ms: totalMs })
  } catch (e){
    const totalMs = Date.now() - startMs
    const timings = `total;dur=${totalMs},error;dur=${totalMs}`
    res.set('Server-Timing', timings)
    await telemetry.logEvent(ctx, 'tts_speak_stream_error', {
      error: e && e.message ? e.message : 'unknown',
      total_ms: totalMs,
      provider,
      chain
    })
    res.status(500).json({ error:'server_error' })
  }
}

async function speakPcmStream(req, res){
  const startMs = Date.now()
  const ctx = req.cyan || { requestId: null, sessionId: null, userId: null, deviceId: null, startMs }
  let provider = null
  let chain = []
  try{
    const oceanConsumerId = req.ocean && req.ocean.consumerId ? String(req.ocean.consumerId) : null
    const tokenUserId = auth.getAuthUserId(req)
    const rawUserId = req.body.user_id ?? null
    const userId = tokenUserId || (rawUserId ? String(rawUserId) : null)
    if (!userId && !oceanConsumerId) return res.status(400).json({ error: 'missing_user_id' })
    if (tokenUserId && rawUserId && String(rawUserId) !== tokenUserId) return res.status(401).json({ error: 'user_mismatch' })
    if (oceanConsumerId) return res.status(400).json({ error: 'pcm_stream_not_supported' })

    const limiterId = userId
    const text = req.body.text || ''
    const chars = text.length
    const languageCode = (req.body.language || 'en-US')
    const gender = (req.body.gender || 'female').toLowerCase()
    
    // Check provider-specific request limits (always ElevenLabs for PCM stream)
    const maxCharsPerRequest = supa.PROVIDER_REQUEST_LIMITS.elevenlabs
    if (chars > maxCharsPerRequest) {
      return res.status(400).json({ 
        error: 'text_too_long', 
        message: `Text exceeds ${maxCharsPerRequest} characters for ElevenLabs PCM stream`,
        max_chars: maxCharsPerRequest,
        provider: 'elevenlabs'
      })
    }

    const ok = await checkAndIncrementCharsWithCache(userId, chars, 'standard', ctx.requestId)
    if (!ok) return res.status(429).json({ error: 'rate_limit_exceeded' })
    const plan = await supa.getUserPlan(userId)
    
    // Anti-abuse: check for RapidAPI consumer and apply slightly higher limits (not 3x anymore)
    const isRapidApi = req.headers['x-rapidapi-key'] && req.headers['x-rapidapi-user']
    let rateLimitTokens = Math.max(1, Math.ceil(chars / 10))
    if (isRapidApi) {
      rateLimitTokens = Math.max(rateLimitTokens * 1.5, Math.ceil(chars / 7))
    }
    const allow = await supa.checkRateLimit(limiterId, rateLimitTokens, plan)
    if (!allow) return res.status(429).json({ error: 'too_many_requests' })

    let deviceVoiceId = null
    const deviceId = (req.body.device_id || '').trim()
    if (deviceId){
      try{ deviceVoiceId = await supa.getDeviceVoice(userId, deviceId) }catch(_){}
    }
    const defaultVoiceId = (process.env.ELEVENLABS_DEFAULT_VOICE_ID || '').toString().trim()
    const voiceId = (deviceVoiceId || defaultVoiceId || '').toString().trim()

    const canStreamEleven = (plan === 'pro' || plan === 'premium' || plan === 'team' || plan === 'executive_pro_annual')
    if (!canStreamEleven || !voiceId) return res.status(403).json({ error: 'pcm_stream_unavailable' })

    const okCredits = await checkAndIncrementElevenCreditsWithCache(userId, chars, plan, ctx.requestId)
    if (!okCredits) return res.status(402).json({ error: 'elevenlabs_credits_exhausted' })

    provider = 'elevenlabs'
    chain = [{ provider: 'elevenlabs', ok: true, latency_ms: 0, error: null }]
    res.set('Content-Type','application/octet-stream')
    res.set('Cache-Control','no-store')
    res.set('Connection','keep-alive')
    res.set('Transfer-Encoding','chunked')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()
    const stream = await eleven.speakPcmStream(voiceId, text, 16000)
    const meta = { userId, deviceId, transactionId: null }
    const wrapped = watermark.wrapPcmStreamWithWatermark(stream, meta)
    const onClose = async () => { try{ stream.destroy() }catch(_){} }
    req.on('close', onClose)
    req.on('aborted', onClose)
    wrapped.on('error', () => { try{ res.end() }catch(_){} })
    wrapped.pipe(res)
    wrapped.on('end', async () => {
      const totalMs = Date.now() - startMs
      try{ res.end() }catch(_){}
      await telemetry.logEvent(ctx, 'tts_speak_pcm_stream', { plan, provider, chain, chars, language: languageCode, total_ms: totalMs })
      try{ await supa.logTranslation(userId, text, languageCode, chars, { type:'speak-pcm-stream', gender, provider, request_id: ctx.requestId }) }catch(_){ }
    })
  } catch (e){
    const totalMs = Date.now() - startMs
    const timings = `total;dur=${totalMs},error;dur=${totalMs}`
    res.set('Server-Timing', timings)
    await telemetry.logEvent(ctx, 'tts_speak_pcm_stream_error', {
      error: e && e.message ? e.message : 'unknown',
      total_ms: totalMs,
      provider,
      chain
    })
    res.status(500).json({ error:'server_error' })
  }
}

async function cloneAndSpeak(req, res){
  try{
    const userId = req.body.user_id
    const text = req.body.text || ''
    const quality = req.body.quality || 'high'
    if (!req.file) return res.status(400).json({ error:'missing sample file' })
    const charCount = text.length
    const plan = await supa.getUserPlan(userId)
    if (plan === 'free') return res.status(403).json({ error:'feature_unavailable' })
    const ok = await supa.checkAndIncrementQuota(userId, charCount, 'standard')
    if (!ok) return res.status(429).json({ error:'rate_limit_exceeded' })
    const voiceName = req.body.voice_name || `tmp-${Date.now()}`
    const voiceId = await eleven.createVoiceFromSample(req.file.buffer, voiceName)
    let audio
    try{ audio = await eleven.speakText(voiceId, text, quality) } finally { try{ await eleven.deleteVoice(voiceId) }catch(e){} }
    const audioBase64 = Buffer.from(audio).toString('base64')
    res.json({ audio: audioBase64, contentType: 'audio/mpeg' })
    try{ await supa.logTranslation(userId, text, null, charCount, { type:'clone-and-speak', quality }) }catch(_){ }
  }catch(e){ res.status(500).json({ error:'server_error' }) }
}

async function cloneAndStream(req, res){
  const startMs = Date.now()
  const ctx = req.cyan || { requestId: null, sessionId: null, userId: null, deviceId: null, startMs }
  let firstByteMs = null
  let provider = null
  let chain = []
  try{
    const userId = req.body.user_id ?? null
    const text = req.body.text || ''
    const quality = req.body.quality || 'high'
    if (!req.file) return res.status(400).json({ error:'missing sample file' })
    const charCount = text.length
    const plan = await supa.getUserPlan(userId)
    if (plan === 'free') return res.status(403).json({ error:'feature_unavailable' })
    const ok = await supa.checkAndIncrementQuota(userId, charCount, 'standard')
    if (!ok) return res.status(429).json({ error:'rate_limit_exceeded' })
    const allow = await supa.checkRateLimit(userId, Math.max(1, Math.ceil(charCount / 10)), plan)
    if (!allow) return res.status(429).json({ error: 'too_many_requests' })
    const voiceName = req.body.voice_name || `tmp-${Date.now()}`
    const voiceId = await eleven.createVoiceFromSample(req.file.buffer, voiceName)
    res.set('Content-Type','audio/mpeg')
    res.set('Cache-Control','no-store')
    res.set('Connection','keep-alive')
    res.set('Transfer-Encoding','chunked')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()
    const routed = await ttsRouter.cloneStreamRouted({ voiceId, text })
    provider = routed.provider
    const stream = routed.stream
    const onClose = async () => { try{ stream.destroy() }catch(_){} try{ await eleven.deleteVoice(voiceId) }catch(_){} }
    req.on('close', onClose)
    req.on('aborted', onClose)
    stream.on('error', () => { try{ res.end() }catch(_){} })
    stream.on('end', async () => { try{ await eleven.deleteVoice(voiceId) }catch(_){} })
    // Measure first byte correctly
    const onData = () => {
      firstByteMs = Date.now() - startMs
      // Set Server-Timing header once we know firstByteMs
      const totalMs = Date.now() - startMs
      const timings = [
        `total;dur=${totalMs}`,
        `firstByte;dur=${firstByteMs}`,
        provider ? `provider;desc=${provider}` : ''
      ].filter(Boolean).join(', ')
      res.set('Server-Timing', timings)
    }
    stream.once('data', onData)
    stream.pipe(res)
    // Log telemetry after pipe, but ensure firstByteMs is captured
    await telemetry.logEvent(ctx, 'tts_clone_stream', {
      plan,
      provider,
      chars: charCount,
      quality,
      first_byte_ms: firstByteMs,
      total_ms: Date.now() - startMs
    })
    try{ await supa.logTranslation(userId, text, null, charCount, { type:'clone-and-stream', quality }) }catch(_){ }
  }catch(e){
    const totalMs = Date.now() - startMs
    const timings = `total;dur=${totalMs},error;dur=${totalMs}`
    res.set('Server-Timing', timings)
    await telemetry.logEvent(ctx, 'tts_clone_stream_error', {
      error: e && e.message ? e.message : 'unknown',
      total_ms: totalMs,
      first_byte_ms: firstByteMs,
      provider,
      chain
    })
    res.status(500).json({ error:'server_error' })
  }
}

// Chunked speak streaming for sub-400ms first byte on standard engines
function chunkText(input){
  const parts = input.split(/([.!?，。！？…]+\s+)/).filter(Boolean)
  const chunks = []
  for (let p of parts){
    p = p.trim()
    if (!p) continue
    if (p.length <= 60){ chunks.push(p); continue }
    let i = 0
    while (i < p.length){ const end = Math.min(i + 50, p.length); const slice = p.slice(i, end); chunks.push(slice.trim()); i = end }
  }
  return chunks
}

async function speakChunked(req, res){
  const startMs = Date.now()
  const ctx = req.cyan || { requestId: null, sessionId: null, userId: null, deviceId: null, startMs }
  let provider = null
  try{
    const oceanConsumerId = req.ocean && req.ocean.consumerId ? String(req.ocean.consumerId) : null
    const tokenUserId = auth.getAuthUserId(req)
    const rawUserId = req.body.user_id ?? null
    const userId = tokenUserId || (rawUserId ? String(rawUserId) : null)
    if (!userId && !oceanConsumerId) return res.status(400).json({ error: 'missing_user_id' })
    if (tokenUserId && rawUserId && String(rawUserId) !== tokenUserId) return res.status(401).json({ error: 'user_mismatch' })
    const limiterId = userId || `ocean:${oceanConsumerId}`
    const text = req.body.text || ''
    const gender = (req.body.gender || 'female').toLowerCase()
    const languageCode = (req.body.language || 'en-US')
    const gVoice = gender === 'male' ? 'en-US-Wavenet-D' : 'en-US-Wavenet-F'
    const aVoice = gender === 'male' ? 'en-US-GuyNeural' : 'en-US-JennyNeural'
    if (!oceanConsumerId) {
      const ok = await supa.checkAndIncrementQuota(userId, text.length, 'standard')
      if (!ok) return res.status(429).json({ error: 'rate_limit_exceeded' })
    }
    const plan = oceanConsumerId ? 'ocean' : await supa.getUserPlan(userId)
    const allow = await supa.checkRateLimit(limiterId, Math.max(1, Math.ceil(text.length / 10)), plan)
    if (!allow) return res.status(429).json({ error: 'too_many_requests' })
    res.set('Cache-Control','no-store')
    const pieces = chunkText(text)
    const audioChunks = []
    for (const piece of pieces){
      let audio
      try{ audio = await gtts.speak(piece, languageCode, gVoice); provider = 'google' }catch(_){ audio = await aztts.speak(piece, aVoice); provider = 'azure' }
      audioChunks.push(audio.toString('base64'))
      try{ await supa.logTranslation(userId, piece, languageCode, piece.length, { type:'speak-chunked', gender }) }catch(_){}
    }
    const totalMs = Date.now() - startMs
    const timings = [
      `total;dur=${totalMs}`,
      provider ? `provider;desc=${provider}` : ''
    ].filter(Boolean).join(', ')
    res.set('Server-Timing', timings)
    res.json({ audioChunks, contentType: 'audio/mpeg' })
    await telemetry.logEvent(ctx, 'tts_speak_chunked', {
      plan,
      provider,
      chars: text.length,
      language: languageCode,
      total_ms: totalMs
    })
  } catch (e){
    const totalMs = Date.now() - startMs
    const timings = `total;dur=${totalMs},error;dur=${totalMs}`
    res.set('Server-Timing', timings)
    await telemetry.logEvent(ctx, 'tts_speak_chunked_error', {
      error: e && e.message ? e.message : 'unknown',
      total_ms: totalMs,
      provider
    })
    res.status(500).json({ error:'server_error' })
  }
}

module.exports = { cloneAndSpeak, cloneAndStream, speak, speakChunked, speakStream, speakPcmStream }
