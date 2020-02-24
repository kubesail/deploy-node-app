const fs = require('fs')

module.exports = {
  name: 'python',
  detect: () => {
    return fs.existsSync('./requirements.txt')
  }
}
