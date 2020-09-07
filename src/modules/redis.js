module.exports = {
  name: 'redis',
  image: 'redis:latest',
  languages: {
    nodejs: ['redis', 'ioredis', 'redis-streams-aggregator'],
    python: ['redis'],
    php: ['phpredis'],
    ruby: ['redis']
  },
  ports: [6379]
}
