
const express = require('express')
const app = express()

const Redis = require('redis')
const redis = Redis.createClient({ host: 'redis' })

app.get('/', (_req, res) => {
  redis.get('nodejs-counter', (err, reply) => {
    if (err) {
      console.error(err)
      return res.sendStatus(500)
    }
    res.send(`Hello World from redis! Hit count: "${reply || 0}"`)
    redis.incr('nodejs-counter')
  })
})

app.listen(8000, () => process.stdout.write('A simple Node.js example app with Redis!\n'))
