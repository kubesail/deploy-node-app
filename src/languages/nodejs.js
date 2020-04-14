const fs = require('fs')
const util = require('util')
const path = require('path')
const { confirmWriteFile } = require('../util')

const readFile = util.promisify(fs.readFile)

module.exports = {
  name: 'nodejs',
  image: 'node',
  command: 'node',

  detect: () => {
    return fs.existsSync('./package.json')
  },

  dockerfile: ({ entrypoint }) => {
    return `FROM node:${process.versions.node.split('.')[0]}
WORKDIR /app

RUN useradd nodejs && \
    chown -R nodejs /app && \
    chown -R nodejs /home/nodejs

COPY package.json yarn.loc[k] .npmr[c] ./
RUN yarn install --production

COPY --chown=nodejs . ./

CMD ["node", "${entrypoint}"]`
  },

  readConfig: async () => {
    let packageJson = {}
    try {
      packageJson = JSON.parse(await readFile('./package.json'))
    } catch (_err) {}
    const config = packageJson['deploy-node-app'] || {}
    if (!config.name) config.name = packageJson.name
    return config
  },

  writeConfig: async function (config, options) {
    const packageJson = await this.readConfig()
    packageJson['deploy-node-app'] = config
    await confirmWriteFile('./package.json', JSON.stringify(packageJson, null, 2) + '\n', {
      ...options,
      update: true
    })
  },

  matchModules: async function (modules) {
    const packageJson = JSON.parse(await readFile('./package.json'))
    const dependencies = Object.keys(packageJson.dependencies || [])
    // Don't bother loading module dependencies if we have no dependencies
    if (dependencies.length === 0) return []
    const matchedModules = []
    for (let i = 0; i < dependencies.length; i++) {
      const dep = dependencies[i]
      const mod = modules.find(mod => {
        return mod.languages && mod.languages[this.name] && mod.languages[this.name].includes(dep)
      })
      if (mod) matchedModules.push(mod)
    }
    return matchedModules
  }
}
