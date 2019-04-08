const fs = require('fs')
const util = require('util')
const yaml = require('js-yaml')

const readFile = util.promisify(fs.readFile)

async function buildComposeConfig (pkg, output = 'file') {
  const depNames = Object.keys(pkg.dependencies)
  const readFiles = depNames.map(dep =>
    readFile(`node_modules/${dep}/package.json`).then(json => JSON.parse(json))
  )
  let files = await Promise.all(readFiles)

  // Point of confusion: In Docker Compose, "services" are analagous to Kube "deployments",
  // meaning if you define a "service" you want a container running for that object
  let deployments = {}
  files
    .filter(file => !!file.deployments)
    .forEach(file => {
      file.deployments.forEach(deployment => {
        const image = deployment.spec.template.spec.containers[0].image // TODO ?.
        const ports = deployment.spec.template.spec.containers[0].ports.map(
          port => `${port.containerPort}`
        )
        deployments[deployment.metadata.name] = {
          ports,
          // volumes: [{ '.': '/code' }], // TODO
          image
        }
      })
    })

  // Write out docker compose file
  const config = yaml.safeDump({
    version: '2',
    services: deployments
  })
  if (output) {
    fs.writeFileSync('docker-compose.yaml', config)
  } else {
    process.stdout.write(config)
  }
}

async function buildKubeConfig (pkg, output = 'file') {
  const depNames = Object.keys(pkg.dependencies)
  const readFiles = depNames.map(dep =>
    readFile(`node_modules/${dep}/package.json`).then(json => JSON.parse(json))
  )
  let files = await Promise.all(readFiles)
  let configs = []
  files
    .filter(file => !!file.deployments)
    .forEach(file => (configs = configs.concat(file.deployments)))

  files.filter(file => !!file.services).forEach(file => (configs = configs.concat(file.services)))

  // Write out Kubernetes config
  const config = yaml.safeDump(configs)
  console.log({ config })
  if (output) {
    fs.writeFileSync('kube-config.yaml', config)
  } else {
    process.stdout.write(config)
  }
}

module.exports = { buildComposeConfig, buildKubeConfig }
