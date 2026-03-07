const { createClient } = require('@supabase/supabase-js')

const url = process.env.SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
let supabase
if (url && key) {
  supabase = createClient(url, key)
} else {
  const chain = () => ({
    select: () => chain(),
    update: () => chain(),
    insert: () => chain(),
    eq: () => chain(),
    order: () => chain(),
    limit: () => chain(),
    single: async () => ({ data: null }),
  })
  supabase = { from: () => chain() }
}

const PLAN_LIMITS = {
  free: 5000,         // 5K chars/month for free
  basic: 100000,      // 100K chars/month for basic
  standard: 300000,   // 300K chars/month for standard  
  pro: 500000,        // 500K chars/month for pro (RapidAPI pricing)
  team: 1000000,      // 1M chars/month for team
  executive_pro_annual: 2000000,
  premium: 2000000
}
const ELEVEN_CREDITS = { 
  basic: 10000,       // 10K chars/month for basic
  standard: 25000,   // 25K chars/month for standard
  pro: 50000,        // 50K chars/month for pro (reduced to avoid losses)
  team: 100000,      // 100K chars/month for team
  executive_pro_annual: 200000,
  premium: 200000
}

const failOpenLimiters = (process.env.FAIL_OPEN_LIMITERS || '').toString().trim().toLowerCase() === 'true'

// Provider-specific character limits per request to prevent abuse
const PROVIDER_REQUEST_LIMITS = {
  elevenlabs: 5000,   // Max 5K chars per ElevenLabs request
  azure: 10000,       // Max 10K chars per Azure request
  google: 10000       // Max 10K chars per Google WaveNet request
}

async function checkAndIncrementQuota(userId, chars, tier = 'standard') {
  if (!userId) return false
  let user = null
  try {
    // Change from daily to monthly tracking
    const r = await supabase.from('users').select('monthly_chars,last_reset,plan').eq('google_id', userId).single()
    user = r && r.data ? r.data : null
  } catch (_) {
    user = null
  }

  if (!user) {
    try {
      const monthStart = `${new Date().toISOString().slice(0, 7)}-01`
      const created = await supabase
        .from('users')
        .insert({ google_id: userId, plan: 'free', monthly_chars: 0, last_reset: monthStart })
        .select('monthly_chars,last_reset,plan')
        .single()
      user = created && created.data ? created.data : null
    } catch (_) {
      user = null
    }
  }

  if (!user) return false

  const plan = user.plan || 'free'
  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free
  let used = user.monthly_chars || 0

  if (plan === 'free'){
    if (used + chars > limit) return false
    await supabase.from('users').update({ monthly_chars: used + chars }).eq('google_id', userId)
    return true
  }

  const monthKey = new Date().toISOString().slice(0, 7)
  const last = user.last_reset ? String(user.last_reset).slice(0, 7) : monthKey
  if (last !== monthKey) used = 0
  if (used + chars > limit) return false
  await supabase.from('users').update({ monthly_chars: used + chars, last_reset: `${monthKey}-01` }).eq('google_id', userId)
  return true
}

module.exports = { checkAndIncrementQuota }
module.exports.client = supabase

async function logTranslation(userId, text, language, chars, meta){
  try{ await supabase.from('translations').insert({ user_id: userId, text, language, chars, meta }) }catch(e){}
}
module.exports.logTranslation = logTranslation

async function getOrCreateOceanConsumer(consumer){
  if (!consumer) return null
  const crypto = require('crypto')
  const salt = (process.env.OCEAN_CONSUMER_SALT || '').toString()
  const hash = crypto.createHash('sha256').update(`${consumer}:${salt}`).digest('hex')
  try{
    const { data } = await supabase.from('ocean_consumers').select('id').eq('consumer_hash', hash).single()
    if (data && data.id) return data.id
    const { data: created } = await supabase.from('ocean_consumers').insert({ consumer_hash: hash }).select('id').single()
    return created && created.id ? created.id : null
  } catch (e){
    return hash
  }
}
module.exports.getOrCreateOceanConsumer = getOrCreateOceanConsumer

async function getUserPlan(userId){
  if (!userId) return 'free'
  try{ const { data } = await supabase.from('users').select('plan').eq('google_id', userId).single(); return (data && data.plan) ? data.plan : 'free' }catch(e){ return 'free' }
}
module.exports.getUserPlan = getUserPlan

async function checkAndIncrementElevenCredits(userId, chars, plan){
  if (!userId) return false
  const p = (plan || '').toString().trim().toLowerCase()
  if (p === 'premium') return true
  const limit = ELEVEN_CREDITS[p]
  if (!limit) return false
  try{
    const monthKey = new Date().toISOString().slice(0, 7)
    const { data } = await supabase.from('eleven_credits').select('month,used').eq('user_id', userId).single()
    let used = 0
    if (data && data.month === monthKey) used = data.used || 0
    if (used + chars > limit) return false
    if (data){
      await supabase.from('eleven_credits').update({ month: monthKey, used: used + chars }).eq('user_id', userId)
    } else {
      await supabase.from('eleven_credits').insert({ user_id: userId, month: monthKey, used: chars })
    }
    return true
  } catch (e){
    return failOpenLimiters
  }
}
module.exports.checkAndIncrementElevenCredits = checkAndIncrementElevenCredits

async function checkAndIncrementOceanQuota(consumerId, chars){
  if (!consumerId) return true
  const limit = Number(process.env.OCEAN_MONTHLY_CHARS || 0)
  if (!limit || limit <= 0) return true
  // Anti-abuse: add per-minute rate limit for Ocean consumers
  const minuteLimit = Number(process.env.OCEAN_MINUTE_CHARS || 1000) // Default 1000 chars/minute
  try{
    // Check minute limit first
    const now = Date.now()
    const minute = Math.floor(now / 60000)
    const { data: minuteData } = await supabase.from('ocean_rate_limits').select('minute,used').eq('consumer_id', consumerId).single()
    let minuteUsed = 0
    if (minuteData && minuteData.minute === minute) minuteUsed = minuteData.used || 0
    if (minuteUsed + chars > minuteLimit) return false
    
    // Update minute limit
    if (minuteData){
      await supabase.from('ocean_rate_limits').update({ minute, used: minuteUsed + chars }).eq('consumer_id', consumerId)
    } else {
      await supabase.from('ocean_rate_limits').insert({ consumer_id: consumerId, minute, used: minuteUsed + chars })
    }
    
    // Then check monthly limit
    const monthKey = new Date().toISOString().slice(0, 7)
    const { data } = await supabase.from('ocean_quotas').select('month,used').eq('consumer_id', consumerId).single()
    let used = 0
    if (data && data.month === monthKey) used = data.used || 0
    if (used + chars > limit) return false
    if (data){
      await supabase.from('ocean_quotas').update({ month: monthKey, used: used + chars }).eq('consumer_id', consumerId)
    } else {
      await supabase.from('ocean_quotas').insert({ consumer_id: consumerId, month: monthKey, used: chars })
    }
    return true
  } catch (e){
    return failOpenLimiters
  }
}
module.exports.checkAndIncrementOceanQuota = checkAndIncrementOceanQuota

async function setDeviceVoice(userId, deviceId, voiceId){
  await supabase.from('devices').upsert({ user_id: userId, device_id: deviceId, voice_id: voiceId, updated_at: new Date().toISOString() }, { onConflict: 'user_id,device_id' })
}
async function getDeviceVoice(userId, deviceId){
  const { data } = await supabase.from('devices').select('voice_id').eq('user_id', userId).eq('device_id', deviceId).single()
  return data && data.voice_id ? data.voice_id : null
}
async function recordVoiceChange(userId, deviceId, amount, provider, status, orderId){
  await supabase.from('voice_changes').insert({ user_id: userId, device_id: deviceId, amount, provider, status, order_id: orderId || null })
}
module.exports.setDeviceVoice = setDeviceVoice
module.exports.getDeviceVoice = getDeviceVoice
module.exports.recordVoiceChange = recordVoiceChange

async function clearDeviceVoice(userId, deviceId){
  await supabase.from('devices').update({ voice_id: null, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('device_id', deviceId)
}
async function setUserPlan(userId, plan){
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`
  const { data: updated } = await supabase.from('users').update({ plan }).eq('google_id', userId).select('id')
  if (!updated || updated.length === 0) {
    await supabase.from('users').insert({ google_id: userId, plan, daily_chars: 0, last_reset: monthStart })
  }
}
module.exports.clearDeviceVoice = clearDeviceVoice
module.exports.setUserPlan = setUserPlan

// Simple TTS cache (keyed by hash): assumes table tts_cache(key text primary key, audio text, content_type text, provider text, updated_at timestamp)
async function getCachedTts(key){
  if (!supabase) return null
  try{
    const { data } = await supabase.from('tts_cache').select('audio,content_type,provider').eq('key', key).single()
    if (data && data.audio) return { audio: data.audio, contentType: data.content_type || 'audio/mpeg', provider: data.provider || 'cache' }
    return null
  } catch(e){ return null }
}

async function putCachedTts(key, audioBase64, contentType, provider){
  if (!supabase || !key || !audioBase64) return
  try{
    await supabase.from('tts_cache').upsert({
      key,
      audio: audioBase64,
      content_type: contentType || 'audio/mpeg',
      provider: provider || 'unknown',
      updated_at: new Date().toISOString()
    })
  } catch(e){}
}

module.exports.getCachedTts = getCachedTts
module.exports.putCachedTts = putCachedTts

// Simple token bucket rate-limit per minute, backed by Supabase
async function checkRateLimit(userId, tokens, plan){
  if (!userId) return false
  try{
    const now = Date.now()
    const minute = Math.floor(now / 60000)
    // Match RapidAPI pricing: Pro = 500 tokens/minute
    const bucket = plan === 'premium' || plan === 'executive_pro_annual' ? 1000 : 
                   (plan === 'team' ? 800 : 
                   (plan === 'pro' ? 500 :        // Exact match RapidAPI Pro
                   (plan === 'standard' ? 300 : 
                   (plan === 'basic' ? 200 : 100)))) // Free: 100, Basic: 200
    const { data } = await supabase.from('rate_limits').select('minute,used').eq('user_id', userId).single()
    let used = 0, currentMinute = minute
    if (data && data.minute === minute){ used = data.used || 0 }
    else { used = 0 }
    if (used + tokens > bucket){ return false }
    if (data){ await supabase.from('rate_limits').update({ minute, used: used + tokens }).eq('user_id', userId) }
    else { await supabase.from('rate_limits').insert({ user_id: userId, minute, used: tokens }) }
    return true
  } catch (e){ return failOpenLimiters }
}

module.exports.checkRateLimit = checkRateLimit
module.exports.PROVIDER_REQUEST_LIMITS = PROVIDER_REQUEST_LIMITS

async function logOsEvent(userId, kind, data){
  try{
    await supabase.from('cyan_os_events').insert({
      user_id: userId,
      kind,
      data: data || {},
      created_at: new Date().toISOString()
    })
  } catch (e) {}
}

module.exports.logOsEvent = logOsEvent
