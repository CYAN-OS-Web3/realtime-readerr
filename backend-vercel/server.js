require('dotenv').config()
const handler = require('./api/index')
const express = require('express')
const app = express()
// Mount the Vercel handler as express middleware
app.use((req, res) => handler(req, res))
const port = process.env.PORT || 3000
app.listen(port, () => console.log('API listening on ' + port))
