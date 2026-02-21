const { createClient } = require('@supabase/supabase-js');

// Cấu hình - bạn cần điền thông tin thực tế
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function testSupabaseConnection() {
  console.log('🔍 Testing Supabase connection...');
  console.log('URL:', SUPABASE_URL);
  console.log('Key:', SUPABASE_SERVICE_KEY ? 'Set' : 'Not set');
  
  try {
    // Test 1: Check users table
    console.log('\n📊 Testing users table...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, google_id, plan, daily_chars, last_reset')
      .limit(5);
    
    if (usersError) {
      console.log('❌ Users table error:', usersError.message);
    } else {
      console.log('✅ Users table OK');
      console.log(`   Found ${users.length} users`);
      users.forEach(user => {
        console.log(`   - ${user.google_id || 'No google_id'}: ${user.plan || 'free'} (${user.daily_chars || 0}/${20000} chars)`);
      });
    }
    
    // Test 2: Check NOWPayments logs
    console.log('\n💳 Testing NOWPayments logs...');
    const { data: logs, error: logsError } = await supabase
      .from('nowpayments_ipn_logs')
      .select('payment_id, payment_status, order_id, received_at')
      .order('received_at', { ascending: false })
      .limit(5);
    
    if (logsError) {
      console.log('❌ NOWPayments logs error:', logsError.message);
    } else {
      console.log('✅ NOWPayments logs OK');
      console.log(`   Found ${logs.length} recent logs`);
      logs.forEach(log => {
        console.log(`   - Payment ${log.payment_id}: ${log.payment_status} (${log.received_at})`);
      });
    }
    
    // Test 3: Check voice changes
    console.log('\n🎤 Testing voice changes...');
    const { data: voices, error: voicesError } = await supabase
      .from('voice_changes')
      .select('user_id, provider, status, amount, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (voicesError) {
      console.log('❌ Voice changes error:', voicesError.message);
    } else {
      console.log('✅ Voice changes OK');
      console.log(`   Found ${voices.length} voice changes`);
      voices.forEach(voice => {
        console.log(`   - ${voice.user_id}: ${voice.provider} - ${voice.status} ($${voice.amount || 0})`);
      });
    }
    
    // Test 4: Check rate limits
    console.log('\n⚡ Testing rate limits...');
    const { data: limits, error: limitsError } = await supabase
      .from('rate_limits')
      .select('user_id, minute, used')
      .limit(5);
    
    if (limitsError) {
      console.log('❌ Rate limits error:', limitsError.message);
    } else {
      console.log('✅ Rate limits OK');
      console.log(`   Found ${limits.length} rate limit records`);
    }
    
    // Test 5: Insert test record
    console.log('\n➕ Testing insert...');
    const testUser = {
      google_id: 'test-' + Date.now(),
      plan: 'free',
      daily_chars: 0,
      last_reset: new Date().toISOString().slice(0, 10)
    };
    
    const { data: inserted, error: insertError } = await supabase
      .from('users')
      .insert(testUser)
      .select()
      .single();
    
    if (insertError) {
      console.log('❌ Insert error:', insertError.message);
    } else {
      console.log('✅ Insert OK');
      console.log(`   Created user: ${inserted.google_id}`);
      
      // Clean up test record
      await supabase.from('users').delete().eq('google_id', testUser.google_id);
      console.log('   ✅ Cleaned up test record');
    }
    
  } catch (err) {
    console.log('❌ Connection error:', err.message);
  }
}

// Run tests
testSupabaseConnection().then(() => {
  console.log('\n✅ Supabase testing completed!');
}).catch(err => {
  console.log('\n❌ Testing failed:', err);
});
