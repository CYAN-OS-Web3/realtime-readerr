let isTranslating = false
let sensitivity = 50
let apiBase = ''
let apiKey = ''

const languages = [
  { code: 'vi-VN', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'en-US', name: 'English', flag: '🇺🇸' },
  { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
  { code: 'de-DE', name: 'German', flag: '🇩🇪' },
  { code: 'it-IT', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt-PT', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru-RU', name: 'Russian', flag: '🇷🇺' },
  { code: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko-KR', name: 'Korean', flag: '🇰🇷' },
  { code: 'zh-CN', name: 'Mandarin', flag: '🇨🇳' },
  { code: 'hi-IN', name: 'Hindi', flag: '🇮🇳' },
  { code: 'ar-SA', name: 'Arabic', flag: '🇸🇦' },
  { code: 'bn-BD', name: 'Bengali', flag: '🇧🇩' },
  { code: 'ms-MY', name: 'Malay', flag: '🇲🇾' },
  { code: 'id-ID', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'th-TH', name: 'Thai', flag: '🇹🇭' },
  { code: 'tr-TR', name: 'Turkish', flag: '🇹🇷' },
  { code: 'pl-PL', name: 'Polish', flag: '🇵🇱' },
  { code: 'uk-UA', name: 'Ukrainian', flag: '🇺🇦' },
  { code: 'nl-NL', name: 'Dutch', flag: '🇳🇱' },
  { code: 'sv-SE', name: 'Swedish', flag: '🇸🇪' },
  { code: 'fi-FI', name: 'Finnish', flag: '🇫🇮' },
  { code: 'da-DK', name: 'Danish', flag: '🇩🇰' },
  { code: 'no-NO', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'cs-CZ', name: 'Czech', flag: '🇨🇿' },
  { code: 'el-GR', name: 'Greek', flag: '🇬🇷' },
  { code: 'he-IL', name: 'Hebrew', flag: '🇮🇱' },
  { code: 'ro-RO', name: 'Romanian', flag: '🇷🇴' },
  { code: 'hu-HU', name: 'Hungarian', flag: '🇭🇺' },
  { code: 'sk-SK', name: 'Slovak', flag: '🇸🇰' },
  { code: 'bg-BG', name: 'Bulgarian', flag: '🇧🇬' },
  { code: 'ca-ES', name: 'Catalan', flag: '🇦🇩' },
  { code: 'hr-HR', name: 'Croatian', flag: '🇭🇷' },
  { code: 'sr-RS', name: 'Serbian', flag: '🇷🇸' },
  { code: 'sl-SI', name: 'Slovenian', flag: '🇸🇮' },
  { code: 'et-EE', name: 'Estonian', flag: '🇪🇪' },
  { code: 'lv-LV', name: 'Latvian', flag: '🇱🇻' },
  { code: 'lt-LT', name: 'Lithuanian', flag: '🇱🇹' },
  { code: 'fil-PH', name: 'Filipino', flag: '🇵🇭' }
]

function initDropdowns(){
  const src = document.getElementById('sourceLang')
  const tgt = document.getElementById('targetLang')
  src.innerHTML = languages.map(l=>`<option value="${l.code}">${l.flag} ${l.name}</option>`).join('')
  tgt.innerHTML = languages.map(l=>`<option value="${l.code}">${l.flag} ${l.name}</option>`).join('')
  src.value = 'en-US'; tgt.value = 'vi-VN'
}

async function initApiConfig(){
  const { apiBase: storedBase, apiKey: storedKey } = await chrome.storage.local.get(['apiBase','apiKey'])
  apiBase = storedBase || ''
  apiKey = storedKey || ''
  const baseEl = document.getElementById('apiBase')
  const keyEl = document.getElementById('apiKey')
  if (baseEl) baseEl.value = apiBase
  if (keyEl) keyEl.value = apiKey
  baseEl.addEventListener('change', async (e)=>{ apiBase = e.target.value; await chrome.storage.local.set({ apiBase }) })
  keyEl.addEventListener('change', async (e)=>{ apiKey = e.target.value; await chrome.storage.local.set({ apiKey }) })
}

document.getElementById('enableSite').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) return
  const host = new URL(tab.url).hostname
  const patterns = {
    'meet.google.com': ['https://meet.google.com/*'],
    'zoom.us': ['https://*.zoom.us/*'],
    'twitch.tv': ['https://*.twitch.tv/*'],
    'discord.com': ['https://*.discord.com/*'],
    'teams.microsoft.com': ['https://*.teams.microsoft.com/*'],
    'teams.live.com': ['https://*.teams.live.com/*'],
    'slack.com': ['https://*.slack.com/*'],
    'gather.town': ['https://*.gather.town/*'],
    'whereby.com': ['https://*.whereby.com/*']
  }
  const key = Object.keys(patterns).find(k => host === k || host.endsWith(k))
  if (!key) { document.getElementById('walletStatus').textContent = 'Unsupported site'; return }
  await chrome.permissions.request({ origins: patterns[key] })
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/injector.js'], world: 'MAIN' })
  await chrome.tabs.sendMessage(tab.id, { type: 'INIT_AI_CONTEXT' })
  document.getElementById('serverPill').textContent = 'ONLINE'
  document.getElementById('serverPill').className = 'pill pill-online'
})

document.getElementById('localFeedback').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) return
  await chrome.tabs.sendMessage(tab.id, { type: 'START_LOCAL_FEEDBACK' })
  document.getElementById('footerState').textContent = 'Listening...'
})

document.getElementById('cloneSpeak').addEventListener('click', async () => {
  const fileInput = document.getElementById('sampleFile')
  const text = document.getElementById('ttsText').value || ''
  const userId = document.getElementById('userId').value || ''
  if (!fileInput.files[0] || !text || !userId) {
    document.getElementById('cloneStatus').textContent = 'Thiếu file/text/UserID'
    return
  }
  document.getElementById('cloneStatus').textContent = 'Đang xử lý…'
  const file = fileInput.files[0]
  chrome.runtime.sendMessage({ type: 'FETCH_TTS_CLONE', file, text, userId }, (resp) => {
    document.getElementById('cloneStatus').textContent = resp && resp.ok ? 'Xong' : 'Lỗi'
  })
})

document.getElementById('cloneStream').addEventListener('click', async () => {
  const fileInput = document.getElementById('sampleFile')
  const text = document.getElementById('ttsText').value || ''
  const userId = document.getElementById('userId').value || ''
  if (!fileInput.files[0] || !text || !userId) {
    document.getElementById('streamStatus').textContent = 'Thiếu file/text/UserID'
    return
  }
  document.getElementById('streamStatus').textContent = 'Đang streaming…'
  const file = fileInput.files[0]
  chrome.runtime.sendMessage({ type: 'FETCH_TTS_STREAM', file, text, userId }, (resp) => {
    document.getElementById('streamStatus').textContent = resp && resp.ok ? 'Streaming xong' : 'Lỗi streaming'
  })
})

document.getElementById('getQuota').addEventListener('click', async () => {
  try {
    const userId = document.getElementById('userId').value || ''
    if (!userId || !apiBase) { document.getElementById('quotaText').textContent = 'Thiếu userId/API Base'; return }
    const r = await fetch(`${apiBase}/api/user/quota?user_id=${encodeURIComponent(userId)}`, { headers: apiKey ? { 'x-api-key': apiKey } : {} })
    const j = await r.json()
    if (j && j.limit !== undefined) document.getElementById('quotaText').textContent = `${j.usage}/${j.limit} (${j.percent}%)`
  } catch (e) {
    document.getElementById('quotaText').textContent = 'Lỗi quota'
  }
})

document.getElementById('sensitivity').addEventListener('input', (e)=>{
  sensitivity = Number(e.target.value)
  document.getElementById('sensVal').textContent = `${sensitivity}%`
})

initDropdowns()
initApiConfig()

const ttsEngineEl = document.getElementById('ttsEngine')
if (ttsEngineEl) ttsEngineEl.value = 'azure'

document.getElementById('downloadAppBtn').addEventListener('click', async () => {
  const downloadUrl = 'https://github.com/your-org/your-repo/releases/latest/download/CyanTranslatorSetup.exe'
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  await chrome.tabs.create({ url: downloadUrl })
})
