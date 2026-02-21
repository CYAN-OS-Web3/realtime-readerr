const { SpeechClient } = require('@google-cloud/speech');

// Lazy initialization of Google Speech client
let speechClient = null;

function getSpeechClient() {
  if (!speechClient) {
    // Check if credentials are provided as JSON string or file path
    const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    
    let clientConfig = {
      projectId: process.env.GOOGLE_PROJECT_ID || null
    };
    
    // If credentials look like JSON (starts with {), parse them
    if (credentials && credentials.trim().startsWith('{')) {
      try {
        const credentialsObj = JSON.parse(credentials);
        clientConfig.credentials = credentialsObj;
      } catch (e) {
        console.error('Failed to parse GOOGLE_APPLICATION_CREDENTIALS JSON:', e);
        // Fallback to file path
        clientConfig.keyFilename = credentials;
      }
    } else if (credentials) {
      // Use as file path
      clientConfig.keyFilename = credentials;
    }
    
    speechClient = new SpeechClient(clientConfig);
  }
  return speechClient;
}

async function recognizeSpeech(req, res) {
  const startMs = Date.now();
  const ctx = req.cyan || { requestId: null, sessionId: null, userId: null, deviceId: null, startMs };
  
  try {
    const { audio, language = 'vi-VN', sampleRate = 48000 } = req.body;
    
    if (!audio) {
      return res.status(400).json({ error: 'missing_audio_data' });
    }

    const request = {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: sampleRate,
        languageCode: language,
        enableAutomaticPunctuation: true,
        model: 'latest_short'
      },
      audio: {
        content: audio
      }
    };

    const client = getSpeechClient();
    const [response] = await client.recognize(request);
    const transcript = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    const totalMs = Date.now() - startMs;
    
    res.json({
      transcript,
      confidence: response.results[0]?.alternatives[0]?.confidence || 0,
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

    const request = {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: parseInt(sampleRate),
        languageCode: language,
        enableAutomaticPunctuation: true,
        model: 'latest_short',
        enableInterimResults: true
      }
    };

    const client = getSpeechClient();
    const recognizeStream = client.streamingRecognize(request)
      .on('error', (error) => {
        console.error('STT Stream Error:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      })
      .on('data', (data) => {
        const result = {
          transcript: data.results[0]?.alternatives[0]?.transcript || '',
          isFinal: data.results[0]?.isFinal || false,
          confidence: data.results[0]?.alternatives[0]?.confidence || 0
        };
        
        res.write(`data: ${JSON.stringify(result)}\n\n`);
        
        if (result.isFinal) {
          recognizeStream.end();
        }
      })
      .on('end', () => {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      });

    // Handle incoming audio data
    req.on('data', (chunk) => {
      if (recognizeStream.writable) {
        recognizeStream.write(chunk);
      }
    });

    req.on('end', () => {
      recognizeStream.end();
    });

    req.on('close', () => {
      recognizeStream.destroy();
    });

  } catch (error) {
    const totalMs = Date.now() - startMs;
    console.error('STT Stream Setup Error:', error);
    
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
