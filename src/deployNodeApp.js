// Deploy Node App (deploy-node-app) - Develop and deploy Node.js apps with Kubernetes, with zero config!
// developed by KubeSail.com!

const fs = require('fs')
const os = require('os')
const path = require('path')
const readFile = require('util').promisify(fs.readFile)
const chalk = require('chalk')
const inquirer = require('inquirer')
const { isFQDN } = require('validator')
const yaml = require('js-yaml')
const merge = require('lodash/merge')
const style = require('ansi-styles')
const getKubesailConfig = require('get-kubesail-config')
inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'))
const { fatal, log, debug, mkdir, cleanupWrittenFiles, ensureBinaries, execSyncWithEnv, confirmWriteFile } = require('./util')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const WARNING = `${style.yellow.open}!!${style.yellow.close}`
const KUBESAIL_NEW_NAMESPACE_TEXT = 'Create a free Namespace on KubeSail.com'

// Load meta-modules! These match dependency packages to files in ./modules - these files in turn build out Kubernetes resources!
const metaModules = [
  require('./modules/redis'),
  require('./modules/kafka'),
  require('./modules/postgres'),
  require('./modules/redis')
]

// Only allow projects that are valid dns components - we will prompt the user for a different name if this is name matched
const validProjectNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/i

// Read local .kube configuration to see if the user has an existing kube context they want to use
function readLocalKubeConfig (configPathOption) {
  const configPath = configPathOption || path.join(os.homedir(), '.kube', 'config')
  debug(`Using kube config ${configPath}`)
  if (!fs.existsSync(configPath)) return {}
  let config = {}
  try {
    config = yaml.safeLoad(fs.readFileSync(configPath))
  } catch (err) {
    fatal(`It seems you have a Kubernetes config file at ${configPath}, but it is not valid yaml, or unreadable! Error: ${err.message}`)
  }
  return config
}

// promptForPackageName tries to get a URI-able name out of a project using validProjectNameRegex
// This ensures a DNS-valid name for Kuberentes as well as for container registries, etc.
async function promptForPackageName (packageName = '', force = false) {
  const sanitizedName = packageName.split('.')[0]
  if (force && validProjectNameRegex.test(sanitizedName)) {
    process.stdout.write(`${WARNING} Using project name ${chalk.green.bold(sanitizedName)}...\n\n`)
    return sanitizedName
  } else {
    const newName = packageName.replace(/[^a-z0-9]/gi, '')
    if (force) return newName
    else {
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

async function promptForEntrypoint (options) {
  const suggestedDefaultPaths = ['src/index.js', 'index.js']
  const invalidPaths = ['.', 'LICENSE', 'README', 'package-lock.json', 'node_modules', 'yarn.lock', 'yarn-error.log', 'package.json', 'Dockerfile', '.log', '.json', '.lock', '.css', '.svg', '.md', '.png', '.disabled', '.ico', '.txt']
  const { entrypoint } = await inquirer.prompt([{
    name: 'entrypoint',
    type: 'fuzzypath',
    message: 'What is your application\'s entrypoint?',
    default: suggestedDefaultPaths.find(p => fs.existsSync(path.join(options.directory, p))),
    excludePath: filepath => invalidPaths.find(p => filepath.endsWith(p)),
    itemType: 'file',
    rootPath: options.directory,
    suggestOnly: false
  }])
  return entrypoint.replace(/\\/g, '/').replace(options.directory, '.')
}

async function promptForImageName (projectName, existingName) {
  const { imageName } = await inquirer.prompt([{
    name: 'imageName',
    type: 'input',
    message:
        'What is the image name for our project? To use docker hub, try username/projectname.\n Note: Make sure this is marked private, or it may be automatically created as a public image!\n',
    default: existingName || `${os.userInfo().username}/${projectName}`
  }
  ])
  return imageName
}

// Promps user for project ports and attempts to suggest best practices
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
            log(`${WARNING} We strongly suggest not using a "low port" - please choose a port above 1024 in your Dockerfile!`)
            return true
          } else if (port >= 65535) {
            return 'Ports higher than 65535 will typically not work, please choose a port between 1024 and 65535!'
          }
        }
        return true
      }
    }
  ])
  return newPorts.replace(/ /g, '').split(',').map(port => parseInt(port, 10)).filter(Boolean)
}

async function promptForIngress (defaultDomain) {
  const { ingressUri } = await inquirer.prompt([{
    name: 'ingressUri',
    type: 'input',
    message:
        'Is this an HTTP service? \nIf so, what URI should be used to access it? (Will not be exposed to the internet if left blank)\n',
    default: defaultDomain && isFQDN(defaultDomain) ? defaultDomain : 'myapp.example.com',
    validate: input => {
      if (input && !isFQDN(input)) return 'Either leave blank, or input a valid DNS name (ie: my.example.com)'
      else return true
    }
  }])
  return ingressUri
}

// Asks the user for the desired kube context. This is a fairly "sticky" point of code.
//  - Sticky reason 1: We assume different users have similarly named contexts.
//    For example, if one user registers "production" to mean a context called "production-1"
//    We should probably handle missing context names a bit better. For now, assume users are naming their contexts consistently :(
//  - Stick reason 2: This is where we inject our "advertisement" of creating a free KubeSail.com namespace.
async function promptForKubeContext (context, kubeConfig) {
  const contexts = kubeConfig.contexts || []
  if (context && contexts.find(c => c.name === context)) {
    return context
  } else {
    if (context) process.stdout.write(`${WARNING} This environment is configured to use the context "${context}", but that wasn't found in your Kube config!\n\n`)
    const kubeContexts = contexts.map(c => c.name)
    if (!kubeConfig.clusters || kubeConfig.clusters.find(c => c.cluster.server.endsWith('kubesail.coadm'))) {
      kubeContexts.push(KUBESAIL_NEW_NAMESPACE_TEXT)
    }
    let { newContext } = await inquirer.prompt([{
      name: 'newContext',
      type: 'list',
      message: 'Which Kubernetes context do you want to deploy to?',
      default: kubeContexts[0],
      choices: kubeContexts
    }])
    // getKubesailConfig will pop the users browser and return with a new valid context if the user signs up.
    if (newContext === KUBESAIL_NEW_NAMESPACE_TEXT) newContext = await getKubesailConfig()
    return newContext
  }
}

// Write out the Kustomization files for a meta-module
async function writeModuleConfiguration (
  env = 'production',
  mod,
  options = { force: false, update: false }
) {
  if (typeof mod !== 'object' || typeof mod.name !== 'string') throw new Error('Invalid module!')
  const modPath = `k8s/dependencies/${mod.name}`
  const deploymentFile = `${mod.kind || 'deployment'}.yaml`
  const resources = [deploymentFile]
  const secrets = {}
  await mkdir(modPath, options)
  await writeDeployment(`${modPath}/${deploymentFile}`, mod.name, mod.image, mod.ports, options)
  if (mod.service) {
    await writeService(`${modPath}/service.yaml`, mod.name, mod.ports, options)
    resources.push('service.yaml')
  }
  await writeKustomization(`${modPath}/kustomization.yaml`, { resources, ...options })
  if (mod.envs) {
    await mkdir(`k8s/overlays/${env}/secrets`, options)
    await writeSecret(`k8s/overlays/${env}/secrets/${mod.name}.env`, { ...options, ...mod })
    secrets[mod.name] = `secrets/${mod.name}.env`
  }
  return { base: `../../../${modPath}`, secrets }
}

function loadAndMergeYAML (path, newData) {
  let yamlStr = ''
  if (fs.existsSync(path)) {
    const existing = yaml.safeLoad(fs.readFileSync(path))
    merge(existing, newData)
    yamlStr = yaml.safeDump(existing)
  } else yamlStr = yaml.safeDump(newData)
  return yamlStr + '\n'
}

// Idempotently writes a line of text to a file
async function writeTextLine (file, line, options = { update: false, force: false, append: false }) {
  let existingContent
  try {
    existingContent = (await readFile(file)).toString()
  } catch (_err) {}
  if (!existingContent || (existingContent && existingContent.indexOf(line) === -1 && options.append)) {
    await confirmWriteFile(file, line + '\n', options)
  }
}

// Writes a simple Kubernetes Deployment object
async function writeDeployment (path, name, image, ports, options = { force: false, update: false }) {
  const resources = { requests: { cpu: '50m', memory: '100Mi' }, limits: { cpu: '2', memory: '1500Mi' } }
  const containerPorts = ports.map(port => { return { containerPort: port } })
  await confirmWriteFile(path, loadAndMergeYAML(path, {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels: { app: name } },
        spec: { containers: [{ name, image, ports: containerPorts, resources }] }
      }
    }
  }), options)
}

// Writes a simple Kubernetes Service object
async function writeService (path, name, ports, options = { force: false, update: false }) {
  await confirmWriteFile(path, loadAndMergeYAML(path, {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name },
    spec: {
      selector: { app: name },
      ports: ports.map(port => { return { port, targetPort: port, protocol: 'TCP' } })
    }
  }), options)
}

// Writes a simple Kubernetes Ingress object
async function writeIngress (path, name, host, port, options = { force: false, update: false }) {
  await confirmWriteFile(path, loadAndMergeYAML(path, {
    apiVersion: 'networking.k8s.io/v1beta1',
    kind: 'Ingress',
    metadata: { name },
    spec: {
      tls: [{ hosts: [host], secretName: name }],
      rules: [{ host, http: { paths: [{ path: '/', backend: { serviceName: name, servicePort: port } }] } }]
    }
  }), options)
}

async function writeKustomization (path, options = { force: false, update: false }) {
  const { resources = [], bases = [], secrets = [] } = options
  await confirmWriteFile(path, loadAndMergeYAML(path, { resources, bases, secrets }), options)
}

async function writeSecret (path, options = { force: false, update: false }) {
  const { envs } = options
  const lines = []
  const existingSecrets = {}
  if (fs.existsSync(path)) {
    const lines = fs.readFileSync(path).toString().split('\n').filter(Boolean)
    lines.forEach(line => {
      existingSecrets[line.slice(0, line.indexOf('='))] = JSON.parse(line.slice(line.indexOf('=') + 1, line.length))
    })
  }
  for (const key in envs) {
    let value = process.env[key] || typeof envs[key] === 'function' ? envs[key](existingSecrets[key]) : envs[key]
    if (value instanceof Promise) value = await value
    lines.push(`${key}="${value}"`)
  }
  await confirmWriteFile(path, lines.join('\n') + '\n', options)
}

async function writeSkaffold (path, context, envs, options = { force: false, update: false }) {
  const { image } = options
  await confirmWriteFile(path, loadAndMergeYAML(path, {
    apiVersion: 'skaffold/v2alpha4',
    kind: 'Config',
    build: { artifacts: [{ image, context, docker: { dockerfile: 'Dockerfile' }, sync: {} }] },
    portForward: [],
    profiles: Object.keys(envs).map(env => { return { name: env, deploy: { kustomize: { paths: [`k8s/overlays/${env}`] } } } })
  }), options)
}

async function init (env = 'production', language, options = { update: false, force: false }) {
  const config = await language.readConfig(options)
  if (!config.envs || !config.envs[env]) config.envs = { [env]: {} }
  if (!validProjectNameRegex.test(env)) return fatal(`Invalid env "${env}" provided!`)
  const envConfig = config.envs[env]

  // Create directory structure
  await mkdir('k8s/base', options)
  await mkdir('k8s/dependencies', options)
  await mkdir(`k8s/overlays/${env}/secrets`, options)

  // Ask some questions if we have missing info in our package.json 'deploy-node-app' configuration:
  const name =
    config.name && validProjectNameRegex.test(config.name)
      ? config.name
      : await promptForPackageName(config.name || path.basename(process.cwd()), options.force)

  // Entrypoint:
  const entrypoint = envConfig.entrypoint && fs.existsSync(path.join(options.directory, envConfig.entrypoint))
    ? envConfig.entrypoint
    : await promptForEntrypoint(options)

  // Container ports:
  const ports = config.ports ? config.ports : await promptForPorts(name, config.ports)

  // If this process listens on a port, write a Kubernetes Service and potentially an Ingress
  let uri = envConfig.uri || ''
  if (ports.length > 0 && !uri) uri = await promptForIngress(config.name)

  // Container image:
  const image = envConfig.image ? envConfig.image : await promptForImageName(name, envConfig.image)

  // Kubernetes Context (Cluster and User):
  const context = await promptForKubeContext(envConfig.context, readLocalKubeConfig(options.config))

  if (options.action === 'deploy') {
    log(`Deploying "${style.green.open}${name}${style.green.close}" to ${style.red.open}${env}${style.red.close}!`)
    if (!options.force && !process.env.CI) await sleep(1500) // Give administrators a chance to exit!
  }

  // Secrets will track secrets created by our dependencies which need to be written out to Kubernetes Secrets
  let secrets = {}

  // Bases is an array of Kustomization directories - this always includes our base structure and also any supported dependencies
  const bases = ['../../base']

  // Resources track resources added by this project, which will go into our base kustomization.yaml file
  const resources = ['./deployment.yaml']

  // Write Dockerfile based on our language
  await confirmWriteFile('Dockerfile', language.dockerfile({ entrypoint, ...options, name, env, ports }), options)

  // Write a Kubernetes Deployment object
  await writeDeployment('k8s/base/deployment.yaml', name, image, ports, { ...options, name, env, ports })

  if (ports.length > 0) {
    await writeService('k8s/base/service.yaml', name, ports, { ...options, name, env, ports })
    resources.push('./service.yaml')
    if (!uri) uri = await promptForIngress(config.name)
    if (uri) {
      await writeIngress('./k8s/base/ingress.yaml', name, uri, ports[0], { ...options, name, env, ports })
      resources.push('./ingress.yaml')
    }
  }

  // Find service modules we support
  const matchedModules = language.matchModules ? await language.matchModules(metaModules, options) : []

  // Add explicitly chosen modules as well
  const chosenModules = [].concat(config.modules || [], options.modules).filter((v, i, s) => s.indexOf(v) === i)
  if (chosenModules.length) {
    chosenModules.forEach(mod => {
      const metaModule = metaModules.find(m => m.name === mod.name)
      if (metaModule) matchedModules.push(metaModule)
    })
  }

  // Add matched modules to our Kustomization file
  for (let i = 0; i < matchedModules.length; i++) {
    const matched = matchedModules[i]
    const { base, secrets: moduleSecrets } = await writeModuleConfiguration(env, matched, options)
    secrets = Object.assign({}, secrets, moduleSecrets)
    bases.push(base)
  }

  // Write Kustomization and Skaffold configuration
  await writeSkaffold('skaffold.yaml', context, config.envs, { ...options, name, image, env, ports })
  await writeKustomization('k8s/base/kustomization.yaml', { ...options, name, env, ports, resources })
  await writeKustomization(`k8s/overlays/${env}/kustomization.yaml`, { ...options, name, env, ports, bases, secrets })

  // Write supporting files - these aren't strictly required, but highly encouraged defaults
  await writeTextLine('.gitignore', 'k8s/overlays/*/secrets/*', { ...options, append: true })
  await writeTextLine('.dockerignore', 'k8s', { ...options, append: true })

  // Finally, let's write out the result of all the questions asked to the package.json file
  // Next time deploy-node-app is run, we shouldn't need to ask the user anything!
  let packageJson = {}
  if (fs.existsSync(path.join(options.directory, 'package.json'))) {
    try {
      packageJson = JSON.parse((await readFile(path.join(options.directory, 'package.json'))).toString())
    } catch (_err) {
      log(`${WARNING} Failed to parse your ./package.json file!`)
    }
  }
  packageJson['deploy-node-app'] = Object.assign({}, packageJson['deploy-node-app'], {
    ports,
    envs: Object.assign({}, (packageJson['deploy-node-app'] || {}).envs, {
      [env]: Object.assign({}, (packageJson['deploy-node-app'] || {})[env], { uri, context, image, entrypoint })
    })
  })
  packageJson.name = name

  await confirmWriteFile('package.json', JSON.stringify(packageJson, null, 2) + '\n', { ...options, update: true })
}

module.exports = async function DeployNodeApp (env, action, language, options) {
  const skaffoldPath = await ensureBinaries(options)
  if (action === 'init') await init(env, language, options)
  else if (action === 'deploy') {
    await init(env, language, options)
    execSyncWithEnv(`${skaffoldPath} deploy --profile=${env}`)
  } else if (action === 'dev') {
    execSyncWithEnv(`${skaffoldPath} dev --profile=${env} --port-forward`)
  } else if (['build'].includes(action)) {
    execSyncWithEnv(`${skaffoldPath} ${action} --profile=${env}`)
  } else {
    process.stderr.write(`No such action "${action}"!\n`)
    process.exit(1)
  }

  if (!options.write) await cleanupWrittenFiles()
}
