const fs = require('fs')
const util = require('util')
const path = require('path')
const { writeTextLine } = require('../util')

const readFile = util.promisify(fs.readFile)

module.exports = {
  name: 'nextjs',
  skipHttpPrompt: true,
  skipEntrypointPrompt: true,
  suggestedPorts: [3000],

  detect: async function (options) {
    const nextConfigPath = path.join(options.target, './next.config.js')
    if (fs.existsSync(nextConfigPath)) {
      this.suggestedPorts = [3000]
      return true
    }
    const pkgPath = path.join(options.target, './package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(pkgPath))
        if (packageJson) {
          if (Object.keys(packageJson.dependencies).includes('next')) {
            return true
          }
        }
      } catch {}
    }
  },

  entrypoint: () => 'yarn start',

  dockerfile: () => {
    return [
      '# syntax=docker/dockerfile:1.3',
      '# Install dependencies only when needed',
      `FROM node:${process.versions.node.split('.')[0]} AS deps\n`,
      'WORKDIR /home/node',
      'COPY package.json yarn.loc[k] .npmr[c] ./',
      'RUN yarn install',

      `FROM node:${process.versions.node.split('.')[0]} AS builder\n`,
      'WORKDIR /home/node',
      'ARG BUILD_ASSET_PREFIX',
      'USER node',
      'COPY --chown=node:node --from=deps /home/node/node_modules ./node_modules',
      'COPY --chown=node:node . .',
      'RUN echo "Building with asset prefix: ${BUILD_ASSET_PREFIX}" && BUILD_ASSET_PREFIX=$BUILD_ASSET_PREFIX yarn build',

      'FROM builder AS dev',
      'ENV NEXT_TELEMETRY_DISABLED="1" \\',
      '  NODE_ENV="development" \\',
      '  HOST="0.0.0.0" ',
      'CMD ["yarn", "dev"]',

      `FROM node:${process.versions.node.split('.')[0]} AS runner\n`,
      'WORKDIR /home/node',
      'ARG BUILD_ASSET_PREFIX',
      'ENV NODE_ENV="production" \\',
      '  NEXT_TELEMETRY_DISABLED="1" \\',
      '  HOST="0.0.0.0" ',
      'COPY --from=builder --chown=node:node /home/node/ .',
      'COPY --chown=node:node .env.loca[l] *.js *.json *.md *.lock ./',
      'EXPOSE 3000',
      'CMD ["node", "server.js"]'
    ].join('\n')
  },

  artifact: (env, image) => {
    return {
      image,
      sync: {},
      docker: { buildArgs: { ENV: env } }
    }
  },

  matchModules: async function (modules, options) {
    let packageJson = {}
    try {
      packageJson = JSON.parse(await readFile(path.join(options.target, './package.json')))
    } catch (err) {}
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
