const fs = require('fs')
const os = require('os')
const path = require('path')
const util = require('util')
const chalk = require('chalk')
const inquirer = require('inquirer')
const mkdirp = require('mkdirp')
const style = require('ansi-styles')
const { isFQDN } = require('validator')
const yaml = require('js-yaml')
const merge = require('lodash/merge')

const readFile = util.promisify(fs.readFile)
const WARNING = `${style.yellow.open}!!${style.yellow.close}`
const KUBE_CONFIG_PATH = path.join(os.homedir(), '.kube', 'config')
const NEW_KUBESAIL_CONTEXT = `KubeSail${style.gray.open} | Deploy on a free Kubernetes namespace${style.gray.close}`
const validProjectNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/i

const { fatal, log, confirmWriteFile } = require('./util2')

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
  if (kubeContexts.filter(context => context.startsWith('kubesail-')).length === 0) {
    kubeContexts.push(NEW_KUBESAIL_CONTEXT)
  }
  return kubeContexts
}

// promptForPackageName tries to get a URI-able name out of a project using validProjectNameRegex
// This ensures a DNS-valid name for Kuberentes as well as for container registries, etc.
async function promptForPackageName (packageName = '', force = false) {
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
          message: 'What should we name this project?',
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
      default: defaultDomain && isFQDN(defaultDomain) ? defaultDomain : '',
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
    const existing = yaml.safeLoad(fs.readFileSync(path))
    merge(existing, { resources, bases })
    yamlStr = yaml.safeDump(existing)
  } else {
    yamlStr = yaml.safeDump({ resources, bases })
  }

  // TODO: Write secretGenerators

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

async function init (env = 'production', language, options = { update: false, force: false }) {
  const { update, force } = options
  const config = await language.readConfig()
  if (!config.envs || !config.envs[env]) config.envs = { [env]: {} }

  await mkdirp('k8s/base')
  await mkdirp('k8s/dependencies')
  if (!force && !fs.existsSync(`./k8s/overlays/${env}`)) await promptForNewEnvironment(env)

  // Ask some questions if we have missing info in our package.json
  const name =
    config.name && validProjectNameRegex.test(config.name)
      ? config.name
      : await promptForPackageName(config.name || path.basename(process.cwd()), force)
  log(
    `Deploying "${style.green.open}${name}${style.green.close}" to ${style.red.open}${env}${style.red.close}!`
  )
  const image = config.envs[env].image
    ? config.envs[env].image
    : await promptForImageName(name, config.envs[env].image)
  const ports = config.ports ? config.ports : await promptForPorts(name, config.ports)
  let uri = false
  if (ports.length > 0 && config.envs[env].uri === undefined) {
    uri = await promptForIngress(config.name)
  }

  // Base image for Dockerfile (use latest major version of the local node version)
  const imageFrom = `node:${process.versions.node.split('.')[0]}`

  // If update or no Dockerfile and command is nginx, prompt if nginx is okay
  const command = config.command || language.command

  // Load modules
  const modules = []
  const normalizedPath = path.join(__dirname, './modules')
  const moduleFiles = fs.readdirSync(normalizedPath)
  for (let i = 0; i < moduleFiles.length; i++) {
    const file = moduleFiles[i]
    // eslint-disable-next-line security/detect-non-literal-require
    modules.push(require(path.join(__dirname, './modules', file)))
  }

  // Find service modules we support
  const matchedModules = language.matchModules ? await language.matchModules(modules) : []

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
  const context = await promptForKubeContext(config.envs[env].context, kubeContexts)

  language.writeConfig(
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

async function deploy (env, language, options) {
  console.log('deploy()')
}

async function build (env, language, options) {
  console.log('build()')
}

module.exports = async function DeployNodeApp (env, action, language, options) {
  switch (action) {
    case 'init':
      await init(env, language, options)
      break
    case 'deploy':
      await init(env, language, options)
      await deploy(env, language, options)
      break
    case 'build':
      await build(env, language, options)
      break
    default:
      process.stderr.write(`No such action "${action}"!`)
      process.exit(1)
  }
}
