const supa = require('./lib/supabase')
const PLANS = [
  { id:'free', name:'Free', limit:20000, features:['TTS chuẩn','Không clone giọng'] },
  { id:'basic', name:'Basic', limit:200000, features:['TTS chất lượng','Không clone giọng'] },
  { id:'standard', name:'Standard', limit:800000, features:['TTS chất lượng','Clone giọng cơ bản'] },
  { id:'pro', name:'Pro', limit:1500000, features:['TTS cao cấp','Clone giọng nâng cao'] },
  { id:'team', name:'Team', limit:3000000, features:['Team usage','Clone giọng nâng cao'] },
  { id:'executive_pro_annual', name:'Executive Pro Annual', limit:5000000, features:['Lowest latency','ElevenLabs unlimited'] }
]
function findPlanLimit(planId){ const p = PLANS.find(x=>x.id===planId); return p ? p.limit : PLANS[0].limit }
async function getQuota(req,res){
  try{
    const userId = req.query.user_id || '';
    if(!userId) return res.status(400).json({ error:'missing_user_id' });

    let user = null;
    try{
      const r1 = await supa.client.from('users').select('daily_chars,last_reset,plan').eq('google_id', userId).single();
      user = r1 && r1.data ? r1.data : null;
    } catch(e){ user = null }

    if(!user){
      try{
        const monthStart = `${new Date().toISOString().slice(0, 7)}-01`
        const created = await supa.client
          .from('users')
          .insert({ google_id: userId, plan: 'free', daily_chars: 0, last_reset: monthStart })
          .select('daily_chars,last_reset,plan')
          .single()
        user = created && created.data ? created.data : null
      } catch(e){ user = null }
    }

    if(!user) return res.status(404).json({ error:'user_not_found' });

    const plan = user.plan || 'free';
    const limit = findPlanLimit(plan);
    const used = user.daily_chars || 0;
    if (plan === 'free'){
      const usage = used;
      return res.json({ plan, usage, limit, percent: Math.min(100, Math.round((usage/limit)*100)) })
    }
    const monthKey = new Date().toISOString().slice(0,7);
    const last = user.last_reset ? String(user.last_reset).slice(0,7) : monthKey
    const usage = (last === monthKey) ? used : 0;
    res.json({ plan, usage, limit, percent: Math.min(100, Math.round((usage/limit)*100)) })
  }catch(e){
    res.status(500).json({ error:'server_error' })
  }
}
function getPlans(req,res){ res.json({ plans: PLANS }) }
async function getHistory(req,res){ try{ const userId = req.query.user_id || ''; if(!userId) return res.status(400).json({ error:'missing_user_id' }); const { data, error } = await supa.client.from('translations').select('id,text,language,chars,meta,created_at').eq('user_id', userId).order('created_at',{ ascending:false }).limit(100); if(error) return res.status(500).json({ error:'server_error' }); res.json({ items: data || [] }) }catch(e){ res.status(500).json({ error:'server_error' }) } }
module.exports = { getQuota, getPlans }
module.exports.getHistory = getHistory
