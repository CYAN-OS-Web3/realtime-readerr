const eleven = require('./lib/elevenlabs')
const supa = require('./lib/supabase')
const auth = require('./auth')
function canUseVoiceClone(plan){
  const p = String(plan || '').toLowerCase()
  return p === 'pro' || p === 'team' || p === 'executive_pro_annual' || p === 'premium'
}

function resolveUserId(req){
  const tokenUserId = auth.getAuthUserId(req)
  const rawUserId = req.body && req.body.user_id ? req.body.user_id : ''
  const userId = tokenUserId || rawUserId || ''
  if (tokenUserId && rawUserId && String(rawUserId) !== tokenUserId) return { error: 'user_mismatch' }
  return { userId: String(userId) }
}

async function assignVoice(req,res){
  try{
    const resolved = resolveUserId(req)
    if (resolved.error) return res.status(401).json({ error: resolved.error })
    const userId = resolved.userId || ''
    const deviceId = req.body.device_id || ''
    if(!userId || !deviceId) return res.status(400).json({ error:'missing_params' })
    const plan = await supa.getUserPlan(userId)
    if(!canUseVoiceClone(plan)) return res.status(403).json({ error:'not_allowed' })
    if(!req.file) return res.status(400).json({ error:'missing_sample_file' })
    const voiceName = `u_${userId.slice(0,8)}_${deviceId.slice(0,12)}`
    const oldVoiceId = await supa.getDeviceVoice(userId, deviceId)
    const defaultVoiceId = (process.env.ELEVENLABS_DEFAULT_VOICE_ID || '').toString().trim()
    const allowFreeChanges = (process.env.ALLOW_FREE_VOICE_CHANGES || '').toString().trim().toLowerCase() === 'true'
    if (!allowFreeChanges && oldVoiceId && oldVoiceId !== defaultVoiceId){
      return res.status(402).json({ error: 'payment_required', amount: 5.0 })
    }
    const voiceId = await eleven.createVoiceFromSample(req.file.buffer, voiceName)
    try{
      await supa.setDeviceVoice(userId, deviceId, voiceId)
    } catch (e){
      try{ await eleven.deleteVoice(voiceId) }catch(_){ }
      throw e
    }
    if (oldVoiceId && oldVoiceId !== voiceId && oldVoiceId !== defaultVoiceId){
      try{ await eleven.deleteVoice(oldVoiceId) }catch(_){ }
    }
    res.json({ ok:true, voice_id: voiceId })
  }catch(e){ 
    console.error('assignVoice error:', e)
    res.status(500).json({ error: e.message || 'server_error' }) 
  }
}

async function updateVoice(req,res){
  try{
    const resolved = resolveUserId(req)
    if (resolved.error) return res.status(401).json({ error: resolved.error })
    const userId = resolved.userId || ''
    const deviceId = req.body.device_id || ''
    const amount = 5.0
    if(!userId || !deviceId) return res.status(400).json({ error:'missing_params' })
    const plan = await supa.getUserPlan(userId)
    if(!canUseVoiceClone(plan)) return res.status(403).json({ error:'not_allowed' })
    const paypalClient = (process.env.PAYPAL_CLIENT_ID || '') && (process.env.PAYPAL_SECRET || '')
    if(!paypalClient) return res.status(402).json({ error:'payment_required', amount })
    const payment = require('./payment')
    req.body.amount = amount
    return payment.createVoiceChangeOrder(req,res)
  }catch(e){ 
    console.error('updateVoice error:', e)
    res.status(500).json({ error: e.message || 'server_error' }) 
  }
}

async function completeVoiceUpdate(req, res){
  try{
    const resolved = resolveUserId(req)
    if (resolved.error) return res.status(401).json({ error: resolved.error })
    const userId = resolved.userId || ''
    const deviceId = req.body.device_id || ''
    const orderId = req.body.order_id || ''
    if(!userId || !deviceId || !orderId) return res.status(400).json({ error:'missing_params' })
    const plan = await supa.getUserPlan(userId)
    if(!canUseVoiceClone(plan)) return res.status(403).json({ error:'not_allowed' })
    if(!req.file) return res.status(400).json({ error:'missing_sample_file' })
    const payment = require('./payment')
    const capture = await payment.capturePaypalOrder(orderId)
    if(!capture || capture.status !== 'COMPLETED') return res.status(402).json({ error:'capture_failed' })
    const got = (((capture.purchase_units||[])[0]||{}).custom_id||'').toString()
    const expect = `voicechange:${userId}:${deviceId}`
    if(got && got !== expect) return res.status(401).json({ error:'order_mismatch' })

    const voiceName = `u_${userId.slice(0,8)}_${deviceId.slice(0,12)}_${Date.now()}`
    const oldVoiceId = await supa.getDeviceVoice(userId, deviceId)
    const newVoiceId = await eleven.createVoiceFromSample(req.file.buffer, voiceName)
    try{
      await supa.setDeviceVoice(userId, deviceId, newVoiceId)
      await supa.recordVoiceChange(userId, deviceId, 5.0, 'paypal', 'completed', orderId)
    } catch (e){
      try{ await eleven.deleteVoice(newVoiceId) }catch(_){ }
      throw e
    }

    const defaultVoiceId = (process.env.ELEVENLABS_DEFAULT_VOICE_ID || '').toString().trim()
    if (oldVoiceId && oldVoiceId !== newVoiceId && oldVoiceId !== defaultVoiceId){
      try{ await eleven.deleteVoice(oldVoiceId) }catch(_){ }
    }

    res.json({ ok:true, voice_id: newVoiceId })
  } catch (e){
    console.error('completeVoiceUpdate error:', e)
    res.status(500).json({ error: e.message || 'server_error' })
  }
}

module.exports = { assignVoice, updateVoice, completeVoiceUpdate }
