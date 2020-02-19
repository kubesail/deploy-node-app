#!/usr/bin/env node
// @flow

const USAGE = '[env]'

const fs = require('fs')
const program = require('commander')

const { fatal } = require('./util')
const { deployNodeApp } = require('./deployNodeApp')
// eslint-disable-next-line
const dnaPackageJson = require(__dirname + '/../package.json')

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
  .option(
    '--generate-default-env',
    'Generates default environment variables, like database passwords'
  )
  .option(
    '--generate-local-ports-env',
    'Generates environment variables for connecting to docker-compose services'
  )
  .option('-n, --no-build', 'Don\'t build and push docker container')
  .option('-N, --no-confirm', 'Skip public docker hub confirmation prompt')
  .option('-d, --no-push', 'Don\'t push to docker registry')
  .option('-D, --no-deploy', 'Don\'t deploy to kubernetes')
  .option('-O, --overwrite', 'Overwrite local files')
  .option('-s, --skip metamodule', 'name of metamodule to skip')
  .option('-i, --images', 'Images only - build and push, but only change local image tags, no other local changes')
  .option('-f, --format [type]', 'Output config format [k8s|compose]', 'k8s')
  .option(
    '-o, --output [filename]',
    'File for config output. "-" will write to stdout. Default is docker-compose.yaml or deployment.yaml depending on format'
  )
  .parse(process.argv)

// Default to production environment
// TODO: Pass auto argument (and others) to DeployNodeApp
deployNodeApp(packageJson, program.args[0] || 'prod', program)
