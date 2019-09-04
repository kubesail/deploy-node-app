// @flow

const style = require('ansi-styles')
const fs = require('fs')
const path = require('path')
const homedir = require('os').homedir()
const yaml = require('js-yaml')
const inquirer = require('inquirer')
// eslint-disable-next-line security/detect-child-process
const execSync = require('child_process').execSync
const commandExists = require('command-exists')
const chalk = require('chalk')

const WARNING = `${style.green.open}!!${style.green.close}`
const ERR_ARROWS = `${style.red.open}>>${style.red.close}`
const KUBE_CONFIG_PATH = path.join(homedir, '.kube', 'config')
const NEW_KUBESAIL_CONTEXT = `KubeSail${style.gray.open} | Deploy on a free Kubernetes namespace${style.gray.close}`

function fatal (message /*: string */) {
  process.stderr.write(`${ERR_ARROWS} ${message}\n`)
  process.exit(1)
}

const execSyncWithEnv = (cmd, options = {}) => {
  const mergedOpts = Object.assign({}, options, {
    catchErr: true,
    env: Object.assign({}, process.env, options.env)
  })
  let output
  try {
    output = execSync(cmd, mergedOpts)
  } catch (err) {
    if (mergedOpts.catchErr) {
      fatal(`Command "${cmd}" failed to run`)
      process.exit(1)
    } else {
      throw err
    }
  }
  if (output) return output.toString().trim()
}

function ensureBinaries (format) {
  if (!commandExists.sync('docker')) {
    fatal('Error - Please install docker! https://www.docker.com/get-started')
  }

  if (format === 'k8s') {
    if (!commandExists.sync('kubectl')) {
      fatal(
        'Error - Please install kubectl! https://kubernetes.io/docs/tasks/tools/install-kubectl/'
      )
    }

    try {
      const {
        clientVersion: { major, minor }
      } = JSON.parse(execSyncWithEnv('kubectl version --client=true -o json'))

      if (parseInt(major, 10) < 1 || parseInt(minor, 10) < 14) {
        process.stdout.write(
          `${style.red.open}>> deploy-node-app requires kubectl v1.14 or higher.${style.red.close}\n\n`
        )
        process.stdout.write('You can fix this ')

        const install = chalk.cyan('brew install kubernetes-cli')
        const upgrade = chalk.cyan('brew upgrade kubernetes-cli')
        let cmd
        switch (process.platform) {
          case 'darwin':
            cmd = `${install}\n\nor\n\n  ${upgrade}`
            process.stdout.write(
              `by running\n\n  ${cmd}\n\nor by following the instructions at https://kubernetes.io/docs/tasks/tools/install-kubectl/#install-kubectl-on-macos\n`
            )
            break
          case 'linux':
            cmd = `${style.cyan.open}sudo apt-get install kubectl${style.reset.open}`
            process.stdout.write(
              `by running\n\n  ${cmd}\n\nor by following the instructions at https://kubernetes.io/docs/tasks/tools/install-kubectl/#install-kubectl-on-linux\n`
            )
            break
          case 'win32':
            cmd = `${style.cyan.open}choco install kubernetes-cli${style.reset.open}`
            process.stdout.write(
              `by running \n\n  ${cmd}\n\nor by following the instructions at https://kubernetes.io/docs/tasks/tools/install-kubectl/#install-kubectl-on-windows\n`
            )
            break
          default:
            process.stdout.write(
              'by following the instructions at https://kubernetes.io/docs/tasks/tools/install-kubectl/'
            )
        }
        process.exit(1)
      }
    } catch (_err) {
      fatal('Could not determine kubectl version')
    }
  }
}

async function getDeployTags (name, answers, shouldBuild) {
  if (answers.name) name = answers.name
  const tags = { name }
  tags.shortHash = execSyncWithEnv('git rev-parse HEAD')
    .toString()
    .substr(0, 7)

  tags.prefix = answers.registry
  if (!answers.registryUsername && answers.registry.includes('docker.io') && shouldBuild) {
    const { username } = await inquirer.prompt({
      name: 'username',
      type: 'input',
      message: 'What is your docker hub username?',
      validate: function (username) {
        if (username.length <= 1) return 'Invalid username'
        return true
      }
    })
    answers.registryUsername = username
  }
  if (answers.registry.includes('docker.io') && answers.registryUsername) {
    tags.prefix = `${answers.registryUsername}/`
  }

  tags.image = `${tags.prefix}${name}`
  tags.hash = `${tags.image}:${tags.shortHash}`
  return tags
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
      if (!dockerConfig.auths) {
        fatal(
          `Your Docker config contains no registries. Try running ${chalk.cyan('docker login')}`
        )
        return
      }
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

function shouldUseYarn () {
  try {
    execSync('yarnpkg --version', { stdio: 'ignore' })
    return true
  } catch (e) {
    return false
  }
}

module.exports = {
  getDeployTags,
  execSyncWithEnv,
  readLocalKubeConfig,
  readLocalDockerConfig,
  readKubeConfigNamespace,
  shouldUseYarn,
  fatal,
  WARNING,
  ensureBinaries,
  NEW_KUBESAIL_CONTEXT
}
