const fs = require('fs')
const chalk = require('chalk')
const inquirer = require('inquirer')
const os = require('os')
const { WARNING } = require('./util')

const validProjectNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/i

// matchModules matches packageJson's dependencies against supported modules in the ./src/modules directory.
// It returns mappings used to generate Kubernetes resources for those modules!
function matchModules (packageJson) {
  console.log('matchModules()')
  return []
}

// promptForPackageName tries to get a URI-able name out of a project using validProjectNameRegex
// This ensures a DNS-valid name for Kuberentes as well as for container registries, etc.
async function promptForPackageName (packageName, force = false) {
  const sanitizedName = packageName.replace(/\.(com|org|net|io|co.uk)$/, '')

  if (validProjectNameRegex.test(sanitizedName)) {
    process.stdout.write(`${WARNING} Using project name ${chalk.green.bold(sanitizedName)}...\n`)
    return sanitizedName
  } else {
    const newName = packageName.replace(/[^a-z0-9]/gi, '')
    if (force) {
      return newName
    } else {
      const { name } = await inquirer.prompt([
        {
          name: 'name',
          type: 'input',
          message: `The name "${packageName}" is not valid as a project name - it must not contain dots or spaces. What should we name this project?`,
          default: newName,
          validate: input => (validProjectNameRegex.test(input) ? true : 'Invalid name!')
        }
      ])
      return name
    }
  }
}

// promptForImageName asks a user what the name of our image should be (doesn't bother checking if the user actually has push access, which isn't really a concern yet)
async function promptForImageName (projectName) {
  const { imageName } = await inquirer.prompt([
    {
      name: 'imageName',
      type: 'input',
      message:
        'What is the image name for our project? To use docker hub, try username/projectname.\n Note: Make sure this is marked private, or it may be automatically created as a public image!\n',
      default: `${os.userInfo().username}/${projectName}`
    }
  ])

  return imageName
}

async function promptForPorts () {
  console.log('prompt for ports')
  return []
}

// promptForStaticSite tries to determine if this is possibly a static site, like those created with `create-react-app`.
async function promptForStaticSite (packageJson, force) {
  const spaPackages = ['webpack']
  const deps = Object.keys(Object.assign({}, packageJson.dependencies, packageJson.devDependencies))

  let isStatic = false
  for (let i = 0; i < spaPackages.length; i++) {
    if (deps.includes[spaPackages[i]]) {
      isStatic = true
      break
    }
  }

  if (!force && isStatic && !fs.existsSync('./Dockerfile')) {
    console.log('is this a static site? Want to just use nginx?')
  }

  return isStatic
}

async function promptForNewEnvironment () {
  console.log('are you sure you wanna do this?')
}

async function writeDockerfile (path, options = { image: 'node', command: 'node' }) {
  console.log('writing dockerfile', options)
}

async function writeDeployment () {
  console.log('writeDeployment')
}

async function writeService () {
  console.log('writeService')
}

async function writeIngress () {
  console.log('writeIngress')
}

async function writeKustomization () {
  console.log('writeKustomization')
}

async function writeSecrets () {
  console.log('writeSecrets')
}

async function writeSkaffold () {
  console.log('writeSkaffold')
}

async function writeGitIgnore () {
  console.log('writeGitIgnore')
}

async function writeDockerIgnore () {
  console.log('writeDockerIgnore')
}

async function promptForKubeContext () {
  console.log('promptForKubeContext')
}

async function init (env = 'production', options = { overwrite: false, force: false }, packageJson) {
  const { overwrite, force } = options
  const config = packageJson['deploy-node-app'] ? packageJson['deploy-node-app'] : {}

  if (!force && !fs.existsSync(`./k8s/overlays/${env}`)) await promptForNewEnvironment()

  // Ask some questions if we have missing info in our package.json
  const name =
    packageJson.name && validProjectNameRegex.test(packageJson.name)
      ? packageJson.name
      : await promptForPackageName(packageJson.name, force)
  const image = config.image ? config.image : await promptForImageName(name)
  const ports = config.ports ? config.ports : await promptForPorts()

  // Base image for Dockerfile (use latest major version of the local node version)
  const imageFrom = `node:${process.versions.node.split('.')[0]}`

  // If overwrite or no Dockerfile and command is nginx, prompt if nginx is okay
  const command = (await promptForStaticSite(packageJson, force)) ? 'nginx' : 'node'

  // Find service modules we support
  const matchedModules = matchModules(packageJson)

  // Shorthand for helper functions
  const commonOpts = { name, env, ports, overwrite }

  const secrets = {}
  const bases = ['../../base']

  await writeDockerfile('./Dockerfile', {
    image: imageFrom,
    deployedAs: image,
    command,
    ...commonOpts
  })
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
  await writeGitIgnore('k8s/overlays/*/secrets/*')
  await writeDockerIgnore('k8s')

  // Ensure that we have the context expected, and if we don't, let's ask the user to help us resolve it
  await promptForKubeContext(config.context)
}

async function deploy (env, options, packageJson) {
  console.log('deploy()')
}

async function build (env, options, packageJson) {
  console.log('build()')
}

module.exports = async function DeployNodeApp (env, action, options, packageJson) {
  switch (action) {
    case 'init':
      await init(env, options, packageJson)
      break
    case 'deploy':
      await init(env, options, packageJson)
      await deploy(env, options, packageJson)
      break
    case 'build':
      await build(env, options, packageJson)
      break
    default:
      process.stderr.write(`No such action "${action}"!`)
      process.exit(1)
  }
}
