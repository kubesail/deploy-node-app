#!/usr/bin/env node
// @flow

const DNA_VERSION = '0.0.1'
const USAGE = '[env]'

const homedir = require('os').homedir()
const path = require('path')
// eslint-disable-next-line security/detect-child-process
const execSync = require('child_process').execSync
const getKubesailConfig = require('get-kubesail-config')
const inquirer = require('inquirer')
inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'))
const fs = require('fs')
const program = require('commander')
const yaml = require('js-yaml')
const style = require('ansi-styles')
const errArrows = `${style.red.open}>>${style.red.close}`
const warning = `${style.green.open}!!${style.green.close}`

const NEW_KUBESAIL_CONTEXT = `KubeSail${style.gray.open} | Deploy on a free Kubernetes namespace${
  style.gray.close
}`
const KUBESAIL_REGISTRY = 'registry.kubesail.io'
const KUBE_CONFIG_PATH = path.join(homedir, '.kube', 'config')

const execToStdout = { stdio: [process.stdin, process.stdout, process.stderr] }

function fatal (message /*: string */) {
  process.stderr.write(`${errArrows} ${message}\n`)
  process.exit(1)
}

const packageJsonPath = 'package.json'

function isInvalidPath (filepath) {
  const invalidPaths = [
    '.git',
    'LICENSE',
    'README',
    'package-lock.json',
    'node_modules',
    'yarn.lock',
    'package.json',
    '.dockerignore',
    'Dockerfile',
    '.editorconfig',
    '.eslintrc.json',
    '.flowconfig'
  ]

  for (let i = 0; i < invalidPaths.length; i++) {
    if (filepath.startsWith(invalidPaths[i])) return true
  }

  return false
}

let packageJson
try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath))
} catch (err) {
  fatal('This doesn\'t appear to be a Node.js application - run \'npm init\'?')
}
if (typeof packageJson.name !== 'string') {
  fatal('Please add a name to your package.json and re-run')
}

async function promptQuestions (
  env /*: string */,
  containerRegistries /*: Array<string> */,
  kubeContexts /*: Array<string> */
) {
  let saved = packageJson['deploy-node-app'] && packageJson['deploy-node-app'][env]
  if (!saved) {
    // Gives some context to what we are about to do and why we are asking questions:
    process.stdout.write(
      `\n${warning} Preparing to deploy ${style.bold.open +
        style.green.open +
        env +
        style.reset.open}...\n\n`
    )
    saved = {}
  }
  // TODO: dont prompt for the above if answers exist in package.json?
  let answers = await inquirer.prompt(
    [
      saved.port
        ? null
        : {
          name: 'port',
          type: 'input',
          message: 'What port does your application listen on?',
          default: '3000',
          validate: function (input) {
            if (isNaN(parseInt(input, 10))) return 'ports must be numbers!'
            return true
          },
          filter: input => parseInt(input, 10)
        },
      saved.protocol
        ? null
        : {
          name: 'protocol',
          type: 'list',
          message: 'Which protocol does your application speak?',
          default: 'http',
          choices: ['http', 'https', 'tcp']
        },
      saved.entrypoint
        ? null
        : {
          name: 'entrypoint',
          type: 'fuzzypath',
          message: 'What is your application\'s entrypoint?',
          default: 'index.js',
          // default: function () {
          //   defaultFiles = [
          //     'index.js',
          //     path.join('src', 'index.js'),
          //     path.join('api', 'index.js')
          //   ]
          //   for (let i = 0; i < defaultFiles.length; i++) {
          //     const filename = defaultFiles[i]
          //     if (fs.existsSync(filename)) {
          //       console.log('returning ' + filename)
          //       return filename
          //     }
          //   }
          // },
          pathFilter: (isDirectory, path) => {
            return !isDirectory && !isInvalidPath(path)
          },

          scanFilter: (_isDirectory, path) => {
            return !isInvalidPath(path)
          },
          rootPath: '.',
          suggestOnly: false,
          validate: function (input) {
            if (!fs.existsSync(input)) return 'That file doesn\'t seem to exist'
            return true
          }
        },
      saved.context
        ? null
        : {
          name: 'context',
          type: 'list',
          message: 'Which Kubernetes context do you want to use?',
          default: kubeContexts[0],
          choices: kubeContexts
        },
      saved.registry
        ? null
        : {
          name: 'registry',
          type: 'list',
          message: 'Which docker registry do you want to use?',
          choices: containerRegistries,
          validate: function (registry) {
            if (!registry.match(/^([a-z0-9]+\.)+[a-z0-9]$/i)) {
              return 'You must provide a valid hostname for a docker registry'
            }
            return true
          }
        }
    ].filter(q => q)
  )
  answers = Object.assign({}, answers, saved)
  answers.registry = answers.registry.replace(/https?:\/\//i, '')
  answers.registry = answers.registry.substr(-1) === '/' ? answers.registry : answers.registry + '/'
  return answers
}

// Only works for kubectl and docker, as they both respond postively to `{command} version`
// The `docker version` command will contact the docker server, and error if it cannot be reached
function checkProgramVersion (input /*: string */) {
  try {
    execSync(`${input} version`)
  } catch (err) {
    return false
  }
  return true
}

function readLocalDockerConfig () {
  // Read local .docker configuration to see if the user has container registries already
  let containerRegistries = []
  const dockerConfigPath = path.join(homedir, '.docker', 'config.json')
  if (fs.existsSync(dockerConfigPath)) {
    try {
      const dockerConfig = JSON.parse(fs.readFileSync(dockerConfigPath))
      containerRegistries = containerRegistries.concat(Object.keys(dockerConfig.auths))
    } catch (err) {
      fatal(
        `It seems you have a Docker config.json file at ${dockerConfigPath}, but it is not valid json, or unreadable!`
      )
    }
  }
  containerRegistries.push(KUBESAIL_REGISTRY)
  return containerRegistries
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
              context.name || ((context.context && context.context.name) || context.context.cluster)
          )
          .filter(context => context)
      )
    } catch (err) {
      fatal(
        `It seems you have a Kubernetes config file at ${KUBE_CONFIG_PATH}, but it is not valid yaml, or unreadable!`
      )
    }
  }
  kubeContexts.push(NEW_KUBESAIL_CONTEXT)
  // TODO minikube deployment context!
  return kubeContexts
}

function buildDockerfile (entrypoint) {
  let dockerfile
  let dockerignore
  const dockerfilePath = 'Dockerfile'
  const dockerignorePath = '.dockerignore'

  if (fs.existsSync(dockerfilePath)) {
    try {
      dockerfile = fs.readFileSync(dockerfilePath)
    } catch (err) {
      fatal(`It seems you have a Dockerfile at ${dockerfilePath}, but it is not readable!`)
    }
  } else {
    // TODO: Detect (or get from options, yarn versus npm)
    dockerfile = `
      FROM node:alpine

      WORKDIR /app

      ENV NODE_ENV="production"

      COPY package.json yarn.loc[k] package-lock.jso[n] /app/

      RUN \
        # apk add build-base make gcc g++ linux-headers python-dev libc-dev libc6-compat && \
        yarn install --no-cache --production && \
        adduser -S nodejs && \
        chown -R nodejs /app && \
        chown -R nodejs /home/nodejs

      COPY . /app/

      USER nodejs

      CMD ["node", "${entrypoint}"]
    `

    fs.writeFileSync(dockerfilePath, dockerfile)
  }

  if (fs.existsSync(dockerignorePath)) {
    try {
      dockerignore = fs.readFileSync(dockerignorePath)
    } catch (err) {
      fatal(
        `It seems you have a .dockerignore file at ${dockerignorePath}, but it is not readable!`
      )
    }
  } else {
    dockerignore = '.git\nnode_modules'
    fs.writeFileSync(dockerignorePath, dockerignore)
  }

  return { dockerfile, dockerignore }
}

async function getDeployTags (env, answers) {
  const tags = {}
  const shortHash = execSync('git rev-parse HEAD')
    .toString()
    .substr(0, 7)
  let prefix = answers.registry
  if (!answers.registryUsername && answers.registry.includes('docker.io')) {
    const { username } = await inquirer.prompt({
      name: 'username',
      type: 'input',
      message: 'What is your docker hub username?',
      validate: function (username) {
        if (username.length < 4) return 'Invalid username'
        return true
      }
    })
    answers.registryUsername = username
  }
  if (answers.registry.includes('docker.io') && answers.registryUsername) {
    prefix = `${answers.registryUsername}/`
  }

  tags.env = `${prefix}${packageJson.name}:${env}`
  tags.hash = `${prefix}${packageJson.name}:${shortHash}`
  return tags
}

async function DeployNodeApp (env /*: string */, opts) {
  if (!checkProgramVersion('docker')) {
    fatal('Error - You might need to install or start docker! https://www.docker.com/get-started')
  }
  if (!checkProgramVersion('kubectl')) {
    fatal(
      'Error - You might need to install kubectl! https://kubernetes.io/docs/tasks/tools/install-kubectl/'
    )
  }
  const kubeContexts = readLocalKubeConfig()
  const containerRegistries = readLocalDockerConfig()

  let answers = await promptQuestions(env, containerRegistries, kubeContexts)
  answers = Object.assign(
    {},
    answers,
    packageJson['deploy-node-app'] && packageJson['deploy-node-app'][env]
  )

  if (answers.context === NEW_KUBESAIL_CONTEXT) {
    const kubesailContext = await getKubesailConfig()
    answers.context = kubesailContext
  }

  buildDockerfile(answers.entrypoint)

  const tags = await getDeployTags(env, answers)

  process.stdout.write(
    `\n${warning} About to deploy ${style.green.open}${style.bold.open}${env}${
      style.green.close
    }: ${tags.env}${style.reset.open}\n\n`
  )

  if (!answers.confirmRegistry) {
    process.stdout.write(
      `${warning} If the docker registry does not exist, it may be automatically created with ${
        style.red.open
      }PUBLIC${style.red.close} access!\n` +
        '   Make sure you have all secrets in your ".dockerignore" file,\n' +
        '   and you may want to make sure your image repository is setup securely!\n\n'
    )

    const { confirm } = await inquirer.prompt([
      {
        name: 'confirm',
        type: 'confirm',
        message: 'Are you sure you want to continue?'
      }
    ])
    if (!confirm) {
      process.exit(1)
    }

    answers.confirmRegistry = confirm
  }

  // TODO: Check if image has already been built - optional?

  if (opts.build) {
    execSync(`docker build . -t ${tags.env} -t ${tags.hash}`, execToStdout)
    execSync(`docker push ${tags.env}`, execToStdout)
    execSync(`docker push ${tags.hash}`, execToStdout)
  }

  const name = packageJson.name.toLowerCase() + '-' + env
  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name
    },
    spec: {
      selector: {
        matchLabels: {
          app: name,
          env: env
        }
      },
      minReadySeconds: 5,
      strategy: {
        type: 'RollingUpdate',
        rollingUpdate: {
          maxSurge: 1,
          maxUnavailable: 0
        }
      },
      replicas: 1,
      template: {
        metadata: {
          labels: {
            app: name,
            env: env
          }
        },
        spec: {
          volumes: [],
          // TODO:
          // imagePullSecrets: [
          //   {
          //     name: 'regsecret'
          //   }
          // ],
          containers: [
            {
              name,
              image: tags.env,
              imagePullPolicy: 'Always',
              ports: [
                {
                  name: answers.protocol,
                  containerPort: parseInt(answers.port, 10)
                }
              ],
              // envFrom: [
              //   {
              //     secretRef: {
              //       name: env
              //     }
              //   }
              // ],
              resources: {
                requests: {
                  cpu: '1m',
                  memory: '32Mi'
                },
                limits: {
                  cpu: '100m',
                  memory: '128Mi'
                }
              }
            }
          ]
        }
      }
    }
  }

  const deploymentFile = `deployment-${env}.yaml`
  const existingDeploymentFile = fs.existsSync(deploymentFile)
  if (!existingDeploymentFile) {
    fs.writeFileSync(deploymentFile, yaml.safeDump(deployment))
  }

  let existingDeployment
  try {
    existingDeployment = execSync(`kubectl --context=${answers.context} get deployment ${name}`, {
      stdio: []
    }).toString()
  } catch (err) {}

  if (!existingDeployment) {
    execSync(`kubectl --context=${answers.context} apply -f ${deploymentFile}`, execToStdout)
  }

  execSync(
    `kubectl --context=${answers.context} set image deployment/${name} ${name}=${tags.hash}`,
    execToStdout
  )

  let serviceWarning = ''
  if (!answers.context.includes('kubesail')) {
    serviceWarning =
      '\nYou may need to expose your deployment on kubernetes via a service.\n' +
      'Learn more: https://kubernetes.io/docs/tutorials/kubernetes-basics/expose/expose-intro/.\n'
  }
  process.stdout.write('\n\n✨  Your application has been deployed! ✨\n\n\n' + serviceWarning)

  // TODO: warn if node_modules is not in .dockerignore or .gitignore

  if (answers.registry === KUBESAIL_REGISTRY) {
    connectKubeSail()
  }

  // TODO: Prompt if its okay to write to package.json
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath))
  packageJson['deploy-node-app'] = {
    [env]: answers
  }
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
  process.exit(0)
}

program
  .arguments('[env]')
  .usage(USAGE)
  .version(DNA_VERSION)
  .option('-n, --no-build', 'Don\'t build and push docker container')
  // .option('-A, --auto', 'Deploy without asking too many questions!')
  .parse(process.argv)

// Default to production environment
// TODO: Pass auto argument (and others) to DeployNodeApp
DeployNodeApp(program.args[0] || 'production', program)
