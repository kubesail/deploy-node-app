const fs = require('fs')
const path = require('path')

module.exports = {
  name: 'php',
  image: 'php',
  dockerfile: ({ entrypoint }) => 'FROM nginx\n\nCOPY . /usr/share/html/',
  detect: (options) => {
    return fs.existsSync(path.join(options.target, 'composer.json'))
  }
}
