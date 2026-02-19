const eleven = require('../../src/lib/elevenlabs')
const supa = require('../../src/lib/supabase')
const gtts = require('../../src/lib/google')
const aztts = require('../../src/lib/azure')

async function speak(req, res) {
  try {
    const userId = req.body.user_id || ''
    const text = req.body.text || ''
    const gender = (req.body.gender || 'female').toLowerCase()
    const chars = text.length
    const ok = await supa.checkAndIncrementQuota(userId, chars, 'standard')
    if (!ok) return res.status(429).json({ error: 'rate_limit_exceeded' })

    const languageCode = (req.body.language || 'en-US')
    const gVoice = gender === 'male' ? 'en-US-Wavenet-D' : 'en-US-Wavenet-F'
    const aVoice = gender === 'male' ? 'en-US-GuyNeural' : 'en-US-JennyNeural'

    let audio
    const plan = await supa.getUserPlan(userId)
    if (plan === 'premium') {
      try {
        const deviceId = (req.body.device_id || '').trim()
        let voiceId = null
        if (deviceId) voiceId = await supa.getDeviceVoice(userId, deviceId)
        if (!voiceId) voiceId = process.env.ELEVENLABS_VOICE_ID || ''
        audio = await eleven.speakText(voiceId, text, 'high')
      } catch (_) {}
    }
    if (!audio) {
      try {
        audio = await gtts.speak(text, languageCode, gVoice)
      } catch (_) {
        audio = await aztts.speak(text, aVoice)
      }
    }
    res.set('Content-Type', 'audio/mpeg')
    res.send(audio)
    try { await supa.logTranslation(userId, text, languageCode, chars, { type: 'speak', gender }) } catch (_){ }
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
}

async function cloneAndSpeak(req, res) {
  try {
    const userId = req.body.user_id
    const text = req.body.text || ''
    const quality = req.body.quality || 'high'
    if (!req.file) return res.status(400).json({ error: 'missing sample file' })
    const charCount = text.length
    const plan = await supa.getUserPlan(userId)
    if (plan === 'free') return res.status(403).json({ error: 'feature_unavailable' })
    const ok = await supa.checkAndIncrementQuota(userId, charCount, 'standard')
    if (!ok) return res.status(429).json({ error: 'rate_limit_exceeded' })

    const voiceName = req.body.voice_name || `tmp-${Date.now()}`
    const voiceId = await eleven.createVoiceFromSample(req.file.buffer, voiceName)
    let audio
    try {
      audio = await eleven.speakText(voiceId, text, quality)
    } finally {
      try { await eleven.deleteVoice(voiceId) } catch (e) {}
    }
    res.set('Content-Type', 'audio/mpeg')
    res.send(Buffer.from(audio))
    try { await supa.logTranslation(userId, text, null, charCount, { type: 'clone-and-speak', quality }) } catch (_){ }
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
}

async function cloneAndStream(req, res) {
  try {
    const userId = req.body.user_id
    const text = req.body.text || ''
    const quality = req.body.quality || 'high'
    if (!req.file) return res.status(400).json({ error: 'missing sample file' })
    const charCount = text.length
    const plan = await supa.getUserPlan(userId)
    if (plan === 'free') return res.status(403).json({ error: 'feature_unavailable' })
    const ok = await supa.checkAndIncrementQuota(userId, charCount, 'standard')
    if (!ok) return res.status(429).json({ error: 'rate_limit_exceeded' })

    const voiceName = req.body.voice_name || `tmp-${Date.now()}`
    const voiceId = await eleven.createVoiceFromSample(req.file.buffer, voiceName)
    let audio
    try {
      audio = await eleven.speakText(voiceId, text, quality)
    } finally {
      try { await eleven.deleteVoice(voiceId) } catch (e) {}
    }
    res.set('Content-Type', 'application/octet-stream')
    res.set('Cache-Control', 'no-store')
    const chunkSize = 64 * 1024
    for (let i = 0; i < audio.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, audio.length)
      res.write(audio.slice(i, end))
    }
    res.end()
    try { await supa.logTranslation(userId, text, null, charCount, { type: 'clone-and-stream', quality }) } catch (_){ }
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
}

module.exports = { cloneAndSpeak, cloneAndStream, speak }
