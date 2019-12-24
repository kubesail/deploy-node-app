// @flow

const fs = require('fs')
const getKubesailConfig = require('get-kubesail-config')
const { fatal, NEW_KUBESAIL_CONTEXT, WARNING } = require('./util')
const inquirer = require('inquirer')
const chalk = require('chalk')
inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'))

const DOCKER_HUB_DOMAIN = 'index.docker.io'
const DOCKER_HUB_SUFFIX = ` ${chalk.gray('(Docker Hub)')}`

async function promptQuestions (
  env /*: string */,
  containerRegistries /*: Array<string> */,
  kubeContexts /*: Array<string> */,
  packageJson /*: Object */,
  { format, output, overwrite }
) {
  const appQuestions = []
  let saved = packageJson['deploy-node-app'] && packageJson['deploy-node-app'][env]

  if (!saved) {
    // Gives some context to what we are about to do and why we are asking questions:
    process.stdout.write(`${WARNING} Preparing to deploy to ${chalk.green.bold(env)}...\n`)
    saved = {}
  }

  if (!saved.entrypoint && packageJson.main && fs.existsSync(packageJson.main)) {
    saved.entrypoint = packageJson.main
  }

  let answers = saved
  let quickConfig = false

  const validNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/i
  if (!answers.name) {
    if (validNameRegex.test(packageJson.name)) {
      process.stdout.write(
        `${WARNING} Using project name ${chalk.green.bold(packageJson.name)}...\n`
      )
    } else {
      const newName = packageJson.name.replace(/[^a-z0-9]/gi, '')
      if (output === '-' || overwrite) {
        answers.name = newName
      } else {
        const { name } = await inquirer.prompt([
          {
            name: 'name',
            type: 'input',
            message: `The name "${packageJson.name}" is not valid as a project name - it must not contain dots or spaces. What should we name this project?`,
            default: newName,
            validate: function (input) {
              if (validNameRegex.test(input)) {
                return true
              } else {
                return 'Invalid name!'
              }
            }
          }
        ])
        answers.name = name
      }
    }
  }

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
          `${WARNING} Using Kubernetes context ${chalk.green.bold(kubeContexts[0])}...\n`
        )
        answers.context = kubeContexts[0]
      }

      if (quickConfig) {
        const kubesailContext = await getKubesailConfig()
        answers.context = kubesailContext
      }
    }
  }

  if (answers.context && typeof answers.context !== 'string') {
    fatal(
      `Unable to determine Kubernetes context! Please report this issue to https://github.com/kubesail/deploy-node-app/issues - Exiting! Debug info: ${JSON.stringify(
        {
          quickConfig,
          contexts: kubeContexts.length
        }
      )}`
    )
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

  if (!answers.type) {
    const { typeAnswer } = await inquirer.prompt([
      {
        name: 'typeAnswer',
        type: 'list',
        message: 'What sort of application is this?',
        default: 'combo',
        choices: [
          {
            name: 'Server (An app that listens for network requests)',
            value: 'server'
          },
          {
            name: 'Worker (A daemon that does not listen for network requests)',
            value: 'worker'
          },
          {
            name: 'Static App (A SPA, like the product of "create-react-app", with no backend)',
            value: 'spa'
          },
          {
            name: 'Combo (Contains a frontend and a backend)',
            value: 'combo'
          }
        ]
      }
    ])
    answers.type = typeAnswer
  }

  if (answers.type === 'server' || answers.type === 'combo') {
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
  }

  if (!answers.entrypoint && answers.type !== 'spa') {
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
