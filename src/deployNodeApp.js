// @flow

const fs = require('fs')
const util = require('util')
const path = require('path')

const inquirer = require('inquirer')
const yaml = require('js-yaml')
const chalk = require('chalk')
const merge = require('lodash/merge')
const diff = require('diff')
require('dotenv').config()

const {
  getDeployTags,
  execSyncWithEnv,
  readLocalKubeConfig,
  readKubeConfigNamespace,
  readLocalDockerConfig,
  ensureBinaries
} = require('./util')
const { promptQuestions } = require('./questions')

const CONFIG_FILE_PATH = 'inf'
const WWW_FILE_PATH = 'src/www'

const readFile = util.promisify(fs.readFile)
const statFile = util.promisify(fs.stat)
const writeFile = util.promisify(fs.writeFile)
const mkdir = util.promisify(fs.mkdir)

async function deployNodeApp (packageJson /*: Object */, env /*: string */, opts /*: Object */) {
  const output = opts.output
  const silence = output === '-'
  const prompts = !opts.confirm
  const overwrite = opts.overwrite
  const cwd = process.cwd()
  const execOpts = {
    stdio: [process.stdin, opts.output !== '-' ? process.stdout : null, process.stderr]
  }
  let svcMsg = ''

  function log () {
    if (silence) return
    // eslint-disable-next-line no-console
    console.log(...arguments)
  }

  function fatal (msg) {
    console.error(chalk.red(`>> ${msg}`))
    process.exit(1)
  }

  let handleUi = false
  try {
    handleUi = !!(await statFile(WWW_FILE_PATH))
  } catch {}

  const format = ['kube', 'kubernetes', 'k8s'].includes(opts.format)
    ? 'k8s'
    : opts.format === 'compose'
      ? 'compose'
      : null
  if (!format) {
    fatal('ERROR: Unsupported format option provided!')
    process.exit(1)
  }

  /**
   * Discovers "meta-module" packages within the package.json dep tree
   * Returns an array of package.json blobs from deps marked with a special key
   */
  async function findMetaModules (packageJson /*: Object */) /*: Array<Object> */ {
    const depNames = Object.keys(packageJson.dependencies)
    const readFiles = depNames.map(async dep => {
      try {
        return await readFile(path.join('node_modules', dep, 'package.json')).then(json =>
          JSON.parse(json)
        )
      } catch (err) {
        console.error('Unable to load package.json:', err.message)
        return Promise.resolve(null)
      }
    })
    const files = await Promise.all(readFiles)
    // filter out deps without a package.json and without any specified deployments
    return files
      .filter(file => file !== null)
      .filter(file => file['deploy-node-app'] && file['deploy-node-app'].metamodule === true)
  }

  /**
   * Concatenates all environment variables from all metamodules
   * Returns a flat object of KEYS and VALUES where KEYS are environment variables and VALUES are their data
   */
  async function generateEnv (
    metaModules /*: Array<Object> */,
    detectPorts /*: void|'compose'|'k8s' */
  ) /*: Array<Object> */ {
    let envVars = {}
    for (let i = 0; i < metaModules.length; i++) {
      const mm = metaModules[i]
      const metadata = mm['deploy-node-app']

      const configFile = metadata.config || 'lib/config.js'
      if (await statFile(`node_modules/${mm.name}/${configFile}`)) {
        try {
          // eslint-disable-next-line security/detect-non-literal-require
          const vars = require(path.join(cwd, 'node_modules', mm.name, configFile))
          for (const env in vars) {
            if (envVars[env]) {
              log(
                `WARN: MetaModule "${mm.name}" overwrites an already existing environment variable, "${env}"! Conflicting metamodules?`
              )
            }
            envVars[env] = vars[env]
          }
        } catch (err) {
          fatal(
            `Unable to include MetaModule "${mm.name}"'s configuration file!\nConfig file: "${configFile}\n"`,
            err.message
          )
        }
      }

      if (detectPorts && metadata.ports) {
        for (const portName in metadata.ports) {
          const portSpec = metadata.ports[portName]
          const name = metadata.containerName || mm.name.split('/').pop()
          if (detectPorts === 'compose') {
            envVars = Object.assign({}, envVars, await detectComposePorts(name, portName, portSpec))
          } else if (detectPorts) {
            fatal('generateEnv() detectPorts is only available via docker-compose for now, sorry!')
          }
        }
      } else {
        if (metadata.ports) {
          Object.keys(metadata.ports).forEach(env => delete envVars[env])
        }
      }

      if (detectPorts && metadata.host) {
        let host = 'localhost'
        if (process.env.DOCKER_HOST) {
          host = new URL(process.env.DOCKER_HOST).hostname
        }
        envVars[metadata.host] = host
      } else {
        if (metadata.host) {
          delete envVars[metadata.host]
        }
      }
    }
    return envVars
  }

  function buildComposeFile (metaModules /*: Array<Object> */) {
    let services = {}
    metaModules.forEach(dependency => {
      const filename = `./node_modules/${dependency.name}/docker-compose.yaml`
      if (fs.existsSync(filename)) {
        const config = yaml.safeLoad(fs.readFileSync(filename))
        services = Object.assign({}, services, config.services)
      } else {
        process.stdout.write('Warning:', dependency.name, 'doesn\'t support Docker Compose mode\n')
      }
    })

    return {
      version: '3',
      services
    }
  }

  async function buildKustomize (
    metaModules /*: Array<Object> */,
    { bases = [], resources = [] } /*: { bases: Array<string>, resources: Array<string> } */
  ) {
    for (let i = 0; i < metaModules.length; i++) {
      const mm = metaModules[i]
      if (await statFile(`./node_modules/${mm.name}/kustomization.yaml`)) {
        bases.push(`../../node_modules/${mm.name}`)
      } else {
        process.stdout.write('Warning:', mm.name, 'doesn\'t support Kustomize mode\n')
      }
    }
    return { bases, resources }
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

  /**
   * Calls on docker-compose to provide us with port mapping information
   * In other words, if we know redis has a docker port assignment of 6379/tcp, we can
   * try our best to find the randomized hostPort. This allows for zero port conflicts between projects1
   * as well as a sort of "forced best practice", in that the driver -must- obey the randomized PORT value to work!
   */
  async function detectComposePorts (
    name /*: string */,
    portName /*: string */,
    portSpec /*: string */
  ) {
    const ports = {}
    let composeFileFound
    try {
      composeFileFound = await statFile(`${cwd}/docker-compose.yaml`)
    } catch {}
    if (!composeFileFound) {
      log(
        'WARN: It doesn\'t look like docker-compose is used here, so I can\'t automatically detect ports for you - using default values!'
      )
      return {}
    }
    const containers = (await execSyncWithEnv(`docker-compose ps -q ${name}`)).split('\n')
    if (containers.length === 1 && containers[0] === '') {
      fatal(
        'Failed to discover ports. You have some containers that are not yet running. Please run "docker-compose up" first.'
      )
    }
    for (const container of containers) {
      ports[portName] = await execSyncWithEnv(
        `docker inspect ${container} --format="{{(index (index .NetworkSettings.Ports \\"${portSpec}\\") 0).HostPort}}"`
      )
    }
    return ports
  }

  function checkForGitIgnored (pattern /*: string */) {
    try {
      execSyncWithEnv(`git grep "^${pattern}$" .gitignore`, { catchErr: false })
    } catch (err) {
      log(`WARN: It doesn't look like you have ${pattern} ignored by your .gitignore file!`)
      log(`WARN: This is usually a bad idea! Fix with: "echo '${pattern}' >> .gitignore"`)
    }
  }

  /**
   *
   * The meat and potatoes of Deploy-Node-App, confirmWriteFile takes either a string of content or a template file
   * and copies it to the users directory. It will prompt the user, unless:
   *   --overwrite is set, in which case any changes will be writen without asking
   *   -o - is set, in which case we will write our outputs to stdout, not prompting and not writing
   * confirmWriteFile also supports diffing!
   * Provide only one of content or templatePath!
   */
  async function confirmWriteFile (
    filePath /*: string */,
    {
      content,
      templatePath,
      output,
      properties
    } /*: {
      content: string,
      templatePath: string,
      output: string,
      properties: Object|void
    } */
  ) {
    const fullPath = path.join(cwd, filePath)
    const fullTemplatePath = templatePath ? path.join(__dirname, templatePath) : null

    let template
    if (templatePath) {
      template = (await readFile(fullTemplatePath)).toString()
      if (properties && templatePath.endsWith('.yaml')) {
        template = yaml.safeLoad(template)
        merge(template, properties)
        template = yaml.safeDump(template) + '\n'
      }
    }

    if (content && templatePath) throw new Error('Provide only one of content, templatePath')
    let doWrite = false
    let existingContent
    try {
      existingContent = (await readFile(fullPath)).toString()
    } catch {}
    if (overwrite) {
      doWrite = true
    } else {
      if (output !== '-') {
        // If existing file matches the content we're about to write, then bail early
        if (existingContent === (content || template)) {
          return false
        }
      }

      if (existingContent && prompts && !silence) {
        const YES_TEXT = 'Yes (overwrite)'
        const NO_TEXT = 'No, dont touch'
        const SHOWDIFF_TEXT = 'Show diff'
        const confirmOverwrite = (await inquirer.prompt({
          name: 'overwrite',
          type: 'expand',
          message: `Would you like to update "${filePath}"?`,
          choices: [
            { key: 'Y', value: YES_TEXT },
            { key: 'N', value: NO_TEXT },
            { key: 'D', value: SHOWDIFF_TEXT }
          ],
          default: 0
        })).overwrite
        if (confirmOverwrite === YES_TEXT) doWrite = true
        else if (confirmOverwrite === SHOWDIFF_TEXT) {
          await tryDiff(content || template, fullPath)
          await confirmWriteFile(filePath, { templatePath, content, properties })
        }
      } else if (existingContent && !prompts) {
        log(
          `Refusing to overwrite "${filePath}"... Continuing... (Use --overwrite to ignore this check)`
        )
      } else if (!existingContent) {
        doWrite = true
      }
    }

    if (!doWrite && output !== '-') {
      return false
    } else if (content || template) {
      try {
        if (output === '-') process.stdout.write((content || template) + '\n')
        else await writeFile(fullPath, content || template)
        log(`Successfully ${content ? 'wrote' : 'wrote from template'} "${filePath}"`)
      } catch (err) {
        fatal(`Error writing ${filePath}: ${err.message}`)
      }
      return true
    } else throw new Error('Please provide one of content, templatePath for confirmWriteFile')
  }

  //
  // Begin deploy-node-app
  //
  if (opts.format === 'k8s') {
    await mkdir(path.join(CONFIG_FILE_PATH, env, 'secrets'), { recursive: true })
  }
  const metaModules = await findMetaModules(packageJson)

  if (opts.generateDefaultEnv || opts.generateLocalPortsEnv) {
    const envVars = await generateEnv(metaModules, opts.generateLocalPortsEnv ? opts.format : null)
    const envVarLines = []
    for (const env in envVars) {
      envVarLines.push(`${env}=${envVars[env]}`)
    }
    const content = envVarLines.join('\n') + '\n'
    checkForGitIgnored('.env')
    if (opts.format === 'k8s') {
      checkForGitIgnored('secrets/')
    }
    if (output === '-') process.stdout.write(content)
    else await confirmWriteFile('.env', { content, output })
    return null
  }

  ensureBinaries(opts.format) // Ensure 'kubectl', 'docker', etc...
  const kubeContexts = readLocalKubeConfig()
  const containerRegistries = opts.format === 'k8s' ? readLocalDockerConfig() : []
  const answers = await promptQuestions(
    env,
    containerRegistries,
    kubeContexts,
    packageJson,
    opts.format
  )
  const tags = await getDeployTags(packageJson.name, answers, opts.build)

  if (!packageJson['deploy-node-app']) packageJson['deploy-node-app'] = {}
  packageJson['deploy-node-app'][env] = answers

  await confirmWriteFile('package.json', { content: JSON.stringify(packageJson, null, 2) + '\n' })
  await confirmWriteFile('Dockerfile', { templatePath: 'defaults/Dockerfile' })

  const usingKubeSail = answers.context && answers.context.includes('kubesail')
  const secrets = []
  if (opts.format === 'k8s') {
    const resources = []
    for (let i = 0; i < metaModules.length; i++) {
      const metaModule = metaModules[i]
      const envVars = await generateEnv([metaModule], null)
      const stringData = {}
      for (const env in envVars) {
        stringData[env] = envVars[env]
      }
      const mmParts = metaModule.name.split('/')
      const mmName = mmParts.length > 1 ? mmParts[mmParts.length - 1] : mmParts[0]
      secrets.push(mmName)
      const relativeFilePath = path.join('secrets', `${mmName}-secret.yaml`)
      resources.push(relativeFilePath)
      await confirmWriteFile(path.join(CONFIG_FILE_PATH, env, relativeFilePath), {
        content: yaml.safeDump({
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: { name: mmName },
          stringData
        }),
        output: opts.output
      })
    }

    const backendDeployment = `${handleUi ? 'backend-' : ''}deployment.yaml`
    const backendService = `${handleUi ? 'backend-' : ''}service.yaml`
    const frontendDeployment = 'frontend-deployment.yaml'
    const frontendService = 'frontend-service.yaml'
    const frontendConfigMap = 'frontend-configmap.yaml'

    // Write deployment config for Node app
    resources.push(path.join('.', backendDeployment))
    await confirmWriteFile(path.join(CONFIG_FILE_PATH, env, backendDeployment), {
      templatePath: 'defaults/backend-deployment.yaml',
      properties: {
        metadata: {
          name: packageJson.name + (handleUi ? '-backend' : ''),
          labels: { app: packageJson.name }
        },
        spec: {
          selector: { matchLabels: { app: packageJson.name } },
          template: {
            metadata: {
              labels: { app: packageJson.name }
            },
            spec: {
              containers: [
                {
                  image: tags.hash,
                  name: packageJson.name,
                  command: ['node', answers.entrypoint],
                  ports: [{ containerPort: answers.port }],
                  envFrom: secrets.map(name => {
                    return { secretRef: { name } }
                  })
                }
              ]
            }
          }
        }
      }
    })
    // Write service config for Node app
    resources.push(path.join('.', backendService))
    await confirmWriteFile(path.join(CONFIG_FILE_PATH, env, backendService), {
      templatePath: 'defaults/backend-service.yaml',
      properties: {
        metadata: {
          name: packageJson.name + (handleUi ? '-backend' : '')
        },
        spec: {
          selector: { app: packageJson.name },
          ports: [{ port: answers.port, targetPort: answers.port }]
        }
      }
    })

    // Write deployment config for WWW
    if (handleUi) {
      // Write Nginx ConfigMap
      resources.push(path.join('.', frontendConfigMap))
      await confirmWriteFile(path.join(CONFIG_FILE_PATH, env, frontendConfigMap), {
        templatePath: 'defaults/frontend-configmap.yaml',
        properties: {
          data: {
            'nginx.conf': `
              worker_processes 1;
              error_log stderr info;
              pid /tmp/nginx.pid;

              events {
                worker_connections  1024;
              }

              http {
                include /etc/nginx/mime.types;
                default_type application/octet-stream;
                log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                                  '$status $body_bytes_sent "$http_referer" '
                                  '"$http_user_agent" "$http_x_forwarded_for"';
                access_log stdout main;
                sendfile on;
                keepalive_timeout 65;

                server {
                  access_log stdout;
                  listen 8080;
                  root /app/build;
                  location /api {
                    proxy_pass http://${packageJson.name}-backend:${answers.port};
                  }
                }

              }`
          }
        }
      })
      // Write Nginx Deployment
      resources.push(path.join('.', frontendDeployment))
      await confirmWriteFile(path.join(CONFIG_FILE_PATH, env, frontendDeployment), {
        templatePath: 'defaults/frontend-deployment.yaml',
        properties: {
          metadata: {
            name: `${packageJson.name}-frontend`,
            labels: { app: packageJson.name }
          },
          spec: {
            selector: { matchLabels: { app: packageJson.name } },
            template: {
              metadata: { labels: { app: packageJson.name } },
              spec: {
                containers: [
                  {
                    image: tags.hash,
                    name: packageJson.name
                  }
                ]
              }
            }
          }
        }
      })
      const namespace = readKubeConfigNamespace(answers.context)
      resources.push(path.join('.', frontendService))
      await confirmWriteFile(path.join(CONFIG_FILE_PATH, env, frontendService), {
        templatePath: 'defaults/frontend-service.yaml',
        properties: {
          metadata: {
            name: `${packageJson.name}-frontend`,
            annotations: usingKubeSail
              ? {
                'getambassador.io/config': yaml.safeDump({
                  apiVersion: 'ambassador/v1',
                  kind: 'Mapping',
                  name: `${packageJson.name}-frontend.${namespace}`,
                  prefix: '/',
                  service: `http://${packageJson.name}-frontend.${namespace}:80`,
                  timeout_ms: 30000,
                  use_websocket: true
                })
              }
              : null
          },
          spec: { selector: { app: packageJson.name } }
        }
      })
    }
    // Write kustomization config
    await confirmWriteFile(path.join(CONFIG_FILE_PATH, env, 'kustomization.yaml'), {
      content: yaml.safeDump(await buildKustomize(metaModules, { resources }))
    })
  } else {
    const composeFileData = buildComposeFile(metaModules)
    const composeFileDataYAML = yaml.safeDump(composeFileData)
    await confirmWriteFile('docker-compose.yaml', {
      content: composeFileDataYAML + '\n',
      output
    })
    // TODO: Write docker compose for static files / nginx
  }

  await confirmWriteFile('.dockerignore', { templatePath: path.join('defaults', '.dockerignore') })

  // Build
  if (opts.build) {
    log(`Now building "${tags.hash}"`)
    execSyncWithEnv(`docker build . -t ${tags.hash}`, execOpts)
  }

  if (opts.push) {
    execSyncWithEnv(`docker push ${tags.hash}`, execOpts)
  }

  // Deploy
  if (opts.deploy) {
    if (env !== 'dev') log(`Now deploying "${tags.hash}"`)

    if (opts.format === 'k8s') {
      const kustomizationDir = path.join(CONFIG_FILE_PATH, env)
      const cmd = `kubectl --context=${answers.context} apply -k ${kustomizationDir}`
      log(`Running: \`${cmd}\``)
      execSyncWithEnv(cmd, execOpts)
      // Deploy service

      const noHostMsg =
        '\nYou may need to expose your deployment on kubernetes via a service.\n' +
        'Learn more: https://kubernetes.io/docs/tutorials/kubernetes-basics/expose/expose-intro/.'
      if (handleUi && usingKubeSail) {
        const svc = execSyncWithEnv(
          `kubectl --context=${answers.context} get svc ${packageJson.name}-frontend -o json`
        )
        try {
          const configStr = JSON.parse(svc).metadata.annotations['getambassador.io/config']
          let host
          try {
            host = JSON.parse(configStr).host
          } catch {
            host = yaml.safeLoadAll(configStr)[0].host
          }
          svcMsg += '\nYour App is available at:' + `\n\n    ${chalk.cyan(`https://${host}\n`)}\n`
        } catch {
          svcMsg += noHostMsg
        }
      } else {
        svcMsg += noHostMsg
      }
    } else {
      execSyncWithEnv('docker-compose up --remove-orphans --quiet-pull -d')
    }
    if (env !== 'dev') log(`\n\n✨  Your application has been deployed! ✨\n\n${svcMsg}`)
  }
}

module.exports = {
  deployNodeApp
}
