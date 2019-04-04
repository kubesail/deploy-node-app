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
  fatal,
  WARNING
} = require('./util')
const { promptQuestions } = require('./questions')
const { buildComposeConfig, buildKubeConfig } = require('./config-builder')

const execToStdout = { stdio: [process.stdin, process.stdout, process.stderr] }

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

buildComposeConfig(packageJson)
buildKubeConfig(packageJson)
// process.exit(0) // TODO just for testing...

// async function getDeployTags (env, answers) {
//   const tags = {}
//   const shortHash = execSync('git rev-parse HEAD')
//     .toString()
//     .substr(0, 7)
//   let prefix = answers.registry
//   if (!answers.registryUsername && answers.registry.includes('docker.io')) {
//     const { username } = await inquirer.prompt({
//       name: 'username',
//       type: 'input',
//       message: 'What is your docker hub username?',
//       validate: function (username) {
//         if (username.length < 4) return 'Invalid username'
//         return true
//       }
//     })
//     answers.registryUsername = username
//   }
//   if (answers.registry.includes('docker.io') && answers.registryUsername) {
//     prefix = `${answers.registryUsername}/`
//   }

//   tags.env = `${prefix}${packageJson.name}:${env}`
//   tags.hash = `${prefix}${packageJson.name}:${shortHash}`
//   tags.uienv = `${prefix}${packageJson.name}-ui:${env}`
//   tags.uihash = `${prefix}${packageJson.name}-ui:${shortHash}`
//   return tags
// }

// async function DeployNodeApp (env /*: string */, opts) {
//   if (!commandExists.sync('docker')) {
//     fatal('Error - You might need to install or start docker! https://www.docker.com/get-started')
//   }

//   if (!commandExists.sync('kubectl')) {
//     fatal(
//       'Error - You might need to install kubectl! https://kubernetes.io/docs/tasks/tools/install-kubectl/'
//     )
//   }

//   const kubeContexts = readLocalKubeConfig()
//   const containerRegistries = readLocalDockerConfig()

//   let answers = await promptQuestions(env, containerRegistries, kubeContexts, packageJson)

//   // TODO use a few heuristics to determine whether to build a UI container.
//   // I.E. is there a /build/index.html or /src/www/public.html, is 'react' present in the dependency list, etc...
//   const buildUi = true
//   if (buildUi) {
//     buildUiDockerfile()
//   }

//   buildDockerfile(answers.entrypoint)

//   const tags = await getDeployTags(env, answers)

//   process.stdout.write(
//     `\n${WARNING} About to deploy ${style.green.open}${style.bold.open}${tags.env}${
//       style.reset.open
//     } on ${style.bold.open}${answers.context}${style.reset.open}\n\n`
//   )

//   if (!answers.confirm) {
//     if (answers.registry.includes('index.docker.io')) {
//       process.stdout.write(
//         `${WARNING} You are using Docker Hub. If the docker repository does not exist,\n` +
//           `   it may be automatically created with ${style.red.open}PUBLIC${
//             style.red.close
//           } access!\n` +
//           '   Make sure you have all secrets in your ".dockerignore" file,\n' +
//           '   and you may want to make sure your image repository is setup securely!\n\n'
//       )
//     }
//   }

//   if (opts.confirm) {
//     const { confirm } = await inquirer.prompt([
//       {
//         name: 'confirm',
//         type: 'confirm',
//         message: 'Are you sure you want to continue?'
//       }
//     ])
//     if (!confirm) {
//       process.exit(1)
//     }
//     answers.confirm = confirm
//   }

//   // TODO: Check if image has already been built - optional?

//   if (opts.build) {
//     if (buildUi) {
//       execSync(`docker build Dockerfile.ui -t ${tags.uienv} -t ${tags.uihash}`, execToStdout)
//     }
//     execSync(`docker build . -t ${tags.env} -t ${tags.hash}`, execToStdout)
//     execSync(`docker push ${tags.env}`, execToStdout)
//     execSync(`docker push ${tags.hash}`, execToStdout)
//   }

//   const packageName = packageJson.name.toLowerCase()
//   const name = packageName + '-' + env
//   const deployment = {
//     apiVersion: 'apps/v1',
//     kind: 'Deployment',
//     metadata: {
//       name
//     },
//     spec: {
//       selector: {
//         matchLabels: {
//           app: packageName,
//           env: env
//         }
//       },
//       minReadySeconds: 5,
//       strategy: {
//         type: 'RollingUpdate',
//         rollingUpdate: {
//           maxSurge: 1,
//           maxUnavailable: 0
//         }
//       },
//       replicas: 1,
//       template: {
//         metadata: {
//           labels: {
//             deployedBy: 'deploy-to-kube',
//             app: packageName,
//             env: env
//           }
//         },
//         spec: {
//           volumes: [],
//           // TODO:
//           // imagePullSecrets: [
//           //   {
//           //     name: 'regsecret'
//           //   }
//           // ],
//           containers: [
//             {
//               name,
//               image: tags.env,
//               imagePullPolicy: 'Always',
//               ports: [
//                 {
//                   name: answers.protocol,
//                   containerPort: parseInt(answers.port, 10)
//                 }
//               ],
//               // envFrom: [
//               //   {
//               //     secretRef: {
//               //       name: env
//               //     }
//               //   }
//               // ],
//               resources: {
//                 requests: {
//                   cpu: '1m',
//                   memory: '32Mi'
//                 },
//                 limits: {
//                   cpu: '100m',
//                   memory: '64Mi'
//                 }
//               }
//             }
//           ]
//         }
//       }
//     }
//   }

//   const deploymentFile = `deployment-${env}.yaml`
//   const existingDeploymentFile = fs.existsSync(deploymentFile)
//   if (!existingDeploymentFile) {
//     fs.writeFileSync(deploymentFile, yaml.safeDump(deployment))
//   }

//   let existingDeployment
//   try {
//     existingDeployment = execSync(`kubectl --context=${answers.context} get deployment ${name}`, {
//       stdio: []
//     }).toString()
//   } catch (err) {}

//   if (!existingDeployment) {
//     execSync(`kubectl --context=${answers.context} apply -f ${deploymentFile}`, execToStdout)
//   }

//   execSync(
//     `kubectl --context=${answers.context} set image deployment/${name} ${name}=${tags.hash}`,
//     execToStdout
//   )

//   let serviceWarning = ''
//   if (!answers.context.includes('kubesail')) {
//     serviceWarning =
//       '\nYou may need to expose your deployment on kubernetes via a service.\n' +
//       'Learn more: https://kubernetes.io/docs/tutorials/kubernetes-basics/expose/expose-intro/.\n'
//   }
//   process.stdout.write('\n\n✨  Your application has been deployed! ✨\n\n\n' + serviceWarning)

//   // TODO: warn if node_modules is not in .dockerignore or .gitignore

//   // TODO: Prompt if its okay to write to package.json
//   packageJson = JSON.parse(fs.readFileSync(packageJsonPath))
//   packageJson['deploy-to-kube'] = {
//     [env]: answers
//   }
//   fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
//   process.exit(0)
// }

// program
//   .arguments('[env]')
//   .usage(USAGE)
//   .version(DNA_VERSION)
//   .option('-n, --no-build', 'Don\'t build and push docker container')
//   .option('--no-confirm', 'Do not prompt for confirmation')
//   .parse(process.argv)

// // Default to production environment
// // TODO: Pass auto argument (and others) to DeployNodeApp
// DeployNodeApp(program.args[0] || 'prod', program)
