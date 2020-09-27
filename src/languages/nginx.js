const fs = require('fs')
const path = require('path')
const { prompt, debug, writeTextLine } = require('../util')

module.exports = {
  name: 'nginx',
  suggestedPorts: [8080],
  suggestedEntrypoints: ['index.html', 'index.htm', 'public/index.html'],

  skipEntrypointPrompt: true,
  skipPortPrompt: true,
  skipHttpPrompt: true,

  entrypoint: () => {
    return null
  },

  detect: async options => {
    // Look for common node.js based frontend packages
    let looksLikeFrontend = false
    let skipEntrypointPrompt = null

    const commonFrontendFiles = [
      './src/index.html',
      './public/index.html',
      './public/index.htm',
      './index.html'
    ]

    // If there is a /public folder, they may just want to deploy that (completely static site, with no build pipeline?)
    for (let i = 0; i < commonFrontendFiles.length; i++) {
      if (fs.existsSync(commonFrontendFiles[i])) {
        looksLikeFrontend = true
        skipEntrypointPrompt = path.dirname(commonFrontendFiles[i])
        break
      }
    }

    if (looksLikeFrontend) {
      const { useNginx } = await prompt([
        {
          name: 'useNginx',
          type: 'confirm',
          message:
            'This project looks like it might be a static site, would you like to use nginx? Nginx will listen on port 8080'
        }
      ])
      if (!useNginx) return false
      process.stdout.write('\n')
      if (fs.existsSync('./package.json')) {
        const packageJson = JSON.parse(fs.readFileSync('./package.json'))
        const useYarn = fs.existsSync('./yarn.lock')
        const choices = Object.keys(packageJson.scripts).map(k =>
          useYarn ? `yarn ${k}` : `npm run ${k}`
        )
        const chooseFile = 'Choose a file or command instead'
        choices.push(chooseFile)
        choices.push('No build command')
        const defaultValue = choices.includes('build') ? 'build' : choices[0]
        let { buildStep } = await prompt([
          {
            name: 'buildStep',
            type: 'list',
            message:
              'This repo includes a package.json, should we run a build step to compile the project?',
            default: defaultValue,
            choices
          }
        ])
        if (buildStep) {
          buildStep = [
            `WORKDIR /build`,
            `COPY package.json package-lock.jso[n]` + (useYarn ? ' yarn.loc[k]' : '') + ' ./',
            "# Note that we're going to compile our project in the next command, so we need our development dependencies!",
            'ENV NODE_ENV=development',
            'RUN ' +
              (useYarn
                ? 'yarn install'
                : fs.existsSync('package-lock.json')
                ? 'npm ci'
                : 'npm install'),
            `COPY . .`,
            'RUN ' +
              buildStep +
              ' && \\\n' +
              '  rm -rf /usr/share/nginx/html && \\\n' +
              '  mv -n dist artifact || true && \\\n' +
              '  mv -n build artifact || true',
            '\nFROM nginx',
            'COPY --from=build /build/artifact /usr/share/nginx/html'
          ].join('\n')
        }
        return { buildStep, skipEntrypointPrompt, image: 'node as build' }
      }
    }

    return false
  },

  dockerfile: ({ entrypoint, detectedOptions = {} }) => {
    const { buildStep, skipEntrypointPrompt, image } = detectedOptions
    if (typeof skipEntrypointPrompt === 'string') entrypoint = skipEntrypointPrompt
    debug('Nginx generating dockerfile', { entrypoint, detectedOptions })
    return (
      [
        `FROM ${image || 'nginx'}`,
        buildStep || `COPY ${path.dirname(entrypoint)} /usr/share/nginx/html`
      ]
        .filter(Boolean)
        .join('\n') + '\n'
    )
  }
}
