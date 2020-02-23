// @flow

const style = require('ansi-styles')
const fs = require('fs')
const path = require('path')
const util = require('util')
const homedir = require('os').homedir()
const yaml = require('js-yaml')
const inquirer = require('inquirer')
// eslint-disable-next-line security/detect-child-process
const execSync = require('child_process').execSync
const commandExists = require('command-exists')
const chalk = require('chalk')
const merge = require('lodash/merge')
const diff = require('diff')

const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)

const WARNING = `${style.green.open}!!${style.green.close}`
const ERR_ARROWS = `${style.red.open}>>${style.red.close}`
const KUBE_CONFIG_PATH = path.join(homedir, '.kube', 'config')
const NEW_KUBESAIL_CONTEXT = `KubeSail${style.gray.open} | Deploy on a free Kubernetes namespace${style.gray.close}`

function fatal (message /*: string */) {
  process.stderr.write(`${ERR_ARROWS} ${message}\n`)
  process.exit(1)
}

function log () {
  // eslint-disable-next-line no-console
  console.log(...arguments)
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

function ensureBinaries () {
  if (!commandExists.sync('docker')) {
    fatal('Error - Please install docker! https://www.docker.com/get-started')
  }
  if (!commandExists.sync('kubectl')) {
    fatal('Error - Please install kubectl! https://kubernetes.io/docs/tasks/tools/install-kubectl/')
  }
  if (!commandExists.sync('skaffold')) {
    fatal('Error - Please install skaffold! https://skaffold.dev/docs/install/')
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
 *
 * The meat and potatoes of Deploy-Node-App, confirmWriteFile takes either a string of content or a template file
 * and copies it to the users directory. It will prompt the user, unless:
 *   --overwrite is set, in which case any changes will be writen without asking
 *   -o - is set, in which case we will write our outputs to stdout, not prompting and not writing
 * confirmWriteFile also supports diffing!
 * Provide only one of content or templatePath!
 */
async function confirmWriteFile (
  filePath,
  { content, templatePath, output, properties, overwrite = false, silence = false }
) {
  const fullPath = path.join(process.cwd(), filePath)
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
  } catch (_err) {}
  if (overwrite) {
    doWrite = true
  } else {
    if (output !== '-') {
      // If existing file matches the content we're about to write, then bail early
      if (existingContent === (content || template)) {
        return false
      }
    }

    if (existingContent && !silence) {
      const YES_TEXT = 'Yes (overwrite)'
      const NO_TEXT = 'No, dont touch'
      const SHOWDIFF_TEXT = 'Show diff'
      const context = filePath === 'package.json' ? ', to save your answers to these questions' : ''
      const confirmOverwrite = (
        await inquirer.prompt({
          name: 'overwrite',
          type: 'expand',
          message: `Would you like to update "${filePath}"${context}?`,
          choices: [
            { key: 'Y', value: YES_TEXT },
            { key: 'N', value: NO_TEXT },
            { key: 'D', value: SHOWDIFF_TEXT }
          ],
          default: 0
        })
      ).overwrite
      if (confirmOverwrite === YES_TEXT) doWrite = true
      else if (confirmOverwrite === SHOWDIFF_TEXT) {
        await tryDiff(content || template, fullPath)
        await confirmWriteFile(filePath, { templatePath, content, properties })
      }
    } else if (existingContent && silence) {
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
