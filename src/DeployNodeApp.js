// @flow

// eslint-disable-next-line security/detect-child-process
const inquirer = require('inquirer')
const fs = require('fs')
const path = require('path')
const commandExists = require('command-exists')
const yaml = require('js-yaml')
const style = require('ansi-styles')

const {
  getDeployTags,
  execSyncWithEnv,
  readLocalKubeConfig,
  readLocalDockerConfig,
  readKubeConfigNamespace,
  shouldUseYarn,
  fatal,
  WARNING
} = require('./util')

const {
  findMetaModules,
  buildAppDeployment,
  buildUiDeployment,
  buildAppService,
  buildUiService,
  buildUiDockerfile,
  buildDockerfile
} = require('./configBuilder')

const infrastructureDir = 'inf'
const { promptQuestions } = require('./questions')

async function deployNodeApp (packageJson /*: Object */, env /*: string */, opts) {
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

  // TODO: Check if image has already been built - optional?

  if (opts.build) {
    execSyncWithEnv(`docker build . -t ${tags.env} -t ${tags.hash}`, execOpts)
    execSyncWithEnv(`docker push ${tags.env}`, execOpts)
    execSyncWithEnv(`docker push ${tags.hash}`, execOpts)
  }

  // Ensure inf directory exists
  if (!fs.existsSync(infrastructureDir)) {
    try {
      fs.mkdirSync(infrastructureDir)
    } catch (err) {
      fatal('Error creating inf directory.')
    }
  }

  const appKustomizeConfig = { resources: [] }

  // Deploy main app
  const deployment = buildAppDeployment(packageJson, env, tags, answers)
  const name = deployment.metadata.name
  // TODO write these configs to a single kube config file
  const deploymentFile = path.join(infrastructureDir, `deployment-${env}.yaml`)
  appKustomizeConfig.resources.push(deploymentFile)
  const existingDeploymentFile = fs.existsSync(deploymentFile)
  if (existingDeploymentFile) {
    process.stdout.write(
      `${style.yellow.open}${deploymentFile} exists - not overwriting${style.reset.open}\n`
    )
  } else {
    fs.writeFileSync(deploymentFile, yaml.safeDump(deployment))
  }

  let svcMsg = ''
  let appHostname
  // Expose Service on KubeSail if desired
  if (answers.context.includes('kubesail')) {
    const namespace = readKubeConfigNamespace(answers.context)
    const service = buildAppService(packageJson, env, tags, answers, namespace)
    const serviceFile = path.join(infrastructureDir, `service-${env}.yaml`)
    appKustomizeConfig.resources.push(serviceFile)
    const existingServiceFile = fs.existsSync(serviceFile)
    if (existingServiceFile) {
      process.stdout.write(
        `${style.yellow.open}${serviceFile} exists - not overwriting${style.reset.open}\n`
      )
    } else {
      fs.writeFileSync(serviceFile, yaml.safeDump(service))
    }

    try {
      appHostname = JSON.parse(service.metadata.annotations['getambassador.io/config']).host
      svcMsg += `\nYour App is available at https://${appHostname}\n`
    } catch {}
  } else {
    svcMsg =
      '\nYou may need to expose your deployment on kubernetes via a service.\n' +
      'Learn more: https://kubernetes.io/docs/tutorials/kubernetes-basics/expose/expose-intro/.\n'
  }

  // TODO: warn if node_modules is not in .dockerignore or .gitignore
  // TODO: Prompt if its okay to write to package.json
  packageJson = JSON.parse(fs.readFileSync('package.json'))
  packageJson['deploy-node-app'] = {
    [env]: answers
  }
  fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2))

  const { uiName, resources, svcMsg: newSvcMsg } = handleUi({
    packageJson,
    appHostname,
    opts,
    tags,
    execOpts,
    answers,
    env,
    svcMsg
  })
  svcMsg = newSvcMsg
  appKustomizeConfig.resources = appKustomizeConfig.resources.concat(resources)

  // Write config file
  const format = ['kube', 'kubernetes', 'k8s'].includes(opts.format) ? 'kubernetes' : 'compose'
  const config = await findMetaModules(packageJson, format)
  if (opts.output === '-') {
    process.stdout.write(config)
  } else {
    let filename = opts.output
    if (!filename) {
      filename = format === 'compose' ? 'docker-compose.yaml' : 'kustomization.yaml'
    }
    fs.writeFileSync(filename, config)
  }

  // Write out App + UI config
  const appKustomizeYaml = yaml.safeDump(appKustomizeConfig)
  fs.writeFileSync(path.join(infrastructureDir, 'kustomization.yaml'), appKustomizeYaml)

  if (opts.deploy) {
    execSyncWithEnv(`kubectl --context=${answers.context} apply -f -k kustomization.yaml`, execOpts)

    execSyncWithEnv(
      `kubectl --context=${answers.context} set image deployment/${name} ${name}=${tags.hash}`,
      execOpts
    )

    if (deployUi) {
      execSyncWithEnv(
        `kubectl --context=${answers.context} set image deployment/${uiName} ${uiName}=${
          tags.uihash
        }`,
        execOpts
      )
    }
  }

  process.stdout.write(`\n\n✨  Your application has been deployed! ✨\n\n${svcMsg}`)

  process.exit(0)
}

function handleUi ({ packageJson, appHostname, opts, tags, execOpts, answers, env, svcMsg }) {
  const resources = []
  // Determine REACT_APP_API_HOST in following order:
  // 1) from param / app hostname that we deployed (done)
  // 2) from package.json in deploy-node-app answers (TODO)
  // 3) interactive prompt (TODO)

  // Build static files if needed
  if (packageJson.scripts && packageJson.scripts.build && opts.build) {
    const pkgMgr = shouldUseYarn() ? 'yarn' : 'npm run'
    const buildOpts = Object.assign({}, { env: { REACT_APP_API_HOST: appHostname } }, execOpts)
    execSyncWithEnv(`${pkgMgr} build`, buildOpts)

    buildUiDockerfile()
    execSyncWithEnv(`docker build -f Dockerfile.ui . -t ${tags.uienv} -t ${tags.uihash}`, execOpts)
    execSyncWithEnv(`docker push ${tags.uienv}`, execOpts)
    execSyncWithEnv(`docker push ${tags.uihash}`, execOpts)
  }

  // Deploy UI container
  const uiDeployment = buildUiDeployment(packageJson, env, tags, answers)
  const uiName = uiDeployment.metadata.name
  // TODO write these configs to a single kube config file
  const uiDeploymentFile = path.join(infrastructureDir, `deployment-ui-${env}.yaml`)
  resources.push(uiDeploymentFile)
  const existingUiDeploymentFile = fs.existsSync(uiDeploymentFile)
  if (!existingUiDeploymentFile) {
    fs.writeFileSync(uiDeploymentFile, yaml.safeDump(uiDeployment))
  } else {
    process.stdout.write(
      `${style.yellow.open}${uiDeploymentFile} exists - not overwriting${style.reset.open}\n`
    )
  }

  if (answers.context.includes('kubesail')) {
    const namespace = readKubeConfigNamespace(answers.context)
    const service = buildUiService(packageJson, env, tags, answers, namespace)
    const serviceFile = path.join(infrastructureDir, `service-ui-${env}.yaml`)
    resources.push(serviceFile)
    const existingServiceFile = fs.existsSync(serviceFile)
    if (existingServiceFile) {
      process.stdout.write(
        `${style.yellow.open}${serviceFile} exists - not overwriting${style.reset.open}\n`
      )
    } else {
      fs.writeFileSync(serviceFile, yaml.safeDump(service))
    }
    try {
      const hostname = JSON.parse(service.metadata.annotations['getambassador.io/config']).host
      svcMsg += `Your UI (static site) is available at https://${hostname}\n`
    } catch {}
  }

  return { uiName, resources, svcMsg }
}

module.exports = {
  deployNodeApp
}
