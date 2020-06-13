
// Simple mongodb powered webserver example!

const express = require('express')
const app = express()
const MongoClient = require('mongodb').MongoClient

// Connection URL
const username = process.env.MONGO_INITDB_ROOT_USERNAME
const password = process.env.MONGO_INITDB_ROOT_PASSWORD
const database = process.env.MONGO_INITDB_DATABASE
const url = `mongodb://${username}:${password}@mongodb:27017`

MongoClient.connect(url, { useUnifiedTopology: true }, function (err, client) {
  if (err) {
    console.error('Failed to connect to MongoDB! Retrying...', err)
    return setTimeout(() => { process.exit(2) }, 3000)
  }
  const db = client.db(database)
  const hitcounter = db.collection('hitcounter')

  // Simple mongo powered view-counter to show mongodb is working properly!
  app.get('/', (_req, res) => {
    hitcounter.findOneAndUpdate(
      { page: '/' },
      { $inc: { views: 1 } },
      { upsert: true },
      function (err, doc) {
        if (err) throw err
        const views = doc.value ? doc.value.views : 0
        const message = `Hello World from MongoDB! View count: ${views + 1}\n`
        process.stdout.write(message)
        res.send(message)
      })
  })
  app.listen(8000, () => process.stdout.write('A simple Node.js example app with MongoDB!\n'))
})
