const style = require('ansi-styles')
const getKubesailConfig = require('get-kubesail-config')
const { NEW_KUBESAIL_CONTEXT, WARNING } = require('./util')
const inquirer = require('inquirer')
inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'))

function isInvalidPath (filepath) {
  const invalidPaths = [
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

  for (let i = 0; i < invalidPaths.length; i++) {
    if (filepath.startsWith(invalidPaths[i])) return true
  }

  return false
}

async function promptQuestions (
  env /*: string */,
  containerRegistries /*: Array<string> */,
  kubeContexts /*: Array<string> */,
  packageJson /*: Object */
) {
  let saved = packageJson['deploy-node-app'] && packageJson['deploy-node-app'][env]

  if (!saved) {
    // Gives some context to what we are about to do and why we are asking questions:
    process.stdout.write(
      `\n${WARNING} Preparing to deploy ${style.bold.open +
        style.green.open +
        env +
        style.reset.open}...\n\n`
    )
    saved = {}
  }

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
          default: 'index.js', // TODO provide an array of common entry points
          pathFilter: (isDirectory, path) => {
            return !isDirectory && !isInvalidPath(path)
          },
          scanFilter: (_isDirectory, path) => {
            return !isInvalidPath(path)
          },
          rootPath: '.',
          suggestOnly: false
        }
    ].filter(q => q)
  )

  let quickConfig = false
  if (!saved.context) {
    if (kubeContexts.length === 1 && kubeContexts[0] === NEW_KUBESAIL_CONTEXT) {
      const kubesailAnswer = await inquirer.prompt([
        {
          name: 'quickConfig',
          type: 'confirm',
          message:
            'You don\'t appear to have a Kubernetes config.\n' +
            'This tool can configure a free kubernetes namespace on \n' +
            'Kubesail in order to help you deploy your application easily.\n' +
            'You will be redirected to the Kubesail website.\n' +
            '\n' +
            'Would you like to continue?'
        }
      ])

      quickConfig = kubesailAnswer.quickConfig
    } else {
      const { context } = await inquirer.prompt([
        {
          name: 'context',
          type: 'list',
          message: 'Which Kubernetes context do you want to use?',
          default: kubeContexts[0],
          choices: kubeContexts
        }
      ])
      answers.context = context
    }

    // TODO doesn't work if user needs to login
    if (quickConfig || answers.context === NEW_KUBESAIL_CONTEXT) {
      const kubesailContext = await getKubesailConfig()
      answers.context = kubesailContext
    }
  }

  const onlyDockerHub =
    containerRegistries.length === 1 && containerRegistries[0].includes('index.docker.io')

  if (quickConfig) {
    answers.registry = 'registry.kubesail.io' // TODO set this up
  } else {
    if (onlyDockerHub) {
      answers.registry = containerRegistries[0]
    } else if (!saved.registry && !onlyDockerHub) {
      const registryAnswer = inquirer.prompt([
        {
          name: 'registry',
          type: 'list',
          message: 'Which docker registry do you want to use?',
          choices: containerRegistries,
          validate: registry =>
            !registry.match(/^([a-z0-9]+\.)+[a-z0-9]$/i)
              ? 'You must provide a valid hostname for a docker registry'
              : true
        }
      ])
      answers.registry = registryAnswer.registry
    }
  }

  answers = Object.assign({}, answers, saved)
  answers.registry = answers.registry.replace(/https?:\/\//i, '')
  answers.registry = answers.registry.substr(-1) === '/' ? answers.registry : answers.registry + '/'
  return answers
}

module.exports = { promptQuestions }
