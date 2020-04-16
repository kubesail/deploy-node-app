const fs = require('fs')
const path = require('path')

module.exports = {
  name: 'python',
  image: 'python',
  detect: (dir) => {
    return fs.existsSync(path.join(dir, './requirements.txt'))
  }
}
