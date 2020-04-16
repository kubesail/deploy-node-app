const fs = require('fs')
const inquirer = require('inquirer')
const { confirmWriteFile, readConfig } = require('../util')
const npmPackages = ['webpack', 'react']

module.exports = {
  name: 'nginx',
  image: 'nginx',
  detect: async () => {
    // Look for common node.js based frontend packages
    let looksLikeFrontend = false
    if (fs.existsSync('./package.json')) {
      try {
        const packageJson = JSON.parse(fs.readFileSync('./package.json'))
        looksLikeFrontend = !!npmPackages.find(pkg => {
          return Object.keys(packageJson.dependencies).includes(pkg)
        })
      } catch {}
    }

    // If there is a /public folder, they may just want to deploy that (completely static site, with no build pipeline?)
    if (fs.existsSync('./public/index.html') || fs.existsSync('./public/index.htm')) {
      looksLikeFrontend = true
    }

    if (looksLikeFrontend) {
      const { useNginx } = await inquirer.prompt([
        {
          name: 'useNginx',
          type: 'confirm',
          message: 'This project looks like it might be a static site, would you like to use nginx?'
        }
      ])
      return useNginx
    }

    return false
  },
  dockerfile: ({ entrypoint }) => 'FROM nginx\n\nCOPY . /usr/share/html/',
  writeConfig: async function (config, options) {
    const packageJson = await readConfig()
    packageJson['deploy-node-app'] = config
    await confirmWriteFile('./package.json', JSON.stringify(packageJson, null, 2) + '\n', {
      ...options,
      update: true
    })
  }
}
