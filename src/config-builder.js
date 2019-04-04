const fs = require('fs')
const util = require('util')

const readFile = util.promisify(fs.readFile)

async function buildComposeConfig (pkg) {
  const depNames = Object.keys(pkg.dependencies)
  const readFiles = depNames.map(dep =>
    readFile(`node_modules/${dep}/package.json`).then(json => JSON.parse(json))
  )
  let files = await Promise.all(readFiles)
  files = files.filter(file => !!file.spec)
  console.log('files with specs', { files })
}

function buildKubeConfig (packageJson) {
  const deps = Object.keys(packageJson.dependencies)
  console.log(deps)
}

module.exports = { buildComposeConfig, buildKubeConfig }
