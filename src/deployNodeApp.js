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
const { fatal, log, debug, mkdir, cleanupWrittenFiles, readConfig, ensureBinaries, writeTextLine, execSyncWithEnv, confirmWriteFile } = require('./util')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const WARNING = `${style.yellow.open}!!${style.yellow.close}`

// Load meta-modules! These match dependency packages to files in ./modules - these files in turn build out Kubernetes resources!
const metaModules = [
  require('./modules/redis'),
  require('./modules/kafka'),
  require('./modules/postgres'),
  require('./modules/redis')
]

const languages = [
  require('./languages/nginx'),
  require('./languages/nodejs'),
  require('./languages/php'),
  require('./languages/python'),
  require('./languages/ruby')
]

// Only allow projects that are valid dns components - we will prompt the user for a different name if this is name matched
const validProjectNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/i

// Read local .kube configuration
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
      process.stdout.write('\n')
      const { name } = await inquirer.prompt([
        {
          name: 'name',
          type: 'input',
          message: 'What should we name this project?\n',
          default: newName,
          validate: input => (validProjectNameRegex.test(input) ? true : 'Invalid name!')
        }
      ])
      return name
    }
  }
}

async function promptForEntrypoint (options) {
  // TODO: suggestedDefaultPaths should probably be informed by Language
  const suggestedDefaultPaths = ['src/index.js', 'index.js', 'index.py', 'src/index.py', 'public/index.html', 'main.py', 'server.py', 'index.html']
  const invalidPaths = ['.', 'LICENSE', 'README', 'package-lock.json', 'node_modules', 'yarn.lock', 'yarn-error.log', 'package.json', 'Dockerfile', '.log', '.json', '.lock', '.css', '.svg', '.md', '.png', '.disabled', '.ico', '.txt']
  process.stdout.write('\n')
  const { entrypoint } = await inquirer.prompt([{
    name: 'entrypoint',
    type: 'fuzzypath',
    message: 'What command or file starts your application? (eg: "npm run server", "index.html", "bin/start.sh")',
    default: suggestedDefaultPaths.find(p => fs.existsSync(path.join(options.target, p))),
    excludePath: filepath => invalidPaths.find(p => filepath.endsWith(p)),
    itemType: 'file',
    rootPath: options.target,
    suggestOnly: true
  }])
  return entrypoint.replace(/\\/g, '/').replace(options.target, '.')
}

async function promptForImageName (projectName, existingName) {
  process.stdout.write('\n')
  const { imageName } = await inquirer.prompt([{
    name: 'imageName',
    type: 'input',
    message:
        'What is the image name for our project? To use docker hub, try username/projectname. Note: Make sure this is marked private, or it may be automatically created as a public image!',
    default: existingName || `${os.userInfo().username}/${projectName}`
  }
  ])
  return imageName
}

// Promps user for project ports and attempts to suggest best practices
async function promptForPorts (existingPorts = []) {
  process.stdout.write('\n')
  const { newPorts } = await inquirer.prompt([
    {
      name: 'newPorts',
      type: 'input',
      message: 'Does your app listen on any ports? If so, please enter them comma separated',
      default: existingPorts.length > 0 ? existingPorts.join(', ') : '8000',
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
  process.stdout.write('\n')
  const { ingressUri } = await inquirer.prompt([{
    name: 'ingressUri',
    type: 'input',
    message:
        'Is this an HTTP service? If so, what URI should be used to access it? (Will not be exposed to the internet if left blank)',
    default: defaultDomain && isFQDN(defaultDomain) ? defaultDomain : null,
    validate: input => {
      if (input && !isFQDN(input)) return 'Either leave blank, or input a valid DNS name (ie: my.example.com)'
      else return true
    }
  }])
  return ingressUri
}

// Asks the user if they'd like to create a KubeSail.com context, if they have none.
async function promptForCreateKubeContext (kubeConfig) {
  if (!kubeConfig.clusters || !kubeConfig.clusters.length) {
    process.stdout.write('\n')
    const { createKubeSailContext } = await inquirer.prompt([{
      name: 'createKubeSailContext',
      type: 'confirm',
      message: 'It looks like you have no Kubernetes cluster configured. Would you like to create a free Kubernetes namespace on KubeSail.com?\n'
    }])
    // getKubesailConfig will pop the users browser and return with a new valid context if the user signs up.
    if (createKubeSailContext) return await getKubesailConfig()
    fatal('You\'ll need a Kubernetes config before continuing!')
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
  const secrets = []
  await mkdir(modPath, options)
  if (mod.ports && mod.ports.length > 0) {
    await writeService(`${modPath}/service.yaml`, mod.name, mod.ports, options)
    resources.push('service.yaml')
  }
  await writeKustomization(`${modPath}/kustomization.yaml`, { ...options, resources, secrets: [] })
  if (mod.envs) {
    await mkdir(`k8s/overlays/${env}/secrets`, options)
    await writeSecret(`k8s/overlays/${env}/secrets/${mod.name}.env`, { ...options, ...mod, env })
    secrets.push({ name: mod.name, path: `secrets/${mod.name}.env` })
  }
  await writeDeployment(`${modPath}/${deploymentFile}`, mod.name, mod.image, mod.ports, secrets, options)
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

// Writes a simple Kubernetes Deployment object
async function writeDeployment (path, name, image, ports = [], secrets = [], options = { force: false, update: false }) {
  const resources = { requests: { cpu: '50m', memory: '100Mi' }, limits: { cpu: '2', memory: '1500Mi' } }
  const containerPorts = ports.map(port => { return { containerPort: port } })

  const container = { name, image, ports: containerPorts, resources }
  if (secrets.length > 0) {
    container.envFrom = secrets.map(secret => {
      return { secretRef: { name: secret.name } }
    })
  }

  await confirmWriteFile(path, loadAndMergeYAML(path, {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels: { app: name } },
        spec: { containers: [container] }
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
  const { resources = [], bases = [], secrets = {} } = options
  const kustomization = { resources, bases }
  if (secrets.length > 0) {
    kustomization.secretGenerator = []
    for (let i = 0; i < secrets.length; i++) {
      kustomization.secretGenerator.push({ name: secrets[i].name, envs: [secrets[i].path] })
    }
  }
  await confirmWriteFile(path, loadAndMergeYAML(path, kustomization), options)
}

async function writeSecret (path, options = { force: false, update: false }) {
  const { envs } = options
  const lines = []
  const existingSecrets = {}
  await mkdir(`k8s/overlays/${options.env}/secrets`, { ...options, dontPrune: true })
  if (fs.existsSync(path)) {
    const lines = fs.readFileSync(path).toString().split('\n').filter(Boolean)
    lines.forEach((line, i) => {
      try {
        existingSecrets[line.slice(0, line.indexOf('='))] = line.slice(line.indexOf('=') + 1, line.length)
      } catch (err) {
        log(`${WARNING} Failed to parse secret from "${path}", line ${i + 1}`)
      }
    })
  }
  for (const key in envs) {
    let value = (process.env[key] || typeof envs[key] === 'function')
      ? envs[key](existingSecrets[key], options)
      : envs[key]
    if (value instanceof Promise) value = await value
    lines.push(`${key}=${value}`)
  }
  await confirmWriteFile(path, lines.join('\n') + '\n', { ...options, dontPrune: true })
}

async function writeSkaffold (path, envs, options = { force: false, update: false }) {
  const { image, language } = options
  await confirmWriteFile(path, loadAndMergeYAML(path, {
    apiVersion: 'skaffold/v2beta2',
    kind: 'Config',
    portForward: [],
    build: { artifacts: [{ image }] },
    profiles: Object.keys(envs).map(env => {
      return {
        name: env,
        deploy: { kustomize: { paths: [`k8s/overlays/${env}`] } },
        build: {
          artifacts: [
            language.artifact
              ? language.artifact(env, options)
              : {
                image,
                sync: {
                  manual: [
                    { src: 'src/**/*.js', dest: '.' }
                  ]
                },
                docker: { buildArgs: { ENV: env } }
              }
          ]
        }
      }
    })
  }), options)
}

async function init (env = 'production', language, config, options = { update: false, force: false }) {
  if (!config.envs || !config.envs[env]) config.envs = { [env]: {} }
  if (!validProjectNameRegex.test(env)) return fatal(`Invalid env "${env}" provided!`)
  const envConfig = config.envs[env]

  // Create directory structure
  await mkdir('k8s/base', options)
  await mkdir(`k8s/overlays/${env}`, options)

  // Ask some questions if we have missing info in our package.json 'deploy-node-app' configuration:
  let name = options.name || config.name
  const baseDirName = path.basename(process.cwd())
  if (validProjectNameRegex.test(baseDirName)) name = baseDirName
  if (!name || !validProjectNameRegex.test(name)) name = await promptForPackageName(baseDirName, options.force)

  // Entrypoint:
  let entrypoint = envConfig.entrypoint || options.entrypoint
  if (entrypoint && !fs.existsSync(path.join(options.target, entrypoint))) {
    log(`${WARNING} The entrypoint "${entrypoint}" doesn't exist!`)
    entrypoint = undefined
  }
  if (!entrypoint) entrypoint = await promptForEntrypoint(options)

  // Container ports:
  let ports = config.ports || options.ports
  if (!ports || ports === 'none') ports = []
  if (ports.length === 0 && !config.ports) ports = await promptForPorts(config.ports)

  // If this process listens on a port, write a Kubernetes Service and potentially an Ingress
  let uri = options.address || envConfig.uri || ''
  if (ports.length > 0 && !uri) uri = await promptForIngress(config.name)

  // Container image:
  const image = options.image ? options.image : (envConfig.image ? envConfig.image : await promptForImageName(name, envConfig.image))

  // If create a kube config if none already exists
  await promptForCreateKubeContext(readLocalKubeConfig(options.config))

  // Secrets will track secrets created by our dependencies which need to be written out to Kubernetes Secrets
  let secrets = []

  // Bases is an array of Kustomization directories - this always includes our base structure and also any supported dependencies
  const bases = ['../../base']

  // Resources track resources added by this project, which will go into our base kustomization.yaml file
  const resources = ['./deployment.yaml']

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
  if (matchedModules.length > 0) debug(`Adding configuration for submodules: "${matchedModules.join(', ')}"`)

  // Add matched modules to our Kustomization file
  for (let i = 0; i < matchedModules.length; i++) {
    const matched = matchedModules[i]
    const { base, secrets: moduleSecrets } = await writeModuleConfiguration(env, matched, options)
    secrets = secrets.concat(moduleSecrets)
    bases.push(base)
  }

  // Write Dockerfile based on our language
  await confirmWriteFile('Dockerfile', language.dockerfile({ ...options, entrypoint, name, env, ports }), options)

  // Write a Kubernetes Deployment object
  await writeDeployment('k8s/base/deployment.yaml', name, image, ports, secrets, { ...options, name, env, ports })

  if (ports.length > 0) {
    await writeService('k8s/base/service.yaml', name, ports, { ...options, name, env, ports })
    resources.push('./service.yaml')
    if (uri) {
      await writeIngress('k8s/base/ingress.yaml', name, uri, ports[0], { ...options, name, env, ports })
      resources.push('./ingress.yaml')
    }
  }

  // Write Kustomization and Skaffold configuration
  await writeSkaffold('skaffold.yaml', config.envs, { ...options, language, name, image, env, ports })
  await writeKustomization('k8s/base/kustomization.yaml', { ...options, name, env, ports, resources, secrets: [] })
  await writeKustomization(`k8s/overlays/${env}/kustomization.yaml`, { ...options, name, env, ports, bases, secrets })

  // Write supporting files - note that it's very important that users ignore secrets!!!
  // TODO: We don't really offer any sort of solution for secrets management (git-crypt probably fits best)
  await writeTextLine('.gitignore', 'k8s/overlays/*/secrets/*', { ...options, append: true, dontPrune: true })
  await writeTextLine('.dockerignore', 'k8s', { ...options, append: true, dontPrune: true })

  // Finally, let's write out the result of all the questions asked to the package.json file
  // Next time deploy-node-app is run, we shouldn't need to ask the user anything!
  let packageJson = {}
  const packageJsonPath = path.join(options.target, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    try {
      packageJson = JSON.parse((await readFile(packageJsonPath)).toString())
    } catch (_err) {
      log(`${WARNING} Failed to parse your ./package.json file!`)
    }
  }
  packageJson['deploy-node-app'] = Object.assign({}, packageJson['deploy-node-app'], {
    language: language.name,
    ports,
    envs: Object.assign({}, (packageJson['deploy-node-app'] || {}).envs, {
      [env]: Object.assign({}, (packageJson['deploy-node-app'] || {})[env], { uri, image, entrypoint })
    })
  })
  packageJson.name = name

  await confirmWriteFile('package.json', JSON.stringify(packageJson, null, 2) + '\n', { ...options, update: true, force: options.force || options.write, dontPrune: true })
}

module.exports = async function DeployNodeApp (env, action, options) {
  const skaffoldPath = await ensureBinaries(options)
  const config = await readConfig(options)

  let language
  for (let i = 0; i < languages.length; i++) {
    if (
      (options.language && options.language === languages[i].name) ||
      (config.language && config.language === languages[i].name) ||
      (!options.language && await languages[i].detect(options))
    ) {
      language = languages[i]
    }
  }
  if (!language) {
    return fatal('Unable to determine what sort of project this is. If it\'s a real project, please let us know at https://github.com/kubesail/deploy-node-app/issues and we\'ll add support!')
  }

  if (!options.write) process.on('beforeExit', () => cleanupWrittenFiles(options))

  async function deployMessage () {
    log(`Deploying to ${style.red.open}${env}${style.red.close}!`)
    if (!options.force && !process.env.CI) await sleep(1000) // Give administrators a chance to exit!
  }

  if (action === 'init') options.write = true
  await init(env, language, config, options)

  if (action === 'init') {
    // Already done!
  } else if (action === 'deploy') {
    await deployMessage()
    execSyncWithEnv(`${skaffoldPath} run --profile=${env}`, { stdio: 'inherit' })
  } else if (action === 'dev') {
    execSyncWithEnv(`${skaffoldPath} dev --profile=${env} --port-forward`, { stdio: 'inherit' })
  } else if (['build'].includes(action)) {
    execSyncWithEnv(`${skaffoldPath} ${action} --profile=${env}`, { stdio: 'inherit' })
  } else {
    process.stderr.write(`No such action "${action}"!\n`)
    process.exit(1)
  }
}
