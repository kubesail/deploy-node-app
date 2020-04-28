// Deploy Node App (deploy-node-app) - Develop and deploy Node.js apps with Kubernetes, with zero config!
// developed by KubeSail.com!

const fs = require('fs')
const os = require('os')
const path = require('path')
const chalk = require('chalk')
const inquirer = require('inquirer')
const { isFQDN } = require('validator')
const yaml = require('js-yaml')
const merge = require('lodash/merge')
const style = require('ansi-styles')
const getKubesailConfig = require('get-kubesail-config')
inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'))
const { fatal, log, debug, mkdir, cleanupWrittenFiles, readDNAConfig, ensureBinaries, writeTextLine, execSyncWithEnv, confirmWriteFile } = require('./util')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const WARNING = `${style.yellow.open}!!${style.yellow.close}`

// Load meta-modules! These match dependency packages to files in ./modules - these files in turn build out Kubernetes resources!
const metaModules = [
  require('./modules/mongodb'),
  require('./modules/postgres'),
  require('./modules/redis')
]

const languages = [
  require('./languages/nodejs'),
  require('./languages/python'),
  require('./languages/ruby'),
  require('./languages/nginx') // It's important that Nginx is last - plenty of other projects will include static html files
]

// Only allow projects that are valid dns components - we will prompt the user for a different name if this is name matched
const validProjectNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/i

// Read local .kube configuration
let kubeConfig = {}
function readLocalKubeConfig (configPathOption) {
  const configPath = configPathOption || path.join(os.homedir(), '.kube', 'config')
  debug(`Using kube config ${configPath}`)
  if (!fs.existsSync(configPath)) return {}
  try {
    kubeConfig = yaml.safeLoad(fs.readFileSync(configPath))
  } catch (err) {
    fatal(`It seems you have a Kubernetes config file at ${configPath}, but it is not valid yaml, or unreadable! Error: ${err.message}`)
  }
}

// promptForPackageName tries to get a URI-able name out of a project using validProjectNameRegex
// This ensures a DNS-valid name for Kuberentes as well as for container registries, etc.
async function promptForPackageName (packageName = '', force = false, message = 'What should we name this service?\n') {
  const sanitizedName = packageName.split('.')[0]
  if (force && validProjectNameRegex.test(sanitizedName)) {
    process.stdout.write(`${WARNING} Using project name ${chalk.green.bold(sanitizedName)}...\n\n`)
    return sanitizedName
  } else {
    const newName = packageName.replace(/[^a-z0-9-]/gi, '')
    if (force) return newName
    else {
      process.stdout.write('\n')
      const { name } = await inquirer.prompt([
        {
          name: 'name',
          type: 'input',
          message,
          default: newName,
          validate: input => (validProjectNameRegex.test(input) ? true : 'Invalid name!')
        }
      ])
      return name
    }
  }
}

async function promptForEntrypoint (language, options) {
  if (fs.existsSync('./package.json')) {
    const packageJson = JSON.parse(fs.readFileSync('./package.json'))
    if (packageJson.scripts) {
      const choices = Object.keys(packageJson.scripts).map(k => `npm run ${k}`)
      const chooseFile = 'Choose a file or command instead'
      choices.push(chooseFile)
      const defaultValue = choices.includes('start') ? 'start' : choices[0]
      const { entrypoint } = await inquirer.prompt([{
        name: 'entrypoint',
        type: 'list',
        message: 'Which command starts your application? (From package.json)',
        default: defaultValue,
        choices
      }])
      if (entrypoint && entrypoint !== chooseFile) return entrypoint
    }
  }

  const suggestedDefaultPaths = language.suggestedEntrypoints || ['src/index.js', 'index.js', 'index.py', 'src/index.py', 'public/index.html', 'main.py', 'server.py', 'index.html']
  const invalidPaths = ['LICENSE', 'README', 'package-lock.json', 'node_modules', 'yarn.lock', 'yarn-error.log', 'package.json', 'Dockerfile', '.log', '.json', '.lock', '.css', '.svg', '.md', '.png', '.disabled', '.ico', '.txt']
  process.stdout.write('\n')
  const defaultValue = suggestedDefaultPaths.find(p => fs.existsSync(path.join(options.target, p)))
  const { entrypoint } = await inquirer.prompt([{
    name: 'entrypoint',
    type: 'fuzzypath',
    message: 'What command or file starts your application? (eg: "npm run server", "index.html", "bin/start.sh")',
    default: defaultValue,
    excludePath: filepath => invalidPaths.find(p => filepath.endsWith(p)),
    itemType: 'file',
    rootPath: options.target,
    suggestOnly: true
  }])
  const response = entrypoint.replace(/\\/g, '/').replace(options.target, '.')
  if (!response) return defaultValue
  else return response
}

async function promptForImageName (projectName, existingName) {
  process.stdout.write('\n')
  const { imageName } = await inquirer.prompt([{
    name: 'imageName',
    type: 'input',
    message:
        'What is the image name for our project? To use docker hub, try username/projectname. Note: Make sure this is marked private, or it may be automatically created as a public image!',
    default: existingName || `${os.userInfo().username}/${projectName}`
  }])
  return imageName
}

// Promps user for project ports and attempts to suggest best practices
async function promptForPorts (existingPorts = [], language) {
  process.stdout.write('\n')
  const { newPorts } = await inquirer.prompt([
    {
      name: 'newPorts',
      type: 'input',
      message: 'Does your app listen on any ports? If so, please enter them comma separated',
      default: existingPorts.length > 0 ? existingPorts.join(', ') : (language.suggestedPorts || [8000]).join(', '),
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

async function promptForIngress () {
  process.stdout.write('\n')
  const { ingressUri } = await inquirer.prompt([{
    name: 'ingressUri',
    type: 'input',
    message:
        'Is this an HTTP service? If so, what public URI will be used to access it? (Will not be exposed to the internet if left blank)',
    validate: input => {
      if (input && (input.startsWith('http://') || input.startsWith('https://'))) {
        input = input.replace(/^https?:\/\//, '')
      }
      if (input && !isFQDN(input)) return 'Either leave blank, or input a valid DNS name (ie: my.example.com)'
      else return true
    }
  }])
  return ingressUri || ''
}

// Asks the user if they'd like to create a KubeSail.com context, if they have none.
async function promptForCreateKubeContext () {
  if (!kubeConfig || !kubeConfig.clusters || !kubeConfig.clusters.length) {
    process.stdout.write('\n')
    const { createKubeSailContext } = await inquirer.prompt([{
      name: 'createKubeSailContext',
      type: 'confirm',
      message: 'It looks like you have no Kubernetes cluster configured. Would you like to create a free Kubernetes namespace on KubeSail.com?\n'
    }])
    // getKubesailConfig will pop the users browser and return with a new valid context if the user signs up.
    if (createKubeSailContext) kubeConfig = await getKubesailConfig()
    fatal('You\'ll need a Kubernetes config before continuing!')
  }
}

// Asks the user if there are additional artifacts they'd like to add to their configuration
async function promptForAdditionalArtifacts (options) {
  if (!options.prompts) return false
  process.stdout.write('\n')
  const { additionalArtifacts } = await inquirer.prompt([{
    name: 'additionalArtifacts',
    type: 'confirm',
    default: false,
    message: 'Would you like to add an additional entrypoint? (ie: Is this a mono-repo?)\n'
  }])
  return additionalArtifacts
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
  await writeDeployment(`${modPath}/${deploymentFile}`, { ...options, ...mod, secrets })
  return { base: `../../../${modPath}`, secrets }
}

function loadAndMergeYAML (path, newData) {
  if (!newData) throw new Error('loadAndMergeYAML handed null newData')
  let yamlStr = ''
  if (fs.existsSync(path)) {
    const existing = yaml.safeLoad(fs.readFileSync(path))
    merge(existing, newData)
    if (typeof existing !== 'object') throw new Error('loadAndMergeYAML null existing')
    yamlStr = yaml.safeDump(existing)
  } else yamlStr = yaml.safeDump(newData)
  return yamlStr + '\n'
}

// Writes a simple Kubernetes Deployment object
async function writeDeployment (path, options = { force: false, update: false }) {
  const { name, entrypoint, image, ports = [], secrets = [] } = options
  const resources = { requests: { cpu: '50m', memory: '100Mi' }, limits: { cpu: '2', memory: '1500Mi' } }
  const containerPorts = ports.map(port => { return { containerPort: port } })

  const container = { name, image, ports: containerPorts, resources }
  if (entrypoint) container.command = entrypoint.split(' ').filter(Boolean)

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
  const envNames = Object.keys(envs)
  await confirmWriteFile(path, loadAndMergeYAML(path, {
    apiVersion: 'skaffold/v2beta2',
    kind: 'Config',
    portForward: [],
    build: {
      artifacts: envNames.map(e => envs[e].map(a => { return { image: a.image } })).flat()
    },
    profiles: envNames.map(envName => {
      const env = envs[envName]
      return {
        name: envName,
        deploy: { kustomize: { paths: [`k8s/overlays/${envName}`] } },
        build: {
          artifacts: env.map(a => {
            const language = languages.find(l => l.name === a.language)
            if (!language) throw new Error('Unable to detect language in writeSkaffold!')
            return language.artifact
              ? language.artifact(envName, a.image)
              : {
                image: a.image,
                sync: { manual: [{ src: 'src/**/*.js', dest: '.' }] },
                docker: { buildArgs: { ENV: envName } }
              }
          })
        }
      }
    })
  }), options)
}

async function generateArtifact (env = 'production', envConfig, language, options = { update: false, force: false }) {
  // Ask some questions if we have missing info in our 'deploy-node-app' configuration:
  let name = options.name || envConfig.name
  const baseDirName = path.basename(process.cwd())
  if (!name && validProjectNameRegex.test(baseDirName)) name = baseDirName
  if (options.forceNew || !name || !validProjectNameRegex.test(name)) name = await promptForPackageName(envConfig.find(e => e.name === name) ? `${baseDirName}-new` : baseDirName, options.force)
  // If there is another artifact in this env with the same name but a different entrypoint, let's ask the user for a different name
  if (options.forceNew) {
    while (envConfig.find(e => e.name === name)) {
      name = await promptForPackageName(`${baseDirName}-new`, options.force, 'It looks like that name is already used! Pick a different name for this artifact:\n')
    }
  }

  // If create a kube config if none already exists
  if (options.prompts) {
    readLocalKubeConfig(options.config)
    await promptForCreateKubeContext()
  }

  // Entrypoint:
  let entrypoint = options.entrypoint || (envConfig[0] && envConfig[0].entrypoint) || await promptForEntrypoint(language, options)
  if (options.forceNew) entrypoint = await promptForEntrypoint(language, options)
  let artifact = envConfig.find(e => e.entrypoint === entrypoint) || {}

  // Container ports:
  let ports = options.ports || artifact.ports
  if (!ports || ports === 'none') ports = []
  if (ports.length === 0 && !artifact.ports) ports = await promptForPorts(artifact.ports, language)

  // If this process listens on a port, write a Kubernetes Service and potentially an Ingress
  let uri = options.address || artifact.uri
  if (ports.length > 0 && uri === undefined) uri = await promptForIngress()

  // Secrets will track secrets created by our dependencies which need to be written out to Kubernetes Secrets
  const secrets = []

  // Bases is an array of Kustomization directories - this always includes our base structure and also any supported dependencies
  const bases = []

  // Resources track resources added by this project, which will go into our base kustomization.yaml file
  const resources = []

  // Create directory structure
  await mkdir(`k8s/overlays/${env}`, options)
  for (let i = 0; i < envConfig.length; i++) {
    mkdir(`k8s/base/${envConfig[i].name}`, options)
    bases.push(`../../base/${envConfig[i].name}`)
  }

  // Write Dockerfile based on our language
  await confirmWriteFile('Dockerfile', language.dockerfile({ ...options, entrypoint, name, env }), options)

  // Write a Kubernetes Deployment object
  await mkdir(`k8s/base/${name}`, options)
  await writeDeployment(`k8s/base/${name}/deployment.yaml`, { ...options, name, entrypoint, ports, secrets })
  resources.push('./deployment.yaml')

  if (ports.length > 0) {
    await writeService(`k8s/base/${name}/service.yaml`, name, ports, { ...options, name, env, ports })
    resources.push('./service.yaml')
    if (uri) {
      await writeIngress(`k8s/base/${name}/ingress.yaml`, name, uri, ports[0], { ...options, name, env, ports })
      resources.push('./ingress.yaml')
    }
  }

  // Write Kustomization configuration
  await writeKustomization(`k8s/base/${name}/kustomization.yaml`, { ...options, env, ports, resources, secrets: [] })

  // Return the new, full configuration for this environment
  artifact = Object.assign({}, artifact, { name, uri, image: options.image, entrypoint, ports, language: language.name })
  if (!envConfig.find(a => a.entrypoint === artifact.entrypoint)) envConfig.push(artifact)
  return envConfig.map(a => {
    if (a.entrypoint === artifact.entrypoint) return Object.assign({}, a, artifact)
    else return a
  })
}

async function init (env = 'production', language, config, options = { update: false, force: false }) {
  if (!config.envs) config.envs = {}
  if (!config.envs[env]) config.envs[env] = []
  if (!validProjectNameRegex.test(env)) return fatal(`Invalid env "${env}" provided!`)
  let envConfig = config.envs[env]

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

  const bases = []
  let secrets = []

  // Container image (Note that we assume one Docker image per project, even if there are multiple entrypoints / artifacts)
  // Users with multi-language mono-repos probably should eject and design their own Skaffold configuration :)
  const image = options.image ? options.image : (envConfig[0] && envConfig[0].image ? envConfig[0].image : await promptForImageName(path.basename(process.cwd())))

  // Add matched modules to our Kustomization file
  for (let i = 0; i < matchedModules.length; i++) {
    const matched = matchedModules[i]
    const { base, secrets: moduleSecrets } = await writeModuleConfiguration(env, matched, options)
    secrets = secrets.concat(moduleSecrets)
    bases.push(base)
  }

  // Re-generate our artifacts
  const numberOfArtifactsAtStart = parseInt(envConfig.length, 10) // De-reference
  for (let i = 0; i < envConfig.length; i++) {
    envConfig = await generateArtifact(env, envConfig, language, { ...options, ...envConfig[i], image })
  }
  // Always generateArtifact if there are no artifacts
  if (numberOfArtifactsAtStart === 0) {
    envConfig = await generateArtifact(env, envConfig, language, { ...options, image })
  }
  // If we're writing our very first artifact, or if we've explictly called --add
  if (numberOfArtifactsAtStart === 0 || options.add) {
    while (await promptForAdditionalArtifacts(options)) {
      const newConfig = await generateArtifact(env, envConfig, language, { ...options, image, forceNew: true })
      envConfig = envConfig.map(e => {
        if (newConfig.name === e.name) return newConfig
        return e
      })
    }
  }

  envConfig.forEach(e => bases.push(`../../base/${e.name}`))
  config.envs[env] = envConfig

  // Write supporting files - note that it's very important that users ignore secrets!!!
  // TODO: We don't really offer any sort of solution for secrets management (git-crypt probably fits best)
  await writeTextLine('.gitignore', 'k8s/overlays/*/secrets/*', { ...options, append: true, dontPrune: true })
  await writeTextLine('.dockerignore', 'k8s', { ...options, append: true, dontPrune: true })
  await writeKustomization(`k8s/overlays/${env}/kustomization.yaml`, { ...options, env, bases, secrets })
  await writeSkaffold('skaffold.yaml', config.envs, options)
  await confirmWriteFile('.dna.json', JSON.stringify(config, null, 2) + '\n', { ...options, update: true, force: true, dontPrune: true })
}

module.exports = async function DeployNodeApp (env, action, options) {
  if (!env) env = 'production'
  if (!action) {
    if (env === 'dev' || env === 'development') action = 'dev'
    else action = 'deploy'
  }
  const skaffoldPath = await ensureBinaries(options)
  const config = await readDNAConfig(options)

  let language
  for (let i = 0; i < languages.length; i++) {
    if (
      (options.language && options.language === languages[i].name) ||
      (config.language && config.language === languages[i].name) ||
      (!options.language && await languages[i].detect(options))
    ) {
      language = languages[i]
      break
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

  if (action === 'init') {
    options.write = true
    options.update = true
  }
  if (action === 'add') options.update = true
  await init(env, language, config, options)

  let SKAFFOLD_NAMESPACE = 'default'
  if (kubeConfig && kubeConfig['current-context'] && kubeConfig.contexts) {
    const context = kubeConfig.contexts.find(c => c.name === kubeConfig['current-context'])
    if (context.namespace) SKAFFOLD_NAMESPACE = context.namespace
  }
  const execOptions = { stdio: 'inherit', catchErr: false, env: { SKAFFOLD_NAMESPACE } }

  if (action === 'init') {
    // Already done!
  } else if (action === 'deploy') {
    await deployMessage()
    execSyncWithEnv(`${skaffoldPath} run --profile=${env}`, execOptions)
  } else if (action === 'dev') {
    execSyncWithEnv(`${skaffoldPath} dev --profile=${env} --port-forward`, execOptions)
  } else if (['build'].includes(action)) {
    execSyncWithEnv(`${skaffoldPath} ${action} --profile=${env}`, execOptions)
  } else {
    process.stderr.write(`No such action "${action}"!\n`)
    process.exit(1)
  }
}
