const fs = require('fs')

module.exports = {
  name: 'python',
  image: 'python',
  detect: () => {
    return fs.existsSync('./requirements.txt')
  }
}
