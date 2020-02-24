const fs = require('fs')

module.exports = {
  name: 'nodejs',
  image: 'node',
  detectVersion: () => {
    return process.versions.node.split('.')[0]
  },
  detect: () => {
    return fs.existsSync('./package.json')
  }
}
