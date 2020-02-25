function promptUserForPassword () {}

module.exports = {
  name: 'postgres',
  image: 'postgres:latest',
  languages: {
    nodejs: ['pg'],
    python: ['psycopg2']
  },
  ports: [5432],
  envs: {
    POSTGRES_PASSWORD: promptUserForPassword()
  }
}
