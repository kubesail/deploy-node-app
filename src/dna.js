const fs = require('fs')
const os = require('os')
const path = require('path')
const util = require('util')
const chalk = require('chalk')
const inquirer = require('inquirer')
const mkdirp = require('mkdirp')
const style = require('ansi-styles')
const diff = require('diff')
const { isFQDN } = require('validator')
const yaml = require('js-yaml')
const merge = require('lodash/merge')

const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)
const WARNING = `${style.yellow.open}!!${style.yellow.close}`
const ERR_ARROWS = `${style.red.open}>>${style.red.close}`
const KUBE_CONFIG_PATH = path.join(os.homedir(), '.kube', 'config')
const NEW_KUBESAIL_CONTEXT = `KubeSail${style.gray.open} | Deploy on a free Kubernetes namespace${style.gray.close}`
const validProjectNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/i

function fatal (message /*: string */) {
  process.stderr.write(`${ERR_ARROWS} ${message}\n`)
  process.exit(1)
}

function log () {
  // eslint-disable-next-line no-console
  console.log(...arguments)
}

function readLocalKubeConfig () {
  // Read local .kube configuration to see if the user has an existing kube context they want to use
  let kubeContexts = []
  if (fs.existsSync(KUBE_CONFIG_PATH)) {
    try {
      const kubeConfig = yaml.safeLoad(fs.readFileSync(KUBE_CONFIG_PATH))

      kubeContexts = kubeContexts.concat(
        kubeConfig.contexts
          .map(
            context =>
              context.name || (context.context && context.context.name) || context.context.cluster
          )
          .filter(context => context)
      )
    } catch (err) {
      fatal(
        `It seems you have a Kubernetes config file at ${KUBE_CONFIG_PATH}, but it is not valid yaml, or unreadable!`
      )
    }
  }

  // TODO add minikube deployment context
  if (kubeContexts.filter(context => context.startsWith('kubesail-')).length === 0) {
    kubeContexts.push(NEW_KUBESAIL_CONTEXT)
  }
  return kubeContexts
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
  const dependencies = Object.keys(packageJson.dependencies || [])
  const normalizedPath = path.join(__dirname, './modules')
  const modules = []
  const matchedModules = []

  // Don't bother loading module dependencies if we have no dependencies
  if (dependencies.length === 0) return []

  const moduleFiles = fs.readdirSync(normalizedPath)
  for (let i = 0; i < moduleFiles.length; i++) {
    const file = moduleFiles[i]
    // eslint-disable-next-line security/detect-non-literal-require
    modules.push(require(path.join(__dirname, './modules', file)))
  }

  for (let i = 0; i < dependencies.length; i++) {
    const dep = dependencies[i]
    const mod = modules.find(mod => {
      return mod.npmNames && mod.npmNames.includes(dep)
    })
    if (mod) matchedModules.push(mod)
  }

  return matchedModules
}

// promptForPackageName tries to get a URI-able name out of a project using validProjectNameRegex
// This ensures a DNS-valid name for Kuberentes as well as for container registries, etc.
async function promptForPackageName (packageName, force = false) {
  const sanitizedName = packageName.split('.')[0]

  if (force && validProjectNameRegex.test(sanitizedName)) {
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
async function promptForImageName (projectName, existingName) {
  const { imageName } = await inquirer.prompt([
    {
      name: 'imageName',
      type: 'input',
      message:
        'What is the image name for our project? To use docker hub, try username/projectname.\n Note: Make sure this is marked private, or it may be automatically created as a public image!\n',
      default: existingName || `${os.userInfo().username}/${projectName}`
    }
  ])

  return imageName
}

async function promptForPorts (projectName, existingPorts = []) {
  const { newPorts } = await inquirer.prompt([
    {
      name: 'newPorts',
      type: 'input',
      message: 'Does your app listen on any ports? If so, please enter them comma separated:',
      default: existingPorts.join(', '),
      validate: input => {
        if (!input) return true
        const ports = input.replace(/ /g, '').split(',')
        for (let i = 0; i < ports.length; i++) {
          const port = parseInt(ports[i], 10)
          if (isNaN(port)) return 'Ports must be numbers!'
          else if (port <= 1024) {
            return 'We strongly suggest not using a "low port" - please choose a port above 1024'
          } else if (port >= 65535) {
            return 'Ports higher than 65535 will typically not work, please choose a port between 1024 and 65535!'
          }
        }
        return true
      }
    }
  ])

  const ports = newPorts
    .replace(/ /g, '')
    .split(',')
    .map(port => parseInt(port, 10))
    .filter(Boolean)

  await writeService('./k8s/base/service.yaml', { projectName, ports })

  return ports
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
    const { confirmStatic } = await inquirer.prompt([
      {
        name: 'confirmStatic',
        type: 'confirm',
        message:
          'This project looks like it might be a static site - would you like to use Nginx & react-dev-server instead of Node.js?\n'
      }
    ])
    if (confirmStatic) isStatic = true
  }

  return isStatic
}

async function promptForNewEnvironment (env = 'production') {
  if (typeof env !== 'string') {
    throw new Error('promptForNewEnvironment() requires an env string argument')
  }
  await mkdirp(`k8s/overlays/${env}/secrets`)
}

async function promptForIngress (defaultDomain) {
  const { ingressUri } = await inquirer.prompt([
    {
      name: 'ingressUri',
      type: 'input',
      message:
        'Should this be exposed to the internet via HTTPS? ie: Is this a web server?\nIf so, what URI should be used to access it? (Will not be exposed to the internet if left blank)\n',
      default: isFQDN(defaultDomain) ? defaultDomain : '',
      validate: input => {
        if (input && !isFQDN(input)) {
          return 'Either leave blank, or input a valid DNS name (ie: my.example.com)'
        }
        return true
      }
    }
  ])
  return ingressUri
}

async function promptForKubeContext (context, kubeContexts) {
  if (context && kubeContexts.includes(context)) {
    return context
  } else {
    if (context) {
      process.stdout.write(
        `${WARNING} This environment is configured to use the context "${context}", but that wasn't found in your Kube config!`
      )
    }

    if (kubeContexts.filter(context => context.startsWith('kubesail-')).length === 0) {
      kubeContexts.push(NEW_KUBESAIL_CONTEXT)
    }

    const { newContext } = await inquirer.prompt([
      {
        name: 'newContext',
        type: 'list',
        message: 'Which Kubernetes context do you want to deploy to?',
        default: kubeContexts[0],
        choices: kubeContexts
      }
    ])

    if (newContext === NEW_KUBESAIL_CONTEXT) {
      // TODO: Wire up to create new kubesail context
    }

    return newContext
  }
}

async function writeModuleConfiguration (
  env = 'production',
  mod,
  options = { force: false, update: false }
) {
  if (typeof mod !== 'object' || typeof mod.name !== 'string') throw new Error('Invalid module!')
  const modPath = `k8s/dependencies/${mod.name}`

  const deploymentFile = `${mod.kind || 'deployment'}.yaml`
  const resources = [`./${deploymentFile}`]
  const secrets = {}

  log(`Writing configuration for the "${mod.name}" module!`)

  await writeDeployment(`./${modPath}/${deploymentFile}`, { ...options, ...mod })

  if (mod.service) {
    await writeService(`./${modPath}/service.yaml`, { ...options, ...mod })
    resources.push('./service.yaml')
  }

  await writeKustomization(`./${modPath}/kustomization.yaml`, { resources })

  if (mod.secrets) {
    const file = `secrets/${mod.name}.env`
    await writeSecrets(`./k8s/overlays/${env}/${file}`, { ...options, ...mod })
    secrets[mod.name] = file
  }

  return { base: `../../../${modPath}`, secrets }
}

async function writeTextLine (file, line, options = { update: false, force: false, append: false }) {
  let existingContent
  try {
    existingContent = (await readFile(file)).toString()
  } catch (_err) {}
  if (existingContent && existingContent.indexOf(line) === -1 && options.append) {
    await confirmWriteFile(file, line + '\n', options)
  }
}

async function writeDNAConfig (packageJson, config, options = { update: false, force: false }) {
  packageJson['deploy-node-app'] = config
  await confirmWriteFile('package.json', JSON.stringify(packageJson, null, 2) + '\n', options)
}

async function writeDockerfile (
  path,
  options = {
    image: 'node',
    deployedAs: undefined,
    command: 'node',
    entrypoint: 'src/index.js',
    update: false,
    force: false
  }
) {
  const { image, deployedAs, command, entrypoint } = options
  if (fs.existsSync(path)) {
    await writeTextLine(
      path,
      `${deployedAs ? `# Deployed as ${deployedAs}\n` : ''}
FROM ${image}
WORKDIR /app

RUN useradd nodejs && \
    chown -R nodejs /app && \
    chown -R nodejs /home/nodejs

COPY package.json yarn.loc[k] .npmr[c] ./
RUN yarn install --production

COPY --chown=nodejs . ./

CMD ["${command}", "${entrypoint}"]
  `,
      { ...options }
    )
  }
}

async function writeDeployment (path, options = { force: false, update: false }) {
  const { image, envFrom } = options
  console.log('writeDeployment', options)
}

async function writeService (path, options = { force: false, update: false }) {
  const { image, envFrom } = options
  console.log('writeService', options)
}

async function writeIngress (path, options = { force: false, update: false }) {
  const { image, envFrom } = options
  console.log('writeIngress', options)
}

async function writeKustomization (path, options = { force: false, update: false }) {
  const { resources = [], bases = [], secrets = [] } = options

  let yamlStr = ''
  if (fs.existsSync(path)) {
    const existing = yaml.safeLoad(path)
    merge(existing, { resources, bases, secrets })
    yamlStr = yaml.safeDump(existing)
  } else {
    console.log({ resources, bases, secrets })
    yamlStr = yaml.safeDump({ resources, bases, secrets })
  }

  await confirmWriteFile(path, yamlStr + '\n', options)
}

async function writeSecrets (path, options = { force: false, update: false }) {
  const { envs } = options
  console.log('writeSecrets', options)
}

async function writeSkaffold (path, options = { force: false, update: false }) {
  const { image } = options
  console.log('writeSkaffold', options)
}

async function init (env = 'production', options = { update: false, force: false }, packageJson) {
  const { update, force } = options
  const config = packageJson['deploy-node-app'] ? packageJson['deploy-node-app'] : {}
  if (!config.envs || !config.envs[env]) config.envs = { [env]: {} }

  await mkdirp('k8s/base')
  await mkdirp('k8s/dependencies')
  if (!force && !fs.existsSync(`./k8s/overlays/${env}`)) await promptForNewEnvironment(env)

  // Ask some questions if we have missing info in our package.json
  const name =
    packageJson.name && validProjectNameRegex.test(packageJson.name)
      ? packageJson.name
      : await promptForPackageName(packageJson.name, force)
  log(
    `Deploying "${style.green.open}${name}${style.green.close}" to ${style.red.open}${env}${style.red.close}!`
  )
  const image =
    !update && config.envs[env].image
      ? config.envs[env].image
      : await promptForImageName(name, config.envs[env].image)
  const ports = !update && config.ports ? config.ports : await promptForPorts(name, config.ports)
  let uri = false
  if (ports.length > 0 && config.envs[env].uri === undefined) {
    uri = await promptForIngress(packageJson.name)
  }

  // Base image for Dockerfile (use latest major version of the local node version)
  const imageFrom = `node:${process.versions.node.split('.')[0]}`

  // If update or no Dockerfile and command is nginx, prompt if nginx is okay
  const command = config.command
    ? config.command
    : (await promptForStaticSite(packageJson, force))
      ? 'nginx'
      : 'node'

  // Find service modules we support
  const matchedModules = matchModules(packageJson)

  // Shorthand for helper functions
  const commonOpts = { ...options, name, env, ports }

  let secrets = {}
  const bases = ['../../base']

  await writeDockerfile('./Dockerfile', {
    image: imageFrom,
    deployedAs: image,
    command,
    ...commonOpts
  })
  await writeDeployment('./k8s/base/deployment.yaml', {
    image,
    envFrom: name,
    ...commonOpts
  })

  for (let i = 0; i < matchedModules.length; i++) {
    const matched = matchedModules[i]
    const { base, secrets: moduleSecrets } = await writeModuleConfiguration(env, matched)
    secrets = Object.assign({}, secrets, moduleSecrets)
    bases.push(base)
  }

  await writeSkaffold('./skaffold.yaml', { ...commonOpts, image })

  await writeKustomization('./k8s/base/kustomization.yaml', {
    resources: ['./deployment.yaml', './service.yaml', './ingress.yaml']
  })

  await writeKustomization(`./k8s/overlays/${env}/kustomization.yaml`, {
    ...commonOpts,
    bases,
    secrets
  })

  // write gitignore to include *.env files
  await writeTextLine('.gitignore', 'k8s/overlays/*/secrets/*', { ...options, append: true })
  await writeTextLine('.dockerignore', 'k8s', { ...options, append: true })

  // Ensure that we have the context expected, and if we don't, let's ask the user to help us resolve it
  const kubeContexts = readLocalKubeConfig()
  const context = await promptForKubeContext(config.context, kubeContexts)

  await writeDNAConfig(
    packageJson,
    {
      command,
      ports,
      envs: {
        [env]: { uri, context, image }
      }
    },
    options
  )
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
