module.exports = {
  name: 'redis',
  image: 'redis:latest',
  languages: {
    nodejs: ['redis', 'ioredis'],
    python: ['redis']
  },
  ports: [6379]
}
