#!/usr/bin/env node

const USAGE = '[action] [env]'

const program = require('commander')
const { fatal } = require('./util')
const deployNodeApp = require('./deployNodeApp')
const dnaPackageJson = require(__dirname + '/../package.json') // eslint-disable-line

const languages = [
  require('./languages/nginx'),
  require('./languages/nodejs'),
  require('./languages/php'),
  require('./languages/python')
]

let env
let action

program
  .name('deploy-node-app')
  .arguments(USAGE)
  .usage(USAGE)
  .version(dnaPackageJson.version)
  .action((_action, _env) => {
    env = _env
    action = _action
  })
  .option('-w, --write', 'Write files to project (writes out Dockerfile, skaffold.yaml, etc)', false)
  .option('-u, --update', 'Update existing files', false)
  .option('-f, --force', 'Dont prompt if possible (implies --write and --update)', false)
  .option('-l, --label [foo=bar,tier=service]', 'Add labels to created Kubernetes resources')
  .option('-d, --directory <path/to/project>', 'Target project directory', '.')
  .option('-c, --config <path/to/kubeconfig>', 'Kubernetes configuration file', '~/.kube/config')
  .option('-m, --modules <redis,postgres,mongodb>', 'Explicitly add modules')
  .option('--language <name>', 'Override language detection')
  .option('--project-name <name>', 'Answer the project name question')
  .option('--entrypoint <entrypoint>', 'Answer the entrypoint question')
  .option('--image <image>', 'Answer the image address question')
  .option('--ports <ports>', 'Answer the ports question')
  .option('--address <address>', 'Answer the ingress address question')
  .option('--context <context>', 'Answer the kube-context question')
  .option('--no-prompts', 'Use default values whenever possible')
  .parse(process.argv)

async function DeployNodeApp () {
  for (let i = 0; i < languages.length; i++) {
    const language = languages[i]

    if (program.language && program.language !== language.name) continue
    else if (!program.language) {
      const detect = await language.detect()
      if (!detect) continue
    }

    deployNodeApp(env || 'production', action || 'deploy', language, {
      action: action || 'deploy',
      write: program.write || false,
      update: program.update || false,
      force: program.force || false,
      config: program.config === '~/.kube/config' ? null : program.config,
      modules: (program.modules || '').split(',').filter(Boolean),
      directory: program.directory || process.cwd(),
      labels: (program.label || '').split(',').map(k => k.split('=').filter(Boolean)).filter(Boolean),
      name: program.projectName || false,
      entrypoint: program.entrypoint || false,
      image: program.image || false,
      ports: program.ports ? program.ports.split(',').map(p => parseInt(p, 10)).filter(Boolean) : false,
      address: program.address || false,
      context: program.context || false,
      prompts: program.prompts || true
    })
    return
  }

  fatal('Unable to determine what sort of project this is. If it\'s a real project, please let us know at https://github.com/kubesail/deploy-node-app/issues and we\'ll add support!')
}

DeployNodeApp()
