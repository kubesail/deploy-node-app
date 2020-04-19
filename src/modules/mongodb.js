
const { promptUserForValue, generateRandomStr } = require('../util')

module.exports = {
  name: 'mongodb',
  image: 'mongo:latest',
  languages: {
    nodejs: ['mongodb', 'mongoose'],
    python: ['pymongo'],
    php: ['mongodb'],
    ruby: ['mongo']
  },
  ports: [27017],
  envs: {
    MONGO_INITDB_ROOT_USERNAME: promptUserForValue({
      name: 'MONGO_INITDB_ROOT_USERNAME',
      defaultToProjectName: true
    }),
    MONGO_INITDB_ROOT_PASSWORD: generateRandomStr()
  }
}
