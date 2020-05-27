const fs = require('fs')
const util = require('util')
const path = require('path')

const readFile = util.promisify(fs.readFile)

module.exports = {
  name: 'python',

  detect: options => {
    return fs.existsSync(path.join(options.target, 'requirements.txt'))
  },

  dockerfile: ({ entrypoint, ports }) => {
    if (fs.existsSync(entrypoint)) entrypoint = 'python ' + entrypoint
    return [
      'FROM python:3',
      'WORKDIR /app',
      'ARG ENV=production',
      'RUN apt-get update && apt-get install -yqq inotify-tools',
      'COPY requirements.txt ./',
      'RUN pip install --no-cache-dir -r requirements.txt',
      'COPY . .',
      `CMD [${entrypoint
        .split(' ')
        .map(e => `"${e}"`)
        .join(', ')}]`
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
    const matchedModules = []
    let requirementsFile = ''
    try {
      requirementsFile = (
        await readFile(path.join(options.target, './requirements.txt'))
      ).toString()
    } catch (err) {}
    const dependencies = requirementsFile.split('\n')
    for (let i = 0; i < dependencies.length; i++) {
      const dep = dependencies[i].split(' ')[0]
      const mod = modules.find(mod => {
        return mod.languages && mod.languages[this.name] && mod.languages[this.name].includes(dep)
      })
      if (mod) matchedModules.push(mod)
    }
    return matchedModules
  }
}
