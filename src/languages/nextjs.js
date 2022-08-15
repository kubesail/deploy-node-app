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
    const pkgPath = path.join(options.target, './next.config.js')
    let looksLikeNext = false
    if (fs.existsSync(pkgPath)) {
      looksLikeNext = true
      this.suggestedPorts = [3000]
    }
    return looksLikeNext
  },

  entrypoint: () => 'yarn start',

  dockerfile: () => {
    return [
      '# syntax=docker/dockerfile:1.3',
      '# Install dependencies only when needed',
      'FROM node:16-bullseye-slim AS deps',
      'WORKDIR /app',
      'COPY package.json yarn.lock .npmrc ./',
      'RUN yarn install --frozen-lockfile',

      'FROM node:16-bullseye-slim AS builder',
      'WORKDIR /app',
      'ARG BUILD_ASSET_PREFIX',
      'RUN apt-get update -yqq && \\',
      '  apt-get install -yqq awscli && \\',
      '  mkdir -p /app/secrets && \\',
      '  chown -R node:node /app',
      'USER node',
      'COPY --chown=node:node --from=deps /app/node_modules ./node_modules',
      'COPY --chown=node:node . .',
      'RUN echo "Building with asset prefix: ${BUILD_ASSET_PREFIX}" && BUILD_ASSET_PREFIX=$BUILD_ASSET_PREFIX yarn build',

      'FROM builder AS dev',
      'ENV NEXT_TELEMETRY_DISABLED="1" \\',
      '  NODE_ENV="development" \\',
      '  HOST="0.0.0.0" ',
      'CMD ["yarn", "dev"]',

      'FROM node:16-bullseye-slim AS runner',
      'WORKDIR /app',
      'ARG BUILD_ASSET_PREFIX',
      'ENV NODE_ENV="production" \\',
      '  NEXT_TELEMETRY_DISABLED="1" \\',
      '  HOST="0.0.0.0" ',
      'COPY --from=builder --chown=node:node /app/ .',
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
