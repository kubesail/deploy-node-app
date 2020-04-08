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
  .option('-n, --no-write', 'Don\'t build and push docker container')
  .option('-u, --update', 'Update local files')
  .option('-f, --force', 'Dont prompt, just write the files!')
  .option('-l, --label [foo=bar,tier=service]', 'Add labels to be applied to all resources')
  .parse(process.argv)

const env = program.args[0] || 'production'
const action = program.args[1] || 'deploy'
const detectedLanguage = languages.find(async language => await language.detect())

if (detectedLanguage) {
  deployNodeApp(env, action, detectedLanguage, {
    update: program.update || false,
    write: program.write,
    force: program.force || false,
    labels: (program.label || '').split(',').map(k => k.split('=').filter(Boolean)).filter(Boolean)
  })
} else fatal('Unable to determine what sort of project this is. If it\'s a real project, please let us know at https://github.com/kubesail/deploy-node-app/issues and we\'ll add support!')
