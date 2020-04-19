const fs = require('fs')
const path = require('path')

module.exports = {
  name: 'ruby',
  dockerfile: ({ entrypoint }) => 'FROM nginx\n\nCOPY . /usr/share/html/',
  detect: (options) => {
    return fs.existsSync(path.join(options.target, 'Gemfile'))
  }
}
