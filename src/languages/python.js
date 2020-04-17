const fs = require('fs')
const path = require('path')

module.exports = {
  name: 'python',
  image: 'python',
  dockerfile: ({ entrypoint }) => 'FROM nginx\n\nCOPY . /usr/share/html/',
  detect: (options) => {
    return fs.existsSync(path.join(options.target, 'requirements.txt'))
  }
}
