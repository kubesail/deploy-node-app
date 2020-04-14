
const { generateRandomStr } = require('../util')

module.exports = {
  name: 'postgres',
  image: 'postgres:latest',
  languages: {
    nodejs: ['pg'],
    python: ['psycopg2']
  },
  ports: [5432],
  envs: {
    POSTGRES_PASSWORD: generateRandomStr(),
    POSTGRES_PORT: 5432
  }
}
