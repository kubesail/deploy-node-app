const fs = require('fs')
const util = require('util')
const inquirer = require('inquirer')
const { confirmWriteFile } = require('../util2')

const readFile = util.promisify(fs.readFile)
const npmPackages = ['webpack', 'react']

module.exports = {
  name: 'nginx',
  image: 'nginx',
  detect: async () => {
    // Look for common node.js based frontend packages
    let looksLikeFrontend = false
    if (fs.existsSync('./package.json')) {
      try {
        const packageJson = JSON.parse(fs.readFile('./package.json'))
        looksLikeFrontend = npmPackages.find(pkg =>
          Object.keys(packageJson.dependencies).includes(pkg)
        )
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
  readConfig: async () => {
    let packageJson = {}
    try {
      packageJson = JSON.parse((await readFile('./package.json')).toString())
    } catch (_err) {}
    const config = packageJson['deploy-node-app'] || {}
    if (!config.name) config.name = packageJson.name
    config.ports = [8000]
    return config
  },
  writeConfig: async (config, options) => {
    let packageJson = {}
    try {
      packageJson = JSON.parse((await readFile('./package.json')).toString())
    } catch (_err) {}
    packageJson['deploy-node-app'] = config
    await confirmWriteFile('./package.json', JSON.stringify(packageJson, null, 2) + '\n', {
      ...options,
      update: true
    })
  }
}
