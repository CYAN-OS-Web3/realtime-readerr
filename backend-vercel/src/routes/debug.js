function debugEnv(req, res) {
  res.json({
    'GOOGLE_SPEECH_API_KEY': {
      exists: !!process.env.GOOGLE_SPEECH_API_KEY,
      length: process.env.GOOGLE_SPEECH_API_KEY?.length || 0,
      prefix: process.env.GOOGLE_SPEECH_API_KEY?.substring(0, 10) + '...'
    },
    'GOOGLE_PROJECT_ID': process.env.GOOGLE_PROJECT_ID,
    'GOOGLE_APPLICATION_CREDENTIALS': {
      exists: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
      length: process.env.GOOGLE_APPLICATION_CREDENTIALS?.length || 0,
      prefix: process.env.GOOGLE_APPLICATION_CREDENTIALS?.substring(0, 50) + '...'
    },
    'NODE_ENV': process.env.NODE_ENV,
    'VERCEL_ENV': process.env.VERCEL_ENV
  });
}

module.exports = { debugEnv };
