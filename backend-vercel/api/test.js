// Minimal test endpoint for debugging
module.exports = (req, res) => {
  try {
    console.log('🔍 Test endpoint called')
    console.log('Method:', req.method)
    console.log('Headers:', Object.keys(req.headers))
    
    // Test basic imports
    try {
      require('jsonwebtoken')
      console.log('✅ JWT library available')
    } catch (e) {
      console.log('❌ JWT library missing:', e.message)
    }
    
    try {
      require('google-auth-library')
      console.log('✅ Google Auth library available')
    } catch (e) {
      console.log('❌ Google Auth library missing:', e.message)
    }
    
    // Test environment variables
    const envVars = ['JWT_SECRET', 'GOOGLE_CLIENT_ID', 'SUPABASE_URL']
    const envStatus = {}
    
    envVars.forEach(varName => {
      envStatus[varName] = process.env[varName] ? 'SET' : 'NOT SET'
    })
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: envStatus,
      libraries: {
        jwt: require('jsonwebtoken') ? 'available' : 'missing',
        googleAuth: require('google-auth-library') ? 'available' : 'missing'
      }
    })
    
  } catch (error) {
    console.error('❌ Test endpoint error:', error)
    res.status(500).json({
      error: 'Test endpoint failed',
      message: error.message
    })
  }
}
