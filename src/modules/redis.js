module.exports = {
  name: 'redis',
  image: 'redis:latest',
  languages: {
    nodejs: ['redis', 'ioredis'],
    python: ['redis'],
    php: ['phpredis'],
    ruby: ['redis']
  },
  ports: [6379]
}
