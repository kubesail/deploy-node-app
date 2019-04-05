const fs = require('fs')
const util = require('util')
const yaml = require('js-yaml')

const readFile = util.promisify(fs.readFile)

async function buildComposeConfig (pkg) {
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
  fs.writeFileSync(
    './docker-compose.yaml',
    yaml.safeDump({
      version: '2',
      services: deployments
    })
  )
}

async function buildKubeConfig (pkg) {
  const depNames = Object.keys(pkg.dependencies)
  const readFiles = depNames.map(dep =>
    readFile(`node_modules/${dep}/package.json`).then(json => JSON.parse(json))
  )
  let files = await Promise.all(readFiles)
  let deployments = []
  files
    .filter(file => !!file.deployments)
    .forEach(file => (deployments = deployments.concat(file.deployments)))

  let services = []
  files.filter(file => !!file.services).forEach(file => (services = services.concat(file.services)))

  deployments = yaml.safeDump(deployments)
  services = yaml.safeDump(services)

  // Write out Kubernetes config
  fs.writeFileSync('./kube-deployments.yaml', deployments)
  fs.writeFileSync('./kube-services.yaml', services)
}

module.exports = { buildComposeConfig, buildKubeConfig }
