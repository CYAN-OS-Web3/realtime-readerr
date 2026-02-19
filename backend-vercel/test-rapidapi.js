#!/usr/bin/env node
/**
 * RapidAPI Readiness Test
 * Run: node test-rapidapi.js
 * Ensure all env vars are set (copy .env.example to .env and fill)
 */
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const fetch = require('node-fetch')

const BASE = process.env.API_BASE || 'http://localhost:3000'
const TEST_USER_ID = process.env.TEST_USER_ID || 'test-user-123'
const TEST_DEVICE_ID = process.env.TEST_DEVICE_ID || 'test-device-001'

function log(name, ms, extra = {}) {
  console.log(`[${name}] ${ms}ms`, extra)
}

function randText() {
  const msgs = ['Hello world', 'Quick test', 'Cyan OS-lite demo', 'RapidAPI check']
  return msgs[Math.floor(Math.random() * msgs.length)]
}

async function health() {
  const start = Date.now()
  const r = await fetch(`${BASE}/api/health`)
  const ms = Date.now() - start
  if (!r.ok) throw new Error(`Health failed: ${r.status}`)
  const body = await r.json()
  log('Health', ms, body)
}

async function prewarm() {
  const start = Date.now()
  const r = await fetch(`${BASE}/api/_prewarm`)
  const ms = Date.now() - start
  if (!r.ok) throw new Error(`Prewarm failed: ${r.status}`)
  const body = await r.json()
  log('Prewarm', ms, body)
}

async function osStatus() {
  const start = Date.now()
  const r = await fetch(`${BASE}/api/os/status`)
  const ms = Date.now() - start
  if (!r.ok) throw new Error(`OS status failed: ${r.status}`)
  const body = await r.json()
  log('OS Status', ms, body)
}

async function speak() {
  const start = Date.now()
  const r = await fetch(`${BASE}/api/tts/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: null, // Skip quota for test
      device_id: TEST_DEVICE_ID,
      text: randText(),
      language: 'en-US',
      gender: 'female'
    })
  })
  const ms = Date.now() - start
  if (!r.ok) throw new Error(`Speak failed: ${r.status} ${await r.text()}`)
  const buf = await r.buffer()
  log('Speak', ms, { sizeBytes: buf.length, contentType: r.headers.get('content-type'), serverTiming: r.headers.get('server-timing') })
}

async function speakChunked() {
  const start = Date.now()
  const r = await fetch(`${BASE}/api/tts/speak-chunked`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: null, // Skip quota for test
      device_id: TEST_DEVICE_ID,
      text: 'First sentence. Second sentence. Third sentence.',
      language: 'en-US',
      gender: 'male'
    })
  })
  const ms = Date.now() - start
  if (!r.ok) throw new Error(`SpeakChunked failed: ${r.status} ${await r.text()}`)
  const buf = await r.buffer()
  log('SpeakChunked', ms, { sizeBytes: buf.length, contentType: r.headers.get('content-type'), serverTiming: r.headers.get('server-timing') })
}

async function cloneAndSpeak() {
  // Find a short sample audio file in repo or use a placeholder
  const samplePath = path.join(__dirname, '..', '..', 'demo', 'sample.mp3')
  if (!fs.existsSync(samplePath)) {
    console.warn('Skipping clone-and-speak: no sample.mp3 at', samplePath)
    return
  }
  const form = new FormData()
  form.append('sample', fs.createReadStream(samplePath), 'sample.mp3')
  form.append('user_id', null) // Skip quota for test
  form.append('text', randText())
  form.append('quality', 'high')
  const start = Date.now()
  const r = await fetch(`${BASE}/api/tts/clone-and-speak`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders()
  })
  const ms = Date.now() - start
  if (!r.ok) throw new Error(`CloneAndSpeak failed: ${r.status} ${await r.text()}`)
  const buf = await r.buffer()
  log('CloneAndSpeak', ms, { sizeBytes: buf.length, contentType: r.headers.get('content-type'), serverTiming: r.headers.get('server-timing') })
}

async function openapiSpec() {
  const start = Date.now()
  const r = await fetch(`${BASE}/api/openapi.json`)
  const ms = Date.now() - start
  if (!r.ok) throw new Error(`OpenAPI spec failed: ${r.status}`)
  const body = await r.json()
  log('OpenAPI Spec', ms, { paths: Object.keys(body.paths || {}).length, title: body.info?.title })
}

async function rapidApiProxySecret() {
  const secret = process.env.RAPIDAPI_PROXY_SECRET
  if (!secret) {
    console.warn('RAPIDAPI_PROXY_SECRET not set, skipping proxy secret test')
    return
  }
  const start = Date.now()
  const r = await fetch(`${BASE}/api/health`, {
    headers: { 'x-rapidapi-proxy-secret': secret }
  })
  const ms = Date.now() - start
  if (!r.ok) throw new Error(`Proxy secret test failed: ${r.status}`)
  const body = await r.json()
  log('ProxySecret', ms, body)
}

async function ensureTestUser() {
  // Try to create test user in Supabase (optional, ignore if fails)
  try {
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    await supabase.from('users').upsert({
      id: TEST_USER_ID,
      plan: 'premium',
      daily_chars: 0,
      last_reset: new Date().toISOString().slice(0, 10)
    }, { onConflict: 'id' })
    console.log('[Setup] Test user ensured')
  } catch (e) {
    console.warn('[Setup] Could not ensure test user:', e.message)
  }
}

async function runAll() {
  console.log('=== RapidAPI Readiness Test ===')
  console.log('Base URL:', BASE)
  console.log('Test User ID:', TEST_USER_ID)
  console.log('Test Device ID:', TEST_DEVICE_ID)
  console.log('')
  try {
    await ensureTestUser()
    await health()
    await prewarm()
    await osStatus()
    // Only run TTS tests if at least one provider is configured
    const statusRes = await fetch(`${BASE}/api/os/status`)
    const status = await statusRes.json()
    const hasProvider = status.providers && (status.providers.elevenlabs || status.providers.google || status.providers.azure)
    if (hasProvider) {
      await speak()
      await speakChunked()
      await cloneAndSpeak()
    } else {
      console.log('[Skip] No TTS providers configured; skipping TTS tests.')
    }
    await openapiSpec()
    await rapidApiProxySecret()
    console.log('\n=== All tests passed! Ready for RapidAPI ===')
  } catch (e) {
    console.error('\n=== Test failed ===')
    console.error(e.message)
    process.exit(1)
  }
}

if (require.main === module) {
  runAll()
}
module.exports = { runAll }
