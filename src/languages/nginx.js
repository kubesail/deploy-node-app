const fs = require('fs')

const npmPackages = ['webpack', 'react']

module.exports = {
  name: 'nginx',
  detect: () => {
    // Look for common node.js based frontend packages
    if (fs.existsSync('./package.json')) {
      try {
        const packageJson = JSON.parse(fs.readFile('./package.json'))
        return npmPackages.find(pkg => Object.keys(packageJson.dependencies).includes(pkg))
      } catch {}
    }

    // If there is a /public folder, they may just want to deploy that (completely static site, with no build pipeline?)
    if (fs.existsSync('./public/index.html') || fs.existsSync('./public/index.htm')) {
      return true
    }

    return false
  }
}
