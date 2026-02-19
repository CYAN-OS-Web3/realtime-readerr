const fetch = require('node-fetch')

function getApiKey(){
  return (process.env.GOOGLE_API_KEY || '').trim()
}

async function speak(text, languageCode, voiceName){
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('google_api_key_missing')
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`
  const body = {
    input: { text },
    voice: { languageCode, name: voiceName },
    audioConfig: { audioEncoding: 'MP3' }
  }
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json()
  if (!r.ok) throw new Error(j && j.error && j.error.message ? j.error.message : 'google_tts_failed')
  return Buffer.from(j.audioContent || '', 'base64')
}

module.exports = { speak }
