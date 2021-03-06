#!/usr/bin/env node

const USAGE = '[env] [action]'

const program = require('commander')
const deployNodeApp = require('./deployNodeApp')
const dnaPackageJson = require(__dirname + '/../package.json') // eslint-disable-line

let env
let action

program
  .name('deploy-node-app')
  .arguments(USAGE)
  .usage(USAGE)
  .version(dnaPackageJson.version)
  .action((_env, _action) => {
    env = _env
    action = _action
  })
  .option(
    '-w, --write',
    'Write files to project (writes out Dockerfile, skaffold.yaml, etc)',
    false
  )
  .option('-u, --update', 'Update existing files', false)
  .option('-f, --force', 'Dont prompt if possible', false)
  .option('-l, --label [foo=bar,tier=service]', 'Add labels to created Kubernetes resources')
  .option('-t, --target <path/to/project>', 'Target project directory', '.')
  .option('-c, --config <path/to/kubeconfig>', 'Kubernetes configuration file', '~/.kube/config')
  .option('-m, --modules <redis,postgres,mongodb>', 'Explicitly add modules')
  .option('--add', 'Add an additional build target')
  .option('--language <name>', 'Override language detection')
  .option('--project-name <name>', 'Answer the project name question')
  .option('--entrypoint <entrypoint>', 'Answer the entrypoint question')
  .option('--image <image>', 'Answer the image address question')
  .option('--ports <ports>', 'Answer the ports question')
  .option('--address <address>', 'Answer the ingress address question')
  .option(
    '--no-prompts',
    'Use default values whenever possible, implies --update and --force',
    false
  )
  .parse(process.argv)

deployNodeApp(env, action, {
  language: program.language || null,
  action: action || 'deploy',
  write: program.write || false,
  update: program.update || false,
  force: program.force || false,
  config: program.config === '~/.kube/config' ? null : program.config,
  modules: (program.modules || '').split(',').filter(Boolean),
  add: program.add || false,
  target: program.target || '.',
  labels: (program.label || '')
    .split(',')
    .map(k => k.split('=').filter(Boolean))
    .filter(Boolean),
  name: program.projectName,
  entrypoint: program.entrypoint || false,
  image: program.image || false,
  ports: program.ports
    ? program.ports
        .split(',')
        .map(p => parseInt(p, 10))
        .filter(Boolean)
    : null,
  address: program.address || false,
  prompts: program.prompts
})
