// Cyan AI Translator - Chrome Extension Popup
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
  { code: 'th-TH', name: 'Thai', flag: '🇹🇭' },
  { code: 'tr-TR', name: 'Turkish', flag: '🇹🇷' },
  { code: 'id-ID', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'ms-MY', name: 'Malay', flag: '🇲🇾' },
  { code: 'pl-PL', name: 'Polish', flag: '🇵🇱' },
  { code: 'uk-UA', name: 'Ukrainian', flag: '🇺🇦' },
  { code: 'nl-NL', name: 'Dutch', flag: '🇳🇱' },
  { code: 'fil-PH', name: 'Filipino', flag: '🇵🇭' }
]

// ==========================================
// Tab navigation
// ==========================================
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
    tab.classList.add('active')
    const target = tab.getAttribute('data-tab')
    document.getElementById('tab-' + target)?.classList.add('active')
  })
})

// ==========================================
// Init
// ==========================================
function initDropdowns() {
  const src = document.getElementById('sourceLang')
  const tgt = document.getElementById('targetLang')
  src.innerHTML = languages.map(l => `<option value="${l.code}">${l.flag} ${l.name}</option>`).join('')
  tgt.innerHTML = languages.map(l => `<option value="${l.code}">${l.flag} ${l.name}</option>`).join('')
  src.value = 'en-US'
  tgt.value = 'vi-VN'
}

async function initApiConfig() {
  const { apiBase: storedBase, apiKey: storedKey } = await chrome.storage.local.get(['apiBase', 'apiKey'])
  apiBase = storedBase || ''
  apiKey = storedKey || ''
  const baseEl = document.getElementById('apiBase')
  const keyEl = document.getElementById('apiKey')
  if (baseEl) baseEl.value = apiBase
  if (keyEl) keyEl.value = apiKey
  baseEl?.addEventListener('change', async (e) => { apiBase = e.target.value; await chrome.storage.local.set({ apiBase }) })
  keyEl?.addEventListener('change', async (e) => { apiKey = e.target.value; await chrome.storage.local.set({ apiKey }) })
}

// ==========================================
// Enable AI on site
// ==========================================
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
  if (!key) { document.getElementById('footerState').textContent = 'Unsupported site'; return }
  await chrome.permissions.request({ origins: patterns[key] })
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/injector.js'], world: 'MAIN' })
  await chrome.tabs.sendMessage(tab.id, { type: 'INIT_AI_CONTEXT' })
  document.getElementById('serverPill').textContent = 'ONLINE'
  document.getElementById('serverPill').className = 'pill pill-online'
  document.getElementById('footerState').textContent = 'AI Enabled'
})

// ==========================================
// Local Feedback
// ==========================================
document.getElementById('localFeedback').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) return
  await chrome.tabs.sendMessage(tab.id, { type: 'START_LOCAL_FEEDBACK' })
  document.getElementById('footerState').textContent = 'Listening...'
})

// ==========================================
// Clone & Speak / Stream
// ==========================================
document.getElementById('cloneSpeak').addEventListener('click', async () => {
  const fileInput = document.getElementById('sampleFile')
  const text = document.getElementById('ttsText').value || ''
  const userId = document.getElementById('userId')?.value || ''
  if (!fileInput.files[0] || !text || !userId) {
    document.getElementById('cloneStatus').textContent = 'Missing file/text/ID'
    return
  }
  document.getElementById('cloneStatus').textContent = 'Processing…'
  const file = fileInput.files[0]
  chrome.runtime.sendMessage({ type: 'FETCH_TTS_CLONE', file, text, userId }, (resp) => {
    document.getElementById('cloneStatus').textContent = resp && resp.ok ? '✓ Done' : '✗ Error'
  })
})

document.getElementById('cloneStream').addEventListener('click', async () => {
  const fileInput = document.getElementById('sampleFile')
  const text = document.getElementById('ttsText').value || ''
  const userId = document.getElementById('userId')?.value || ''
  if (!fileInput.files[0] || !text || !userId) {
    document.getElementById('streamStatus').textContent = 'Missing file/text/ID'
    return
  }
  document.getElementById('streamStatus').textContent = 'Streaming…'
  const file = fileInput.files[0]
  chrome.runtime.sendMessage({ type: 'FETCH_TTS_STREAM', file, text, userId }, (resp) => {
    document.getElementById('streamStatus').textContent = resp && resp.ok ? '✓ Stream done' : '✗ Error'
  })
})

// ==========================================
// Voice Assignment (Premium)
// ==========================================
const voiceSampleInput = document.getElementById('voiceSample')
const chooseVoiceSampleBtn = document.getElementById('chooseVoiceSampleBtn')
const voiceSampleName = document.getElementById('voiceSampleName')

if (chooseVoiceSampleBtn && voiceSampleInput) {
  chooseVoiceSampleBtn.addEventListener('click', () => voiceSampleInput.click())
}
if (voiceSampleInput && voiceSampleName) {
  voiceSampleInput.addEventListener('change', () => {
    voiceSampleName.textContent = voiceSampleInput.files?.[0]?.name || 'No file'
  })
}

document.getElementById('assignVoiceBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('voiceSample')
  const userId = document.getElementById('userId')?.value || ''
  const deviceId = document.getElementById('deviceId')?.value || ''
  if (!fileInput.files[0] || !userId || !deviceId) {
    document.getElementById('assignStatus').textContent = 'Missing info'
    return
  }
  document.getElementById('assignStatus').textContent = 'Assigning…'
  chrome.runtime.sendMessage({ type: 'ASSIGN_VOICE', file: fileInput.files[0], userId, deviceId }, (resp) => {
    if (!resp) { document.getElementById('assignStatus').textContent = 'Error'; return }
    if (resp.error === 'payment_required') { document.getElementById('assignStatus').textContent = 'Payment needed ($5)'; return }
    document.getElementById('assignStatus').textContent = resp.ok ? '✓ Assigned' : (resp.error || 'Error')
  })
})

let lastOrderId = ''

document.getElementById('updateVoiceBtn').addEventListener('click', async () => {
  const userId = document.getElementById('userId')?.value || ''
  const deviceId = document.getElementById('deviceId')?.value || ''
  if (!userId || !deviceId) { document.getElementById('updateStatus').textContent = 'Missing ID'; return }
  document.getElementById('updateStatus').textContent = 'Creating…'
  chrome.runtime.sendMessage({ type: 'UPDATE_VOICE', userId, deviceId }, async (resp) => {
    if (!resp) { document.getElementById('updateStatus').textContent = 'Error'; return }
    if (resp.approval_url && resp.order_id) {
      lastOrderId = resp.order_id
      await chrome.tabs.create({ url: resp.approval_url })
      document.getElementById('updateStatus').textContent = 'Complete PayPal → click Complete'
    } else {
      document.getElementById('updateStatus').textContent = resp.ok ? '✓' : (resp.error || 'Error')
    }
  })
})

document.getElementById('capturePaymentBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('voiceSample')
  const userId = document.getElementById('userId')?.value || ''
  const deviceId = document.getElementById('deviceId')?.value || ''
  if (!lastOrderId || !userId || !deviceId || !fileInput.files[0]) {
    document.getElementById('updateStatus').textContent = 'Missing info'
    return
  }
  document.getElementById('updateStatus').textContent = 'Updating…'
  chrome.runtime.sendMessage({ type: 'COMPLETE_VOICE_UPDATE', orderId: lastOrderId, userId, deviceId, file: fileInput.files[0] }, (resp) => {
    if (!resp) { document.getElementById('updateStatus').textContent = 'Error'; return }
    if (resp.ok) { lastOrderId = ''; document.getElementById('updateStatus').textContent = '✓ Updated' }
    else document.getElementById('updateStatus').textContent = resp.error || 'Error'
  })
})

// ==========================================
// Quota
// ==========================================
document.getElementById('getQuota').addEventListener('click', async () => {
  try {
    const userId = document.getElementById('userId')?.value || ''
    if (!userId || !apiBase) { document.getElementById('quotaText').textContent = 'Missing info'; return }
    const r = await fetch(`${apiBase}/api/user/quota?user_id=${encodeURIComponent(userId)}`, { headers: apiKey ? { 'x-api-key': apiKey } : {} })
    const j = await r.json()
    if (j && j.limit !== undefined) document.getElementById('quotaText').textContent = `${j.usage}/${j.limit}`
  } catch { document.getElementById('quotaText').textContent = 'Error' }
})

// ==========================================
// Sensitivity
// ==========================================
document.getElementById('sensitivity').addEventListener('input', (e) => {
  sensitivity = Number(e.target.value)
  document.getElementById('sensVal').textContent = `${sensitivity}%`
})

// ==========================================
// Subscription
// ==========================================
let lastSubscriptionId = ''

document.getElementById('subscribeBtn').addEventListener('click', async () => {
  const userId = document.getElementById('userId')?.value || ''
  if (!userId) { document.getElementById('subStatus').textContent = 'Missing userId'; return }
  document.getElementById('subStatus').textContent = 'Creating…'
  chrome.runtime.sendMessage({ type: 'CREATE_SUBSCRIPTION', userId }, async (resp) => {
    if (!resp) { document.getElementById('subStatus').textContent = 'Error'; return }
    if (resp.approval_url && resp.subscription_id) {
      lastSubscriptionId = resp.subscription_id
      await chrome.tabs.create({ url: resp.approval_url })
      document.getElementById('subStatus').textContent = 'Complete PayPal → Check/Activate'
    } else {
      document.getElementById('subStatus').textContent = resp.ok ? '✓ Created' : (resp.error || 'Error')
    }
  })
})

document.getElementById('checkSubBtn').addEventListener('click', async () => {
  if (!lastSubscriptionId) { document.getElementById('subStatus').textContent = 'No subscription'; return }
  chrome.runtime.sendMessage({ type: 'CHECK_SUBSCRIPTION', subId: lastSubscriptionId }, (resp) => {
    document.getElementById('subStatus').textContent = resp?.status ? `Status: ${resp.status}` : 'Error'
  })
})

document.getElementById('activateSubBtn').addEventListener('click', async () => {
  const userId = document.getElementById('userId')?.value || ''
  if (!userId || !lastSubscriptionId) { document.getElementById('subStatus').textContent = 'Missing info'; return }
  chrome.runtime.sendMessage({ type: 'ACTIVATE_SUBSCRIPTION', userId, subId: lastSubscriptionId }, (resp) => {
    document.getElementById('subStatus').textContent = resp?.ok ? '✓ Premium activated!' : 'Failed'
  })
})

// ==========================================
// Download
// ==========================================
document.getElementById('downloadAppBtn').addEventListener('click', async () => {
  await chrome.tabs.create({ url: 'https://github.com/your-org/your-repo/releases/latest' })
})

// ==========================================
// TTS Engine default
// ==========================================
const ttsEngineEl = document.getElementById('ttsEngine')
if (ttsEngineEl) ttsEngineEl.value = 'google'

// ==========================================
// Init
// ==========================================
initDropdowns()
initApiConfig()
