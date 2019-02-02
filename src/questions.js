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
  packageJson /*: Object */
) {
  let saved = packageJson['deploy-to-kube'] && packageJson['deploy-to-kube'][env]

  if (!saved) {
    // Gives some context to what we are about to do and why we are asking questions:
    process.stdout.write(
      `\n${WARNING} Preparing to deploy to ${style.bold.open +
        style.green.open +
        env +
        style.reset.open}...\n\n`
    )
    saved = {}
  }
  saved.entrypoint = packageJson.main && fs.existsSync(packageJson.main) ? packageJson.main : null

  let answers = {}
  let quickConfig = false
  if (!saved.context) {
    if (kubeContexts.length === 1 && kubeContexts[0] === NEW_KUBESAIL_CONTEXT) {
      const kubesailAnswer = await inquirer.prompt([
        {
          name: 'quickConfig',
          type: 'confirm',
          message:
            'You don\'t appear to have a Kubernetes config.\n' +
            '  This tool can configure a free kubernetes namespace on \n' +
            '  Kubesail in order to help you deploy your application easily.\n' +
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
          message: 'Which Kubernetes context do you want to use?',
          default: kubeContexts[0],
          choices: kubeContexts
        }
      ])
      answers.context = context
      if (context === NEW_KUBESAIL_CONTEXT) {
        quickConfig = true
      }
    } else {
      answers.context = kubeContexts[0]
    }

    if (quickConfig) {
      const kubesailContext = await getKubesailConfig()
      answers.context = kubesailContext
    }
  }

  // TODO default docker installation has 0 container registries -- in this case prompt to use dockerhub? allow login?
  if (containerRegistries.length === 0) {
    containerRegistries.push('https://index.docker.io/v1/')
  }
  const onlyDockerHub =
    containerRegistries.length === 1 && containerRegistries[0].includes(DOCKER_HUB_DOMAIN)

  if (quickConfig) {
    answers.registry = 'https://index.docker.io/v1/' // TODO set up the kubesail registry and use that here instead
  } else {
    if (onlyDockerHub) {
      answers.registry = containerRegistries[0]
    } else if (!saved.registry && !onlyDockerHub) {
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

  const appAnswers = await inquirer.prompt(
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
          // TODO for default, provide a callback with an array of common entry points.
          // the 'inquirer-fuzzy-path' plugin currently does not respect default at all
          default: 'index.js',
          excludePath: filepath => {
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
          },
          itemType: 'file',
          rootPath: '.',
          suggestOnly: false
        }
    ].filter(q => q)
  )

  answers = Object.assign({}, saved, answers, appAnswers)
  answers.registry = answers.registry.replace(DOCKER_HUB_SUFFIX, '')
  answers.registry = answers.registry.replace(/https?:\/\//i, '')
  answers.registry = answers.registry.substr(-1) === '/' ? answers.registry : answers.registry + '/'
  return answers
}

module.exports = { promptQuestions }
