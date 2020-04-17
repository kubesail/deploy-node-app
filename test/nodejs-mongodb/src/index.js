
const express = require('express')
const app = express()

app.get('/', (_req, res) => res.send('Hello World from MongoDB!'))

app.listen(8000, () => process.stdout.write('A simple Node.js example app with MongoDB!\n'))
