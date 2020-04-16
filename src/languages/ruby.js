const fs = require('fs')
const path = require('path')

module.exports = {
  name: 'ruby',
  image: 'ruby',
  dockerfile: ({ entrypoint }) => 'FROM nginx\n\nCOPY . /usr/share/html/',
  detect: (dir) => {
    console.log('checking for ', path.join(dir, 'Gemfile'))
    return fs.existsSync(path.join(dir, 'Gemfile'))
  }
}
