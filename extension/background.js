chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  const { apiBase, apiKey } = await chrome.storage.local.get(['apiBase','apiKey'])
  const headers = {}
  if (apiKey) headers['x-api-key'] = apiKey
  headers['x-session-id'] = (msg.deviceId || msg.userId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())))
  if (msg.type === 'FETCH_TTS_CLONE') {
    try {
      const fd = new FormData()
      fd.append('sample', msg.file, 'sample.mp3')
      fd.append('text', msg.text)
      fd.append('user_id', msg.userId)
      fd.append('quality', 'high')
      const r = await fetch(`${apiBase}/api/tts/clone-and-speak`, { method: 'POST', body: fd, headers })
      const buf = await r.arrayBuffer()
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'PLAY_TRANSLATION', audio: buf })
      sendResponse({ ok: true })
    } catch (e) {
      sendResponse({ ok: false })
    }
    return true
  }
  if (msg.type === 'FETCH_TTS_STREAM') {
    try {
      const fd = new FormData()
      fd.append('sample', msg.file, 'sample.mp3')
      fd.append('text', msg.text)
      fd.append('user_id', msg.userId)
      fd.append('quality', 'high')
      const r = await fetch(`${apiBase}/api/tts/clone-and-stream`, { method: 'POST', body: fd, headers })
      const reader = r.body.getReader()
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'PLAY_TRANSLATION_START' })
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'PLAY_TRANSLATION_CHUNK', chunk })
      }
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'PLAY_TRANSLATION_END' })
      sendResponse({ ok: true })
    } catch (e) {
      sendResponse({ ok: false })
    }
    return true
  }
  if (msg.type === 'FETCH_TTS_SPEAK') {
    try {
      const body = {
        text: msg.text,
        user_id: msg.userId,
        device_id: msg.deviceId || '',
        language: msg.language || 'en-US',
        gender: msg.gender || 'female'
      }
      const r = await fetch(`${apiBase}/api/tts/speak`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const buf = await r.arrayBuffer()
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'PLAY_TRANSLATION', audio: buf })
      sendResponse({ ok: true })
    } catch (e) {
      sendResponse({ ok: false })
    }
    return true
  }
  if (msg.type === 'ASSIGN_VOICE') {
    try {
      const fd = new FormData()
      fd.append('sample', msg.file, 'sample.mp3')
      fd.append('user_id', msg.userId)
      fd.append('device_id', msg.deviceId)
      const r = await fetch(`${apiBase}/api/voice/assign`, { method: 'POST', body: fd, headers })
      const j = await r.json()
      sendResponse(j)
    } catch (e) {
      sendResponse({ ok: false })
    }
    return true
  }
  if (msg.type === 'UPDATE_VOICE') {
    try {
      const body = { user_id: msg.userId, device_id: msg.deviceId }
      const r = await fetch(`${apiBase}/api/payment/voice-change/create`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      sendResponse(j)
    } catch (e) {
      sendResponse({ ok: false })
    }
    return true
  }

  if (msg.type === 'COMPLETE_VOICE_UPDATE') {
    try {
      const fd = new FormData()
      fd.append('sample', msg.file, 'sample.mp3')
      fd.append('user_id', msg.userId)
      fd.append('device_id', msg.deviceId)
      fd.append('order_id', msg.orderId)
      const r = await fetch(`${apiBase}/api/voice/update/complete`, { method: 'POST', body: fd, headers })
      const j = await r.json()
      sendResponse(j)
    } catch (e) {
      sendResponse({ ok: false })
    }
    return true
  }
  if (msg.type === 'CAPTURE_VOICE_PAYMENT') {
    try {
      const body = { order_id: msg.orderId, user_id: msg.userId, device_id: msg.deviceId }
      const r = await fetch(`${apiBase}/api/payment/voice-change/capture`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      sendResponse(j)
    } catch (e) {
      sendResponse({ ok: false })
    }
    return true
  }
  if (msg.type === 'CREATE_SUBSCRIPTION') {
    try {
      const body = { user_id: msg.userId }
      const r = await fetch(`${apiBase}/api/payment/subscription/create`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      sendResponse(j)
    } catch (e) { sendResponse({ ok: false }) }
    return true
  }
  if (msg.type === 'CHECK_SUBSCRIPTION') {
    try {
      const r = await fetch(`${apiBase}/api/payment/subscription/status?id=${encodeURIComponent(msg.subId)}`, { headers })
      const j = await r.json()
      sendResponse(j)
    } catch (e) { sendResponse({ ok: false }) }
    return true
  }
  if (msg.type === 'ACTIVATE_SUBSCRIPTION') {
    try {
      const body = { user_id: msg.userId, subscription_id: msg.subId }
      const r = await fetch(`${apiBase}/api/payment/subscription/activate`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      sendResponse(j)
    } catch (e) { sendResponse({ ok: false }) }
    return true
  }
  // SELECT_PROVIDER removed
})

chrome.runtime.onInstalled.addListener(() => {})
