
const express = require('express')
const { Client } = require('pg')

const client = new Client({
  user: process.env.POSTGRES_USER,
  host: 'postgres',
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT
})
const app = express()
client.connect()

app.get('/', (_req, res) => {
  client.query('SELECT $1::text as message', ['Hello world!']).then((err, res) => {
    if (err) {
      console.error(err)
      res.sendStatus(500)
    }
    res.send(`Hello World from Postgres: ${res.rows[0].message}`)
  })
})

app.listen(8000, () => process.stdout.write('A simple Node.js example app with Postgres!\n'))
