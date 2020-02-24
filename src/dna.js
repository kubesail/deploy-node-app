const fs = require('fs')

function matchModules (packageJson) {}

function writeDockerfile (path, options = { image: 'node', command: 'node' }) {}

function writeDeployment () {}

function writeService () {}

function writeIngress () {}

function writeKustomization () {}

function writeSecrets () {}

function writeSkaffold () {}

function looksLikeStaticApp (packageJson) {
  const spaPackages = ['webpack']
  const deps = Object.keys(Object.assign({}, packageJson.dependencies, packageJson.devDependencies))
  for (let i = 0; i < spaPackages.length; i++) {
    if (deps.includes[spaPackages[i]]) return true
  }
  return false
}

async function init (env, options, packageJson) {
  const { overwrite, force } = options

  // If no valid project name in package.json, prompt for projectName
  const name = packageJson.name

  // If no image name in package.json, prompt for imageName
  const image = 'test/node'

  // Base image for Dockerfile
  const imageFrom = `node:${process.versions.node.split('.')[0]}`

  // If no Dockerfile, prompt for ports
  const ports = [5000]

  // If overwrite or no Dockerfile and command is nginx, prompt if nginx is okay
  const command = looksLikeStaticApp(packageJson) ? 'nginx' : 'node'

  // Find service modules we support
  const matchedModules = matchModules(packageJson)

  // Shorthand for helper functions
  const commonOpts = { name, env, ports, overwrite }

  const secrets = {}
  const bases = ['../../base']

  await writeDockerfile('./Dockerfile', { image: imageFrom, command, ...commonOpts })
  await writeDeployment('./k8s/base/deployment.yaml', { image, envFrom: name, ...commonOpts })

  if (ports.length > 0) {
    await writeService('./k8s/base/service.yaml', { ...commonOpts })
    // prompt for domain name / expose to internet
    const uri = 'mywebsite.com'
    await writeIngress('./k8s/base/ingress.yaml', { uri, ...commonOpts })
  }

  for (let i = 0; i < matchedModules.length; i++) {
    const matched = matchedModules[i]
    const mPath = `k8s/dependencies/${matched.name}`

    const mDeploymentFile = `${matched.kind || 'deployment'}.yaml`
    const mResources = [`./${mDeploymentFile}`]

    await writeDeployment(`./${mPath}/${mDeploymentFile}`, { matched, ...commonOpts })

    if (matched.service) {
      await writeService(`./${mPath}/service.yaml`, { matched, ...commonOpts })
      mResources.push('./service.yaml')
    }

    await writeKustomization(`./${mPath}/kustomization.yaml`, { resources: mResources })
    bases.push(`../../../${mPath}`)

    if (matched.secrets) {
      const file = `secrets/${matched.name}.env`
      await writeSecrets(`./k8s/overlays/${env}/${file}`, { matched, ...commonOpts })
      secrets[matched.name] = file
    }
  }

  await writeSkaffold('./skaffold.yaml', { image, ...commonOpts })

  await writeKustomization('./k8s/base/kustomization.yaml', {
    resources: ['./deployment.yaml', './service.yaml', './ingress.yaml']
  })

  await writeKustomization(`./k8s/overlays/${env}/kustomization.yaml`, { bases, secrets })

  // write gitignore to include *.env files
}

async function deploy (env, options, packageJson) {}

async function build (env, options, packageJson) {}

module.exports = async function DeployNodeApp (env, action, options, packageJson) {
  switch (action) {
    case 'init':
      await init(env, options, packageJson)
      break
    case 'deploy':
      await deploy(env, options, packageJson)
      break
    case 'build':
      await build(env, options, packageJson)
      break
    default:
      await init(env, options, packageJson)
      await deploy(env, options, packageJson)
  }
}
