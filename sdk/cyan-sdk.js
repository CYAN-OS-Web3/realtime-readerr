;(function(){
  class CyanSDK {
    constructor(opts){
      const o = opts || {}
      this.baseUrl = (o.baseUrl || '').replace(/\/$/,'')
      this.apiKey = o.apiKey || ''
      this.sessionId = o.sessionId || ''
      if (!this.baseUrl) throw new Error('Missing baseUrl')
    }
    _headers(extra){
      const h = Object.assign({}, extra || {})
      if (this.apiKey) h['x-api-key'] = this.apiKey
      if (this.sessionId) h['x-session-id'] = this.sessionId
      return h
    }
    async speak(params){
      const p = params || {}
      const body = {
        text: p.text || '',
        user_id: p.userId || '',
        language: p.language || 'en-US',
        gender: p.gender || 'female'
      }
      const r = await fetch(`${this.baseUrl}/api/tts/speak`, {
        method: 'POST',
        headers: Object.assign(this._headers(), { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
      })
      if (!r.ok) throw new Error('speak_failed')
      return await r.arrayBuffer()
    }
    async cloneAndSpeak(params){
      const p = params || {}
      const fd = new FormData()
      fd.append('sample', p.file, p.file?.name || 'sample.mp3')
      fd.append('text', p.text || '')
      fd.append('user_id', p.userId || '')
      fd.append('quality', p.quality || 'high')
      const r = await fetch(`${this.baseUrl}/api/tts/clone-and-speak`, { method: 'POST', headers: this._headers(), body: fd })
      if (!r.ok) throw new Error('clone_speak_failed')
      return await r.arrayBuffer()
    }
    async cloneAndStream(params){
      const p = params || {}
      const fd = new FormData()
      fd.append('sample', p.file, p.file?.name || 'sample.mp3')
      fd.append('text', p.text || '')
      fd.append('user_id', p.userId || '')
      fd.append('quality', p.quality || 'high')
      const r = await fetch(`${this.baseUrl}/api/tts/clone-and-stream`, { method: 'POST', headers: this._headers(), body: fd })
      if (!r.ok || !r.body) throw new Error('clone_stream_failed')
      const reader = r.body.getReader()
      while (true){
        const { done, value } = await reader.read()
        if (done) break
        const chunk = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
        if (typeof p.onChunk === 'function') p.onChunk(chunk)
      }
      if (typeof p.onEnd === 'function') p.onEnd()
      return true
    }
    async getQuota(userId){
      const r = await fetch(`${this.baseUrl}/api/user/quota?user_id=${encodeURIComponent(userId)}`, { headers: this._headers() })
      if (!r.ok) throw new Error('quota_failed')
      return await r.json()
    }
    async getPlans(){
      const r = await fetch(`${this.baseUrl}/api/plans`, { headers: this._headers() })
      if (!r.ok) throw new Error('plans_failed')
      return await r.json()
    }
  }
  if (typeof module !== 'undefined' && module.exports){ module.exports = { CyanSDK } }
  if (typeof window !== 'undefined'){ window.CyanSDK = CyanSDK }
})()
