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
  free: 20000,
  basic: 200000,
  standard: 800000,
  pro: 1500000,
  team: 3000000,
  executive_pro_annual: 5000000,
  premium: 5000000
}
const ELEVEN_CREDITS = { pro: 300000, team: 1000000, executive_pro_annual: 200000 }

const failOpenLimiters = (process.env.FAIL_OPEN_LIMITERS || '').toString().trim().toLowerCase() === 'true'

async function checkAndIncrementQuota(userId, chars, tier = 'standard') {
  if (!userId) return false
  let user = null
  try {
    const r = await supabase.from('users').select('daily_chars,last_reset,plan').eq('google_id', userId).single()
    user = r && r.data ? r.data : null
  } catch (_) {
    user = null
  }

  if (!user) {
    try {
      const monthStart = `${new Date().toISOString().slice(0, 7)}-01`
      const created = await supabase
        .from('users')
        .insert({ google_id: userId, plan: 'free', daily_chars: 0, last_reset: monthStart })
        .select('daily_chars,last_reset,plan')
        .single()
      user = created && created.data ? created.data : null
    } catch (_) {
      user = null
    }
  }

  if (!user) return false

  const plan = user.plan || 'free'
  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free
  let used = user.daily_chars || 0

  if (plan === 'free'){
    if (used + chars > limit) return false
    await supabase.from('users').update({ daily_chars: used + chars }).eq('google_id', userId)
    return true
  }

  const monthKey = new Date().toISOString().slice(0, 7)
  const last = user.last_reset ? String(user.last_reset).slice(0, 7) : monthKey
  if (last !== monthKey) used = 0
  if (used + chars > limit) return false
  await supabase.from('users').update({ daily_chars: used + chars, last_reset: `${monthKey}-01` }).eq('google_id', userId)
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
  try{
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

// Simple token bucket rate-limit per minute, backed by Supabase
async function checkRateLimit(userId, tokens, plan){
  if (!userId) return false
  try{
    const now = Date.now()
    const minute = Math.floor(now / 60000)
    const bucket = plan === 'premium' || plan === 'executive_pro_annual' ? 2000 : (plan === 'team' ? 1600 : (plan === 'pro' ? 1200 : 600))
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
