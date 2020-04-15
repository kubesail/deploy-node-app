
const { promptUserForValue } = require('../util')

module.exports = {
  name: 'elasticsearch',
  image: 'elasticsearch:latest',
  languages: {
    nodejs: ['@elastic/elasticsearch', 'elasticsearch'],
    python: ['elasticsearch'],
    php: ['elasticsearch/elasticsearch'],
    ruby: ['elasticsearch']
  },
  ports: [9200, 9300],
  envs: {
    'discovery.type': 'single-node',
    ES_JAVA_OPTS: '-Xms256m -Xmx256m',
    TZ: promptUserForValue({ name: 'Timezone (TZ)', defaultValue: 'America/Los_Angeles' })
  }
}
