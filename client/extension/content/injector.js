;(function() {
  const allowed = ['meet.google.com','zoom.us','twitch.tv','discord.com','teams.microsoft.com','teams.live.com','slack.com','gather.town','whereby.com']
  const script = document.createElement('script')
  script.textContent = `
    (function(){
      if (!${JSON.stringify(['meet.google.com','zoom.us','twitch.tv','discord.com','teams.microsoft.com','teams.live.com','slack.com','gather.town','whereby.com'])}.some(h => location.host.endsWith(h))) return
      let audioContext
      let aiDestination
      let micStream
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      function ensureCtx(){ if (!audioContext){ audioContext = new (window.AudioContext||window.webkitAudioContext)(); aiDestination = audioContext.createMediaStreamDestination() } }
      window.initAIContext = function(){ ensureCtx() }
      window.startLocalMicMonitor = function(){ ensureCtx(); return originalGetUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(s => { micStream = s; const micSource = audioContext.createMediaStreamSource(s); micSource.connect(audioContext.destination); return true }).catch(()=>false) }
      navigator.mediaDevices.getUserMedia = function(constraints){ ensureCtx(); if (constraints && (constraints.audio===true || typeof constraints.audio==='object')){ return Promise.resolve(aiDestination.stream) } return originalGetUserMedia(constraints) }
      window.injectAIVoice = async function(arrayBuffer){ ensureCtx(); try{ const buf = await audioContext.decodeAudioData(arrayBuffer.slice(0)); const src = audioContext.createBufferSource(); src.buffer = buf; src.connect(audioContext.destination); src.connect(aiDestination); src.start(0) }catch(e){} }
      window.playTranslation = window.injectAIVoice
      window.getAIStream = function(){ ensureCtx(); return aiDestination.stream }
      window.getMicStreamLocalOnly = function(){ return micStream }

      const streamer = {
        mediaSource: null,
        sourceBuffer: null,
        audioEl: null,
        elSource: null,
        queue: [],
        started: false,
        open: false,
        init(){
          ensureCtx()
          if (!window.MediaSource) return false
          try{
            const ms = new MediaSource()
            const audio = new Audio()
            audio.autoplay = true
            audio.muted = false
            audio.src = URL.createObjectURL(ms)
            const elSource = audioContext.createMediaElementSource(audio)
            elSource.connect(audioContext.destination)
            elSource.connect(aiDestination)
            this.mediaSource = ms
            this.audioEl = audio
            this.elSource = elSource
            ms.addEventListener('sourceopen', () => {
              this.open = true
              try{
                const sb = ms.addSourceBuffer('audio/mpeg')
                this.sourceBuffer = sb
                sb.addEventListener('updateend', () => this.flush())
                try{ audio.play().catch(()=>{}) }catch(e){}
                this.flush()
              }catch(e){ }
            }, { once: true })
            return true
          }catch(e){ return false }
        },
        append(ab){
          this.queue.push(new Uint8Array(ab))
          this.flush()
        },
        flush(){
          const sb = this.sourceBuffer
          if (!this.open || !sb || sb.updating) return
          if (this.queue.length === 0) return
          const chunk = this.queue.shift()
          try{ sb.appendBuffer(chunk) }catch(e){ }
        },
        start(){
          this.started = true
          this.queue = []
          this.open = false
          this.sourceBuffer = null
          if (this.audioEl){ try{ this.audioEl.pause() }catch(e){} }
          if (this.mediaSource){ try{ this.mediaSource.endOfStream() }catch(e){} }
          this.mediaSource = null
          this.audioEl = null
          this.elSource = null
          this.init()
        },
        end(){
          const ms = this.mediaSource
          const sb = this.sourceBuffer
          if (!ms) return
          const tryEnd = () => { try{ if (ms.readyState === 'open') ms.endOfStream() }catch(e){} }
          if (sb && sb.updating){ sb.addEventListener('updateend', tryEnd, { once: true }) }
          else { tryEnd() }
        }
      }
      window._aiStreamer = streamer
    })();
  `
  document.documentElement.appendChild(script)
  window.addEventListener('message', ev => { if (!ev.data) return; if (ev.data.type==='PLAY_TRANSLATION' && typeof window.injectAIVoice==='function'){ window.injectAIVoice(ev.data.audio) } if (ev.data.type==='PLAY_TRANSLATION_START'){ if (typeof window._aiStreamer==='object'){ window._aiStreamer.start() } } if (ev.data.type==='PLAY_TRANSLATION_CHUNK'){ if (typeof window._aiStreamer==='object'){ window._aiStreamer.append(ev.data.chunk) } } if (ev.data.type==='PLAY_TRANSLATION_END'){ if (typeof window._aiStreamer==='object'){ window._aiStreamer.end() } } })
  chrome.runtime.onMessage.addListener((msg) => { if (msg.type==='PLAY_TRANSLATION'){ window.postMessage({ type:'PLAY_TRANSLATION', audio: msg.audio }, '*') } if (msg.type==='INIT_AI_CONTEXT'){ window.postMessage({ type:'INIT_AI_CONTEXT' }, '*'); if (typeof window.initAIContext==='function') window.initAIContext() } if (msg.type==='START_LOCAL_FEEDBACK'){ if (typeof window.startLocalMicMonitor==='function') window.startLocalMicMonitor() } if (msg.type==='PLAY_TRANSLATION_START'){ window.postMessage({ type:'PLAY_TRANSLATION_START' }, '*') } if (msg.type==='PLAY_TRANSLATION_CHUNK'){ window.postMessage({ type:'PLAY_TRANSLATION_CHUNK', chunk: msg.chunk }, '*') } if (msg.type==='PLAY_TRANSLATION_END'){ window.postMessage({ type:'PLAY_TRANSLATION_END' }, '*') } })
})()
