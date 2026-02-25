const eleven = require('../lib/elevenlabs')
const gtts = require('../lib/google')
const aztts = require('../lib/azure')
const supa = require('../lib/supabase')

function hasAzure(){
  return !!((process.env.AZURE_SPEECH_KEY || '').trim() && (process.env.AZURE_SPEECH_REGION || '').trim())
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
  const attempts = []
  if ((plan === 'pro' || plan === 'premium' || plan === 'team' || plan === 'executive_pro_annual') && hasEleven()){
    const defaultVoiceId = (process.env.ELEVENLABS_DEFAULT_VOICE_ID || '').toString().trim()
    const voiceId = (deviceVoiceId || defaultVoiceId || '').toString().trim()
    if (voiceId){
      attempts.push(async () => {
        const ok = await supa.checkAndIncrementElevenCredits(userId, (text || '').length, plan)
        if (!ok) return { ok: false, name: 'elevenlabs', error: 'elevenlabs_credits_exhausted', latencyMs: 0 }
        return await tryProvider('elevenlabs', () => eleven.speakText(voiceId, text, 'high', 350), 0)
      })
    }
  }
  if (hasGoogle()) attempts.push(() => tryProvider('google', () => gtts.speak(text, languageCode, gVoice), 0))
  if (hasAzure()) attempts.push(() => tryProvider('azure', () => aztts.speak(text, aVoice), 0))

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
