const fs = require('fs')
const util = require('util')
const { confirmWriteFile } = require('../util2')

const readFile = util.promisify(fs.readFile)

module.exports = {
  name: 'nodejs',
  image: 'node',
  command: 'node',
  detectVersion: () => {
    return process.versions.node.split('.')[0]
  },
  detect: () => {
    return fs.existsSync('./package.json')
  },
  readConfig: async () => {
    let packageJson = {}
    try {
      packageJson = JSON.parse((await readFile('./package.json')).toString())
    } catch (_err) {}
    const config = packageJson['deploy-node-app'] || {}
    if (!config.name) config.name = packageJson.name
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
  },
  matchModules: async modules => {
    let packageJson
    try {
      packageJson = (await readFile('./package.json')).toString()
    } catch (_err) {}
    if (!packageJson || typeof packageJson !== 'object') return []
    const dependencies = Object.keys(packageJson.dependencies || [])

    // Don't bother loading module dependencies if we have no dependencies
    if (dependencies.length === 0) return []

    const matchedModules = []
    for (let i = 0; i < dependencies.length; i++) {
      const dep = dependencies[i]
      const mod = modules.find(mod => {
        return mod.npmNames && mod.npmNames.includes(dep)
      })
      if (mod) matchedModules.push(mod)
    }
    return matchedModules
  }
}
