const fetch = require('node-fetch')
const https = require('https')
const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: 64 })
const apiKey = process.env.ELEVENLABS_API_KEY || ''
async function createVoiceFromSample(buffer, name){ 
  if (!apiKey) throw new Error('elevenlabs_api_key_missing')
  const FormData = require('form-data');
  const form = new FormData();
  form.append('name', name);
  form.append('files', buffer, { filename: 'sample.mp3', contentType: 'audio/mpeg' });
  form.append('description', 'User voice clone');
  
  const r = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      ...form.getHeaders()
    },
    body: form,
    agent
  });
  
  const j = await r.json(); 
  if (!r.ok || !j.voice_id) {
    throw new Error(`elevenlabs_create_voice_failed: ${r.status} ${JSON.stringify(j)}`)
  }
  return j.voice_id 
}
async function speakText(voiceId, text, quality, timeoutMs){
  if (!apiKey) throw new Error('elevenlabs_api_key_missing')
  const body = { text }
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`
  const opts = { method:'POST', headers:{ 'xi-api-key': apiKey, 'Content-Type':'application/json', 'Accept':'audio/mpeg' }, body: JSON.stringify(body), agent }
  let controller
  if (timeoutMs && timeoutMs > 0){ controller = new (global.AbortController || require('abort-controller'))(); opts.signal = controller.signal; setTimeout(()=>{ try{ controller.abort() }catch(_){} }, timeoutMs) }
  const r = await fetch(url, opts)
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`elevenlabs_tts_error_${r.status}: ${txt}`)
  }
  const b = await r.arrayBuffer()
  return Buffer.from(b)
}
async function speakTextStream(voiceId, text){ 
  if (!apiKey) throw new Error('elevenlabs_api_key_missing')
  const body = { text }; 
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;
  const r = await fetch(url, { method:'POST', headers:{ 'xi-api-key': apiKey, 'Content-Type':'application/json', 'Accept':'audio/mpeg' }, body: JSON.stringify(body), agent })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`elevenlabs_stream_error_${r.status}: ${txt}`)
  }
  return r.body 
}

async function speakPcmStream(voiceId, text, sampleRate){
  if (!apiKey) throw new Error('elevenlabs_api_key_missing')
  const rate = Number(sampleRate || 16000)
  const fmt = rate === 22050 ? 'pcm_22050' : (rate === 24000 ? 'pcm_24000' : (rate === 44100 ? 'pcm_44100' : 'pcm_16000'))
  const body = { text }
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=${fmt}`
  const r = await fetch(url, { method:'POST', headers:{ 'xi-api-key': apiKey, 'Content-Type':'application/json', 'Accept':'application/octet-stream' }, body: JSON.stringify(body), agent })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`elevenlabs_pcm_stream_error_${r.status}: ${txt}`)
  }
  return r.body
}
async function deleteVoice(voiceId){ 
  if (!apiKey) throw new Error('elevenlabs_api_key_missing')
  await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, { method:'DELETE', headers:{ 'xi-api-key': apiKey }, agent }) 
}
module.exports = { createVoiceFromSample, speakText, speakTextStream, speakPcmStream, deleteVoice }
