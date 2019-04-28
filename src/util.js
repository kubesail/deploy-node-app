const style = require('ansi-styles')
const fs = require('fs')
const path = require('path')
const homedir = require('os').homedir()
const yaml = require('js-yaml')
// eslint-disable-next-line security/detect-child-process
const execSync = require('child_process').execSync

const WARNING = `${style.green.open}!!${style.green.close}`
const ERR_ARROWS = `${style.red.open}>>${style.red.close}`
const KUBE_CONFIG_PATH = path.join(homedir, '.kube', 'config')
const NEW_KUBESAIL_CONTEXT = `KubeSail${style.gray.open} | Deploy on a free Kubernetes namespace${
  style.gray.close
}`

function fatal (message /*: string */) {
  process.stderr.write(`${ERR_ARROWS} ${message}\n`)
  process.exit(1)
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

  // TODO add minikube deployment context
  if (kubeContexts.filter(context => context.startsWith('kubesail-')).length === 0) {
    kubeContexts.push(NEW_KUBESAIL_CONTEXT)
  }
  return kubeContexts
}

function readKubeConfigNamespace (context) {
  try {
    const kubeConfig = yaml.safeLoad(fs.readFileSync(KUBE_CONFIG_PATH))
    const namespace = kubeConfig.contexts.find(({ name }) => name === context).context.namespace
    return namespace
  } catch (err) {
    return null
  }
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

  // TODO add KUBESAIL_REGISTRY
  return containerRegistries
}

function buildUiDockerfile (staticDir = '/build') {
  const dockerfilePath = 'Dockerfile.ui'
  const dockerfile = `
  FROM nginx
  COPY ${staticDir} /usr/share/nginx/html`

  fs.writeFileSync(dockerfilePath, dockerfile)
}

function buildDockerfile (entrypoint) {
  // convert windows paths to unix paths
  entrypoint = entrypoint.replace(/\\/g, '/')

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

RUN \\
  # apk add build-base make gcc g++ linux-headers python-dev libc-dev libc6-compat && \\
  yarn install --no-cache --production && \\
  adduser -S nodejs && \\
  chown -R nodejs /app && \\
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

function shouldUseYarn () {
  try {
    execSync('yarnpkg --version', { stdio: 'ignore' })
    return true
  } catch (e) {
    return false
  }
}

module.exports = {
  readLocalKubeConfig,
  readLocalDockerConfig,
  buildUiDockerfile,
  buildDockerfile,
  readKubeConfigNamespace,
  shouldUseYarn,
  fatal,
  WARNING,
  NEW_KUBESAIL_CONTEXT
}
