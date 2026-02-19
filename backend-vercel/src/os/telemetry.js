const supa = require('../lib/supabase')

async function logEvent(ctx, kind, data){
  try{
    await supa.logOsEvent(ctx && ctx.userId ? ctx.userId : null, kind, {
      request_id: ctx && ctx.requestId ? ctx.requestId : null,
      session_id: ctx && ctx.sessionId ? ctx.sessionId : null,
      device_id: ctx && ctx.deviceId ? ctx.deviceId : null,
      consumer: ctx && ctx.consumer ? ctx.consumer : null,
      ...data
    })
  } catch (e) {}
}

module.exports = { logEvent }
