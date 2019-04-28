#!/usr/bin/env node
// @flow

const USAGE = '[env]'

const fs = require('fs')
const program = require('commander')

const { fatal } = require('./util')
const { DeployNodeApp } = require('./DeployNodeApp')
const dnaPackageJson = require('./package.json')

let packageJson
try {
  packageJson = JSON.parse(fs.readFileSync('package.json'))
} catch (err) {
  fatal('This doesn\'t appear to be a Node.js application. You may need to \'npm init\'.')
}
if (typeof packageJson.name !== 'string') {
  fatal('Please add a name to your package.json and re-run')
}

program
  .arguments('[env]')
  .usage(USAGE)
  .version(dnaPackageJson.version)
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
