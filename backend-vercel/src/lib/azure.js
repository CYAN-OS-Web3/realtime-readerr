const fetch = require('node-fetch')
async function speak(text, voiceName = 'en-US-JennyNeural'){
  const key = (process.env.AZURE_SPEECH_KEY || '').trim()
  const region = (process.env.AZURE_SPEECH_REGION || '').trim()
  if (!key || !region) throw new Error('azure_speech_missing_key_or_region')
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`
  const ssml = `<?xml version="1.0" encoding="utf-8"?><speak version="1.0" xml:lang="en-US"><voice name="${voiceName}">${text}</voice></speak>`
  const r = await fetch(endpoint, { method:'POST', headers:{ 'Ocp-Apim-Subscription-Key': key, 'Content-Type':'application/ssml+xml', 'X-Microsoft-OutputFormat':'audio-24khz-48kbitrate-mono-mp3' }, body: ssml })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`azure_tts_error_${r.status}: ${txt}`)
  }
  const b = await r.arrayBuffer(); return Buffer.from(b)
}
module.exports = { speak }
