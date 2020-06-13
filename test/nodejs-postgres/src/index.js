
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

client.connect().then(() => {
  app.listen(8000, () => process.stdout.write('A simple Node.js example app with Postgres!!\n'))
}).catch(err => {
  console.error('Failed to connect to postgres! Retrying...', err.code)
  setTimeout(() => { process.exit(2) }, 3000)
})

app.get('/', (_req, res) => {
  client.query('SELECT $1::text as message', ['Hello world!']).then(response => {
    process.stdout.write('GET /\n')
    res.send(`Hello World from Postgres: ${response.rows[0].message}`)
  })
})
