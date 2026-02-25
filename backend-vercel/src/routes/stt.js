const fetch = require('node-fetch');

// Use Google Speech REST API directly instead of SDK
async function recognizeWithRestAPI(audio, language, sampleRate, options = {}) {
  const apiKey = process.env.GOOGLE_SPEECH_API_KEY;
  const projectId = process.env.GOOGLE_PROJECT_ID || 'gen-lang-client-0283634999';
  const normalizedSampleRate = Number(sampleRate) > 0 ? Number(sampleRate) : 16000;
  const { model } = options;
  
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GOOGLE_SPEECH_API_KEY environment variable is required');
  }
  
  const url = `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`;
  
  const config = {
    encoding: 'LINEAR16',
    sampleRateHertz: normalizedSampleRate,
    languageCode: language,
    enableAutomaticPunctuation: true,
    audioChannelCount: 1
  };
  if (model) {
    config.model = model;
  }

  const body = {
    config,
    audio: {
      content: audio
    }
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Google Speech API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
  }
  
  return await response.json();
}

async function recognizeSpeech(req, res) {
  const startMs = Date.now();
  const ctx = req.cyan || { requestId: null, sessionId: null, userId: null, deviceId: null, startMs };
  
  try {
    const { audio, language = 'vi-VN', sampleRate = 48000 } = req.body;
    
    if (!audio) {
      return res.status(400).json({ error: 'missing_audio_data' });
    }

    console.log('🎤 Using Google Speech REST API');
    console.log('🎤 Language:', language);
    console.log('🎤 Audio length:', audio.length);

    // Pass 1: preferred for short real-time utterances
    let result = await recognizeWithRestAPI(audio, language, sampleRate, { model: 'latest_short' });

    let transcript = result.results
      ?.map(result => result.alternatives[0]?.transcript)
      ?.join('\n') || '';

    // Pass 2 fallback: auto model selection can work better for some languages/environments
    if (!transcript.trim()) {
      result = await recognizeWithRestAPI(audio, language, sampleRate);
      transcript = result.results
        ?.map(result => result.alternatives[0]?.transcript)
        ?.join('\n') || '';
    }

    const totalMs = Date.now() - startMs;
    
    console.log('✅ Recognition successful');
    
    res.json({
      transcript,
      confidence: result.results?.[0]?.alternatives[0]?.confidence || 0,
      language,
      totalMs
    });

  } catch (error) {
    const totalMs = Date.now() - startMs;
    console.error('STT Error:', error);
    res.status(500).json({ 
      error: 'speech_recognition_failed', 
      message: error.message,
      totalMs 
    });
  }
}

async function streamSpeech(req, res) {
  const startMs = Date.now();
  const ctx = req.cyan || { requestId: null, sessionId: null, userId: null, deviceId: null, startMs };
  
  try {
    const { language = 'vi-VN', sampleRate = 48000 } = req.query;
    
    res.set('Content-Type', 'text/event-stream');
    res.set('Cache-Control', 'no-cache');
    res.set('Connection', 'keep-alive');
    res.set('Access-Control-Allow-Origin', '*');

    console.log('🎤 Streaming not supported with REST API, falling back to batch recognition');
    
    // For streaming, we'll use batch recognition with intervals
    res.write(`data: ${JSON.stringify({ error: 'Streaming not supported, use /api/stt/recognize instead' })}\n\n`);
    res.end();
    
  } catch (error) {
    const totalMs = Date.now() - startMs;
    console.error('STT Stream Error:', error);
    res.status(500).json({ 
      error: 'stream_setup_failed', 
      message: error.message,
      totalMs 
    });
  }
}

module.exports = {
  recognizeSpeech,
  streamSpeech
};
