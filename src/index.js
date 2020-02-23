#!/usr/bin/env node
// @flow

const USAGE = '[env] [action]'

const fs = require('fs')
const program = require('commander')

const { fatal } = require('./util')
const deployNodeApp = require('./dna')
// eslint-disable-next-line
const dnaPackageJson = require(__dirname + '/../package.json')

let packageJson
try {
  packageJson = JSON.parse(fs.readFileSync('package.json'))
} catch (err) {
  fatal('This doesn\'t appear to be a Node.js application. No package.json found')
}

program
  .arguments(USAGE)
  .usage(USAGE)
  .version(dnaPackageJson.version)
  .option('-n, --no-write', 'Don\'t build and push docker container')
  .option('-u, --update', 'Update local files')
  .option('-f, --force', 'Dont prompt, just write the files!')
  .parse(process.argv)

const env = program.args[0] || 'production'
const action = program.args[1] || 'deploy'

deployNodeApp(
  env,
  action,
  {
    update: program.update || false,
    write: program.write || false
  },
  packageJson
)
