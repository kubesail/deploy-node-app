const fs = require('fs')
const util = require('util')
const path = require('path')
const { confirmWriteFile, readConfig } = require('../util')

const readFile = util.promisify(fs.readFile)

module.exports = {
  name: 'nodejs',
  image: 'node',
  command: 'node',

  detect: (dir) => {
    const pkgPath = path.join(dir, './package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(pkgPath))
        if (packageJson && packageJson.name && packageJson.version) return true
      } catch {}
    }
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

  writeConfig: async function (config, options) {
    const packageJson = await readConfig()
    packageJson['deploy-node-app'] = config
    await confirmWriteFile('./package.json', JSON.stringify(packageJson, null, 2) + '\n', {
      ...options,
      update: true
    })
  },

  matchModules: async function (modules, options) {
    const packageJson = JSON.parse(await readFile(path.join(options.directory, './package.json')))
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
