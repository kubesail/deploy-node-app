#!/usr/bin/env node
// @flow

const USAGE = '[env] [action]'

const fs = require('fs')
const path = require('path')
const program = require('commander')

const { fatal } = require('./util')
const deployNodeApp = require('./dna')
// eslint-disable-next-line
const dnaPackageJson = require(__dirname + '/../package.json')

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

const normalizedPath = path.join(__dirname, './languages')
let detectedLanguage
const languageFiles = fs.readdirSync(normalizedPath)
for (let i = 0; i < languageFiles.length; i++) {
  // eslint-disable-next-line security/detect-non-literal-require
  const language = require(path.join(__dirname, './languages', languageFiles[i]))
  if (language.detect()) {
    detectedLanguage = language
    break
  }
}

if (detectedLanguage) {
  deployNodeApp(env, action, detectedLanguage, {
    update: program.update || false,
    write: program.write,
    force: program.force || false,
    labels: (program.label || '').split(',').map(k => k.split('='))
  })
} else {
  fatal(
    'Unable to determine what sort of project this is... If it\'s a real project, please let us know at https://github.com/kubesail/deploy-node-app/issues and we\'ll add support!'
  )
}
