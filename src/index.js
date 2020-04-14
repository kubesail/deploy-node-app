#!/usr/bin/env node

const USAGE = '[env] [action]'

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

program
  .arguments(USAGE)
  .usage(USAGE)
  .version(dnaPackageJson.version)
  .option('-w, --write', 'Keep files around after usage (writes out Dockerfile, skaffold.yaml, etc)')
  .option('-u, --update', 'Update local files (by default we don\'t change existing files)')
  .option('-f, --force', 'Dont prompt if possible (implies --write and --update)')
  .option('-l, --label [foo=bar,tier=service]', 'Add labels to created Kubernetes resources')
  .parse(process.argv)

const env = program.args[0] || 'production'
const action = program.args[1] || 'deploy'

async function DeployNodeApp () {
  for (let i = 0; i < languages.length; i++) {
    const language = languages[i]
    const detect = await language.detect()
    if (!detect) continue
    deployNodeApp(env, action, language, {
      action,
      write: program.write || false,
      update: program.update || false,
      force: program.force || false,
      labels: (program.label || '').split(',').map(k => k.split('=').filter(Boolean)).filter(Boolean)
    })
    return
  }

  fatal('Unable to determine what sort of project this is. If it\'s a real project, please let us know at https://github.com/kubesail/deploy-node-app/issues and we\'ll add support!')
}

DeployNodeApp()
