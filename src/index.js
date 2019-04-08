#!/usr/bin/env node
// @flow

const DNA_VERSION = '0.0.1'
const USAGE = '[env]'

// eslint-disable-next-line security/detect-child-process
const execSync = require('child_process').execSync
const inquirer = require('inquirer')
const fs = require('fs')
const program = require('commander')
const commandExists = require('command-exists')
const yaml = require('js-yaml')
const style = require('ansi-styles')

const {
  readLocalKubeConfig,
  readLocalDockerConfig,
  buildUiDockerfile,
  buildDockerfile,
  shouldUseYarn,
  fatal,
  WARNING
} = require('./util')
const { promptQuestions } = require('./questions')
const { buildDependencyConfig, buildAppDeployment } = require('./config-builder')

const packageJsonPath = 'package.json'

let packageJson
try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath))
} catch (err) {
  fatal('This doesn\'t appear to be a Node.js application. You may need to \'npm init\'.')
}
if (typeof packageJson.name !== 'string') {
  fatal('Please add a name to your package.json and re-run')
}

async function getDeployTags (env, answers, shouldBuild) {
  const tags = {}
  const shortHash = execSync('git rev-parse HEAD')
    .toString()
    .substr(0, 7)
  let prefix = answers.registry
  if (!answers.registryUsername && answers.registry.includes('docker.io') && shouldBuild) {
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
  tags.uienv = `${prefix}${packageJson.name}-ui:${env}`
  tags.uihash = `${prefix}${packageJson.name}-ui:${shortHash}`
  return tags
}

async function DeployNodeApp (env /*: string */, opts) {
  if (!commandExists.sync('docker')) {
    fatal('Error - You might need to install or start docker! https://www.docker.com/get-started')
  }

  if (!commandExists.sync('kubectl')) {
    fatal(
      'Error - You might need to install kubectl! https://kubernetes.io/docs/tasks/tools/install-kubectl/'
    )
  }

  const execOpts = {
    stdio: [process.stdin, opts.output !== '-' ? process.stdout : null, process.stderr]
  }

  const buildUi = fs.existsSync('/build/index.html')

  const kubeContexts = readLocalKubeConfig()
  const containerRegistries = readLocalDockerConfig()

  let answers = await promptQuestions(env, containerRegistries, kubeContexts, packageJson)

  if (buildUi) {
    buildUiDockerfile()
  }
  buildDockerfile(answers.entrypoint)

  const tags = await getDeployTags(env, answers, opts.build)

  if (opts.output !== '-') {
    process.stdout.write(
      `\n${WARNING} About to deploy ${style.green.open}${style.bold.open}${tags.env}${
        style.reset.open
      } on ${style.bold.open}${answers.context}${style.reset.open}\n\n`
    )
  }

  if (!answers.confirm) {
    if (answers.registry.includes('index.docker.io')) {
      process.stdout.write(
        `${WARNING} You are using Docker Hub. If the docker repository does not exist,\n` +
          `   it may be automatically created with ${style.red.open}PUBLIC${
            style.red.close
          } access!\n` +
          '   Make sure you have all secrets in your ".dockerignore" file,\n' +
          '   and you may want to make sure your image repository is setup securely!\n\n'
      )
    }
  }

  if (opts.confirm && opts.output !== '-') {
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
    answers.confirm = confirm
  }

  // Build static files if needed
  if (packageJson.scripts && packageJson.scripts.build && opts.build) {
    const pkgMgr = shouldUseYarn() ? 'yarn' : 'npm run'
    execSync(`${pkgMgr} build`, execOpts)
  }

  // TODO: Check if image has already been built - optional?

  if (opts.build) {
    if (buildUi) {
      execSync(`docker build -f Dockerfile.ui . -t ${tags.uienv} -t ${tags.uihash}`, execOpts)
    }
    execSync(`docker build . -t ${tags.env} -t ${tags.hash}`, execOpts)
    execSync(`docker push ${tags.env}`, execOpts)
    execSync(`docker push ${tags.hash}`, execOpts)
  }

  const deployment = buildAppDeployment(packageJson, env, tags, answers)
  const name = deployment.metadata.name

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
    execSync(`kubectl --context=${answers.context} apply -f ${deploymentFile}`, execOpts)
  }

  execSync(
    `kubectl --context=${answers.context} set image deployment/${name} ${name}=${tags.hash}`,
    execOpts
  )

  let serviceWarning = ''
  if (!answers.context.includes('kubesail')) {
    serviceWarning =
      '\nYou may need to expose your deployment on kubernetes via a service.\n' +
      'Learn more: https://kubernetes.io/docs/tutorials/kubernetes-basics/expose/expose-intro/.\n'
  }
  process.stdout.write('\n\n✨  Your application has been deployed! ✨\n\n\n' + serviceWarning)

  // TODO: warn if node_modules is not in .dockerignore or .gitignore

  // TODO: Prompt if its okay to write to package.json
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath))
  packageJson['deploy-node-app'] = {
    [env]: answers
  }
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))

  // Write config file
  const format = ['kube', 'kubernetes', 'k8s'].includes(opts.format) ? 'k8s' : 'compose'
  const config = await buildDependencyConfig(packageJson, format)
  if (opts.output === '-') {
    process.stdout.write(config)
  } else {
    let filename = opts.output
    if (!filename) {
      filename = format === 'compose' ? 'docker-compose.yaml' : 'deployment.yaml'
    }
    fs.writeFileSync(filename, config)
  }

  process.exit(0)
}

program
  .arguments('[env]')
  .usage(USAGE)
  .version(DNA_VERSION)
  .option('-n, --no-build', 'Don\'t build and push docker container')
  .option('-d, --no-deploy', 'Don\'t deploy to kubernetes')
  .option('--no-confirm', 'Do not prompt for confirmation')
  .option('-f, --format [type]', 'Output config format [k8s|compose]')
  .option(
    '-o, --output [filename]',
    'File for config output. "-" will write to stdout. Default is docker-compose.yaml or deployment.yaml depending on format'
  )
  .parse(process.argv)

// Default to production environment
// TODO: Pass auto argument (and others) to DeployNodeApp
DeployNodeApp(program.args[0] || 'prod', program)
