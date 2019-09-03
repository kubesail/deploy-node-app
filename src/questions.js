// @flow

const style = require('ansi-styles')
const fs = require('fs')
const getKubesailConfig = require('get-kubesail-config')
const { fatal, NEW_KUBESAIL_CONTEXT, WARNING } = require('./util')
const inquirer = require('inquirer')
inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'))

const DOCKER_HUB_DOMAIN = 'index.docker.io'
const DOCKER_HUB_SUFFIX = ` ${style.gray.open}(Docker Hub)${style.gray.close}`

async function promptQuestions (
  env /*: string */,
  containerRegistries /*: Array<string> */,
  kubeContexts /*: Array<string> */,
  packageJson /*: Object */,
  format /*: string */
) {
  let saved = packageJson['deploy-node-app'] && packageJson['deploy-node-app'][env]

  if (!saved) {
    // Gives some context to what we are about to do and why we are asking questions:
    process.stdout.write(
      `${WARNING} Preparing to deploy to ${style.bold.open +
        style.green.open +
        env +
        style.reset.open}...\n`
    )
    saved = {}
  }

  saved.entrypoint =
    saved.entrypoint ||
    (packageJson.main && fs.existsSync(packageJson.main) ? packageJson.main : null)

  let answers = saved
  let quickConfig = false
  if (format === 'k8s') {
    if (!saved.context || !kubeContexts.includes(saved.context)) {
      if (kubeContexts.length === 1 && kubeContexts[0] === NEW_KUBESAIL_CONTEXT) {
        const kubesailAnswer = await inquirer.prompt([
          {
            name: 'quickConfig',
            type: 'confirm',
            message:
              'You don\'t appear to have a Kubernetes config.\n' +
              '  This tool can configure a free kubernetes namespace on \n' +
              '  KubeSail in order to help you deploy your application easily.\n' +
              '  You will be redirected to the Kubesail website.\n' +
              '\n' +
              '  Would you like to continue?'
          }
        ])

        if (!kubesailAnswer.quickConfig) {
          fatal('You can add a Kubernetes config and re-run this script.')
          process.exit(1)
        }

        quickConfig = kubesailAnswer.quickConfig
      } else if (kubeContexts.length > 1) {
        const { context } = await inquirer.prompt([
          {
            name: 'context',
            type: 'list',
            message: 'Which Kubernetes context do you want to deploy to?',
            default: kubeContexts[0],
            choices: kubeContexts
          }
        ])
        answers.context = context
        if (context === NEW_KUBESAIL_CONTEXT) {
          quickConfig = true
        }
      } else {
        process.stdout.write(
          `${WARNING} Using Kubernetes context ${style.bold.open +
            style.green.open +
            kubeContexts[0] +
            style.reset.open}...\n`
        )
        answers.context = kubeContexts[0]
      }

      if (quickConfig) {
        const kubesailContext = await getKubesailConfig()
        answers.context = kubesailContext
      }
    }
  }

  // TODO default docker installation has 0 container registries -- in this case prompt to use dockerhub? allow login?
  if (containerRegistries.length === 0) {
    containerRegistries.push('https://index.docker.io/v1/')
  }
  const onlyDockerHub =
    containerRegistries.length === 1 && containerRegistries[0].includes(DOCKER_HUB_DOMAIN)

  if (env === 'dev') {
    answers.registry = ''
  } else {
    if (quickConfig) {
      answers.registry = 'https://index.docker.io/v1/' // TODO set up the kubesail registry and use that here instead
    } else {
      if (onlyDockerHub) {
        answers.registry = containerRegistries[0]
      } else if (!answers.registry && !onlyDockerHub) {
        const registryAnswer = await inquirer.prompt([
          {
            name: 'registry',
            type: 'list',
            message: 'Which docker registry do you want to use?',
            choices: containerRegistries
              .sort(registry => (registry.includes(DOCKER_HUB_DOMAIN) ? -1 : 0))
              .map(registry =>
                registry.includes(DOCKER_HUB_DOMAIN) ? registry + DOCKER_HUB_SUFFIX : registry
              ),
            validate: registry =>
              !registry.match(/^([a-z0-9]+\.)+[a-z0-9]$/i)
                ? 'You must provide a valid hostname for a docker registry'
                : true
          }
        ])
        answers.registry = registryAnswer.registry
      }
    }
  }

  const portQuestion = {
    name: 'port',
    type: 'input',
    message:
      'What port does your application listen on? (If not applicable, press enter to continue)',
    default: 'None',
    validate: function (input) {
      if (input === '' || input === 'None') return true
      if (isNaN(parseInt(input, 10))) return 'ports must be numbers!'
      return true
    },
    filter: input => (input === 'None' || !input ? 'None' : parseInt(input, 10))
  }
  if (!answers.port) {
    const portAnswers = await inquirer.prompt([portQuestion])
    answers.port = portAnswers.port
  }

  const appQuestions = []
  if (typeof answers.port === 'number') {
    if (!saved.protocol) {
      appQuestions.push({
        name: 'protocol',
        type: 'list',
        message: 'Which protocol does your application speak?',
        default: 'http',
        choices: ['http', 'https', 'tcp']
      })
    }
  }

  if (!saved.entrypoint) {
    const invalidPaths = [
      '.DS_Store',
      '.git',
      'LICENSE',
      'README',
      'package-lock.json',
      'node_modules',
      'yarn.lock',
      'yarn-error.log',
      'package.json',
      '.dockerignore',
      'Dockerfile',
      '.editorconfig',
      '.eslintrc.json',
      '.flowconfig'
    ]
    const invalidExtensions = [
      '.log',
      '.json',
      '.lock',
      '.css',
      '.svg',
      '.md',
      '.html',
      '.png',
      '.disabled',
      '.ico',
      '.txt'
    ]

    let defaultPath
    const suggestedDefaultPaths = ['index.js', 'src/index.js']
    for (let i = 0; i < suggestedDefaultPaths.length; i++) {
      if (fs.existsSync(suggestedDefaultPaths[i])) defaultPath = suggestedDefaultPaths[i]
    }

    appQuestions.push({
      name: 'entrypoint',
      type: 'fuzzypath',
      message: 'What is your application\'s entrypoint?',
      // TODO for default, provide a callback with an array of common entry points.
      // the 'inquirer-fuzzy-path' plugin currently does not respect default at all
      default: defaultPath,
      excludePath: filepath => {
        for (let i = 0; i < invalidPaths.length; i++) {
          if (filepath.startsWith(invalidPaths[i])) return true
        }
        for (let i = 0; i < invalidExtensions.length; i++) {
          if (filepath.substr(-1 * invalidExtensions[i].length) === invalidExtensions[i]) {
            return true
          }
        }
      },
      itemType: 'file',
      rootPath: '.',
      suggestOnly: false
    })
  }

  if (appQuestions.length > 0) {
    const appAnswers = await inquirer.prompt(appQuestions)
    answers = Object.assign({}, saved, answers, appAnswers)
  }

  if (answers.registry) {
    answers.registry = answers.registry.replace(DOCKER_HUB_SUFFIX, '')
    answers.registry = answers.registry.replace(/https?:\/\//i, '')
    answers.registry =
      answers.registry.substr(-1) === '/' ? answers.registry : answers.registry + '/'
  }
  return answers
}

module.exports = { promptQuestions }
