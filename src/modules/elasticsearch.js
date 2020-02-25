module.exports = {
  name: 'elasticsearch',
  image: 'elasticsearch:latest',
  languages: {
    nodejs: ['@elastic/elasticsearch', 'elasticsearch'],
    python: ['elasticsearch']
  },
  ports: [9200, 9300],
  envs: {
    'discovery.type': 'single-node'
  }
}
