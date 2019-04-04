const fs = require('fs')
const util = require('util')

const readFile = util.promisify(fs.readFile)

async function buildComposeConfig (pkg) {
  const deps = Object.keys(pkg.dependencies)
  const readFiles = deps.map(dep => readFile(`node_modules/${dep}`))
  const files = await Promise.all(readFiles)
  console.log('files', { files })
}

function buildKubeConfig (packageJson) {
  const deps = Object.keys(packageJson.dependencies)
  console.log(deps)
}

module.exports = { buildComposeConfig, buildKubeConfig }
