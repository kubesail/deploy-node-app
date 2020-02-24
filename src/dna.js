const fs = require('fs')
const os = require('os')
const path = require('path')
const util = require('util')
const chalk = require('chalk')
const inquirer = require('inquirer')
const mkdirp = require('mkdirp')
const style = require('ansi-styles')
const diff = require('diff')

const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)
const WARNING = `${style.green.open}!!${style.green.close}`
const ERR_ARROWS = `${style.red.open}>>${style.red.close}`
const validProjectNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/i

function fatal (message /*: string */) {
  process.stderr.write(`${ERR_ARROWS} ${message}\n`)
  process.exit(1)
}

function log () {
  // eslint-disable-next-line no-console
  console.log(...arguments)
}

async function tryDiff (content /*: string */, existingPath /*: string */) {
  const existing = (await readFile(existingPath)).toString()
  const compare = diff.diffLines(existing, content)
  compare.forEach(part =>
    process.stdout.write(
      part.added ? chalk.green(part.value) : part.removed ? chalk.red(part.value) : part.value
    )
  )
}

async function confirmWriteFile (filePath, content, options = { update: false, force: false }) {
  const fullPath = path.join(process.cwd(), filePath)
  const { update, force } = options

  const exists = fs.existsSync(fullPath)
  let doWrite = !exists
  if (!update && exists) return false
  else if (exists && update && !force) {
    const YES_TEXT = 'Yes (update)'
    const NO_TEXT = 'No, dont touch'
    const SHOWDIFF_TEXT = 'Show diff'
    const confirmUpdate = (
      await inquirer.prompt({
        name: 'update',
        type: 'expand',
        message: `Would you like to update "${filePath}"?`,
        choices: [
          { key: 'Y', value: YES_TEXT },
          { key: 'N', value: NO_TEXT },
          { key: 'D', value: SHOWDIFF_TEXT }
        ],
        default: 0
      })
    ).update
    if (confirmUpdate === YES_TEXT) doWrite = true
    else if (confirmUpdate === SHOWDIFF_TEXT) {
      await tryDiff(content, fullPath)
      await confirmWriteFile(filePath, content, options)
    }
  } else if (force) {
    doWrite = true
  }

  if (doWrite) {
    try {
      await writeFile(fullPath, content)
      log(`Successfully wrote "${filePath}"`)
    } catch (err) {
      fatal(`Error writing ${filePath}: ${err.message}`)
    }
    return true
  }
}

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

async function promptForNewEnvironment (env) {
  if (typeof env !== 'string') {
    throw new Error('promptForNewEnvironment() requires an env string argument')
  }
  await mkdirp(`k8s/overlays/${env}/secrets`)
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

async function writeTextLine (file, line, options = { update: false, force: false }) {
  let existingContent
  try {
    existingContent = (await readFile(file)).toString()
  } catch (_err) {}
  if (existingContent.indexOf(line) === -1) {
    await confirmWriteFile(file, existingContent + '\n' + line + '\n', options)
  }
}

async function promptForKubeContext () {
  console.log('promptForKubeContext')
}

async function init (env = 'production', options = { update: false, force: false }, packageJson) {
  const { update, force } = options
  const config = packageJson['deploy-node-app'] ? packageJson['deploy-node-app'] : {}

  await mkdirp('k8s/base')
  await mkdirp('k8s/dependencies')
  if (!force && !fs.existsSync(`./k8s/overlays/${env}`)) await promptForNewEnvironment(env)

  // Ask some questions if we have missing info in our package.json
  const name =
    packageJson.name && validProjectNameRegex.test(packageJson.name)
      ? packageJson.name
      : await promptForPackageName(packageJson.name, force)
  const image = config.image ? config.image : await promptForImageName(name)
  const ports = config.ports ? config.ports : await promptForPorts()

  // Base image for Dockerfile (use latest major version of the local node version)
  const imageFrom = `node:${process.versions.node.split('.')[0]}`

  // If update or no Dockerfile and command is nginx, prompt if nginx is okay
  const command = (await promptForStaticSite(packageJson, force)) ? 'nginx' : 'node'

  // Find service modules we support
  const matchedModules = matchModules(packageJson)

  // Shorthand for helper functions
  const commonOpts = { name, env, ports, update }

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
  await writeTextLine('.gitignore', 'k8s/overlays/*/secrets/*', options)
  await writeTextLine('.dockerignore', 'k8s', options)

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
