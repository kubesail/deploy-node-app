const fs = require('fs')
const util = require('util')
const path = require('path')
const { confirmWriteFile, readConfig, writeTextLine } = require('../util')

const readFile = util.promisify(fs.readFile)

module.exports = {
  name: 'nodejs',
  image: 'node',
  command: 'node',

  detect: async (options) => {
    const pkgPath = path.join(options.target, './package.json')
    let looksLikeNode = false
    if (fs.existsSync(pkgPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(pkgPath))
        if (packageJson && packageJson.name && packageJson.version) looksLikeNode = true
      } catch {}
    }
    if (looksLikeNode) {
      await writeTextLine('.gitignore', 'node_modules', { ...options, append: true })
      await writeTextLine('.dockerignore', 'node_modules', { ...options, append: true })
    }
    return looksLikeNode
  },

  dockerfile: ({ entrypoint, ports }) => {
    return [
      `FROM node:${process.versions.node.split('.')[0]}`,
      'USER node',
      'RUN mkdir /home/node/app',
      'WORKDIR /home/node/app',
      ports.length > 0 ? `EXPOSE ${ports.join(' ')}` : '',
      'ARG ENV=production',
      'ENV NODE_ENV $ENV',
      'COPY --chown=node:node package.json yarn.loc[k] .npmr[c] ./',
      'RUN yarn install',
      'COPY --chown=node:node . .',
      `CMD [${entrypoint.split(' ').map(e => `"${e}"`).join(', ')}]`
    ].join('\n')
  },

  artifact: (env, { image }) => {
    return {
      image,
      sync: {},
      docker: { buildArgs: { ENV: env } }
    }
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
    const packageJson = JSON.parse(await readFile(path.join(options.target, './package.json')))
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
