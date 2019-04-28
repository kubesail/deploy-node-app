// @flow

// eslint-disable-next-line security/detect-child-process
const inquirer = require('inquirer')
const fs = require('fs')
const commandExists = require('command-exists')
const yaml = require('js-yaml')
const style = require('ansi-styles')

const {
  execSyncWithEnv,
  readLocalKubeConfig,
  readLocalDockerConfig,
  buildUiDockerfile,
  buildDockerfile,
  readKubeConfigNamespace,
  shouldUseYarn,
  fatal,
  WARNING
} = require('./util')

const {
  buildDependencyConfig,
  buildAppDeployment,
  buildUiDeployment,
  buildAppService,
  buildUiService
} = require('./config-builder')

const { promptQuestions } = require('./questions')

async function getDeployTags (name, env, answers, shouldBuild) {
  const tags = {}
  const shortHash = execSyncWithEnv('git rev-parse HEAD')
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

  tags.env = `${prefix}${name}:${env}`
  tags.hash = `${prefix}${name}:${shortHash}`
  tags.uienv = `${prefix}${name}-ui:${env}`
  tags.uihash = `${prefix}${name}-ui:${shortHash}`
  return tags
}

async function DeployNodeApp (packageJson /*: Object */, env /*: string */, opts) {
  if (!commandExists.sync('docker')) {
    fatal('Error - Please install docker! https://www.docker.com/get-started')
  }

  if (!commandExists.sync('kubectl')) {
    fatal('Error - Please install kubectl! https://kubernetes.io/docs/tasks/tools/install-kubectl/')
  }

  const execOpts = {
    stdio: [process.stdin, opts.output !== '-' ? process.stdout : null, process.stderr]
  }

  const deployUi = fs.existsSync('public/index.html') || fs.existsSync('build/index.html')

  const kubeContexts = readLocalKubeConfig()

  const containerRegistries = readLocalDockerConfig()

  let answers = await promptQuestions(env, containerRegistries, kubeContexts, packageJson)

  if (deployUi) {
    buildUiDockerfile()
  }
  buildDockerfile(answers.entrypoint)

  const tags = await getDeployTags(packageJson.name, env, answers, opts.build)

  if (opts.output !== '-') {
    process.stdout.write(
      `\n${WARNING} About to deploy ${style.green.open}${style.bold.open}${tags.env}${
        style.reset.open
      } on ${style.bold.open}${answers.context}${style.reset.open}`
    )
    if (deployUi) {
      process.stdout.write(
        `\n${WARNING} About to deploy ${style.green.open}${style.bold.open}${tags.uienv}${
          style.reset.open
        } on ${style.bold.open}${answers.context}${style.reset.open}`
      )
    }
    process.stdout.write('\n\n')

    // TODO warn for each dependency container that will be launched
  }

  if (!answers.confirmed) {
    if (answers.registry.includes('index.docker.io')) {
      process.stdout.write(
        `${WARNING} You are using Docker Hub. If the docker repository does not exist,\n` +
          `   it may be automatically created with ${style.yellow.open}PUBLIC${
            style.reset.open
          } access!\n` +
          '   Make sure you have all secrets in your ".dockerignore" file,\n' +
          '   and you may want to make sure your image repository is setup securely!\n\n'
      )
    }
  }

  if (opts.confirm && opts.output !== '-') {
    const { confirmed } = await inquirer.prompt([
      {
        name: 'confirmed',
        type: 'confirm',
        message: 'Are you sure you want to continue?'
      }
    ])
    if (!confirmed) {
      process.exit(1)
    }
    answers.confirmed = confirmed
  }

  // TODO determine API hostname in following order:
  // 2) attempt to read / apply kube service and pull from response
  // 1) from package.json in deploy-node-app answers
  // 3) interactive prompt
  // Then set REACT_APP_API_HOST env var before building static files

  // Build static files if needed
  if (packageJson.scripts && packageJson.scripts.build && opts.build) {
    const pkgMgr = shouldUseYarn() ? 'yarn' : 'npm run'
    execSyncWithEnv(`${pkgMgr} build`, execOpts)
  }

  // TODO: Check if image has already been built - optional?

  if (opts.build) {
    execSyncWithEnv(`docker build . -t ${tags.env} -t ${tags.hash}`, execOpts)
    execSyncWithEnv(`docker push ${tags.env}`, execOpts)
    execSyncWithEnv(`docker push ${tags.hash}`, execOpts)
    if (deployUi) {
      execSyncWithEnv(
        `docker build -f Dockerfile.ui . -t ${tags.uienv} -t ${tags.uihash}`,
        execOpts
      )
      execSyncWithEnv(`docker push ${tags.uienv}`, execOpts)
      execSyncWithEnv(`docker push ${tags.uihash}`, execOpts)
    }
  }

  // Deploy main app
  const deployment = buildAppDeployment(packageJson, env, tags, answers)
  const name = deployment.metadata.name
  // TODO write these configs to a single kube config file
  const deploymentFile = `deployment-${env}.yaml`
  const existingDeploymentFile = fs.existsSync(deploymentFile)
  if (!existingDeploymentFile) {
    fs.writeFileSync(deploymentFile, yaml.safeDump(deployment))
  }
  let existingDeployment
  try {
    existingDeployment = execSyncWithEnv(
      `kubectl --context=${answers.context} get deployment ${name}`,
      {
        stdio: []
      }
    ).toString()
  } catch {}
  if (!existingDeployment) {
    execSyncWithEnv(`kubectl --context=${answers.context} apply -f ${deploymentFile}`, execOpts)
  }
  execSyncWithEnv(
    `kubectl --context=${answers.context} set image deployment/${name} ${name}=${tags.hash}`,
    execOpts
  )

  // Optionally deploy static files / UI container
  if (deployUi) {
    const uiDeployment = buildUiDeployment(packageJson, env, tags, answers)
    const uiName = uiDeployment.metadata.name
    // TODO write these configs to a single kube config file
    const uiDeploymentFile = `deployment-ui-${env}.yaml`
    const existingUiDeploymentFile = fs.existsSync(uiDeploymentFile)
    if (!existingUiDeploymentFile) {
      fs.writeFileSync(uiDeploymentFile, yaml.safeDump(uiDeployment))
    }

    let existingUiDeployment
    try {
      existingUiDeployment = execSyncWithEnv(
        `kubectl --context=${answers.context} get deployment ${uiName}`,
        { stdio: [] }
      ).toString()
    } catch (err) {}

    if (!existingUiDeployment) {
      execSyncWithEnv(`kubectl --context=${answers.context} apply -f ${uiDeploymentFile}`, execOpts)
    }

    execSyncWithEnv(
      `kubectl --context=${answers.context} set image deployment/${uiName} ${uiName}=${
        tags.uihash
      }`,
      execOpts
    )
  }

  let serviceWarning = ''
  // Expose Service on KubeSail if desired
  if (answers.context.includes('kubesail')) {
    const namespace = readKubeConfigNamespace(answers.context)
    if (deployUi) {
      const service = buildUiService(packageJson, env, tags, answers, namespace)
      const serviceFile = `service-ui-${env}.yaml`
      const existingServiceFile = fs.existsSync(serviceFile)
      if (existingServiceFile) {
        process.stdout.write(
          `\n${style.yellow.open}${serviceFile} exists - not overwriting${style.reset.open}\n`
        )
      } else {
        fs.writeFileSync(serviceFile, yaml.safeDump(service))
      }
      execSyncWithEnv(`kubectl --context=${answers.context} apply -f ${serviceFile}`, execOpts)
      try {
        const hostname = JSON.parse(service.metadata.annotations['getambassador.io/config']).host
        serviceWarning += `Your UI is available at https://${hostname}\n`
      } catch {}
    }

    const exposeExternally = !deployUi
    const service = buildAppService(packageJson, env, tags, answers, namespace, exposeExternally)
    const serviceFile = `service-${env}.yaml`
    const existingServiceFile = fs.existsSync(serviceFile)
    if (existingServiceFile) {
      process.stdout.write(
        `\n${style.yellow.open}${serviceFile} exists - not overwriting${style.reset.open}\n`
      )
    } else {
      fs.writeFileSync(serviceFile, yaml.safeDump(service))
    }
    execSyncWithEnv(`kubectl --context=${answers.context} apply -f ${serviceFile}`, execOpts)
    try {
      const hostname = JSON.parse(service.metadata.annotations['getambassador.io/config']).host
      serviceWarning += `Your app is available at https://${hostname}\n`
    } catch {}
  } else {
    serviceWarning =
      '\nYou may need to expose your deployment on kubernetes via a service.\n' +
      'Learn more: https://kubernetes.io/docs/tutorials/kubernetes-basics/expose/expose-intro/.\n'
  }

  process.stdout.write(
    `\n\n\n✨  Your application has been deployed! ✨\n\n\n${serviceWarning}\n\n\n`
  )

  // TODO: warn if node_modules is not in .dockerignore or .gitignore
  // TODO: Prompt if its okay to write to package.json
  packageJson = JSON.parse(fs.readFileSync('package.json'))
  packageJson['deploy-node-app'] = {
    [env]: answers
  }
  fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2))

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

module.exports = {
  DeployNodeApp
}
