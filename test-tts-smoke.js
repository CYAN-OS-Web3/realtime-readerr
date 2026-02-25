const https = require('https');

const BACKEND_URL = 'https://translator-backend-pi.vercel.app';
const TEST_TEXT = 'Hello world, this is a test.';
const USER_ID = 'test-smoke-user';

// Helper to detect if response is binary audio vs JSON error
function isBinaryResponse(res) {
  const ct = (res.headers['content-type'] || '').toLowerCase();
  return ct.startsWith('audio/') || ct.startsWith('application/octet-stream');
}

async function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: new URL(BACKEND_URL).hostname,
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      if (isBinaryResponse(res)) {
        // Binary audio response
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, audio: buf, contentType: res.headers['content-type'] });
        });
      } else {
        // JSON response
        res.setEncoding('utf8');
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const json = JSON.parse(chunks.join(''));
            resolve({ status: res.statusCode, json });
          } catch (e) {
            resolve({ status: res.statusCode, raw: chunks.join('') });
          }
        });
      }
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function testEngine(engine, endpoint = '/api/tts/speak') {
  console.log(`\n=== Testing ${engine} via ${endpoint} ===`);
  try {
    const result = await postJson(endpoint, {
      text: TEST_TEXT,
      language: 'en-US',
      gender: 'female',
      user_id: USER_ID,
      device_id: USER_ID,
      tts_engine: engine,
    });
    if (result.audio && result.audio.length > 0) {
      console.log(`✅ ${engine} OK: audio ${result.audio.length} bytes, content-type ${result.contentType}`);
      return true;
    } else if (result.json && result.json.audio) {
      console.log(`✅ ${engine} OK: base64 audio length ${result.json.audio.length}`);
      return true;
    } else {
      console.log(`❌ ${engine} FAIL:`, result.json || result.raw || result);
      return false;
    }
  } catch (e) {
    console.log(`❌ ${engine} ERROR:`, e && e.message ? e.message : e);
    return false;
  }
}

(async () => {
  console.log('TTS Smoke Test (backend-deployed)');
  console.log('Backend:', BACKEND_URL);
  console.log('Test text:', TEST_TEXT);
  console.log('User ID:', USER_ID);

  const results = [];
  results.push({ engine: 'google', ok: await testEngine('google') });
  results.push({ engine: 'azure', ok: await testEngine('azure') });
  results.push({ engine: 'elevenlabs', ok: await testEngine('elevenlabs') });

  // Optional: test Eleven PCM stream endpoint
  results.push({ engine: 'elevenlabs-pcm', ok: await testEngine('elevenlabs', '/api/tts/speak-pcm-stream') });

  console.log('\n--- Summary ---');
  results.forEach(r => console.log(`${r.ok ? '✅' : '❌'} ${r.engine}`));
  const passCount = results.filter(r => r.ok).length;
  console.log(`Pass: ${passCount}/${results.length}`);
})().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
