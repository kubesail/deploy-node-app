// @flow

// $FlowIssue
const { expect } = require('chai')
const Mkdirp = require('mkdirp')
const util = require('util')
const fs = require('fs')
const path = require('path')
const { execSyncWithEnv } = require('../../src/util')

const describe = global.describe
const it = global.it
const mkdir = util.promisify(Mkdirp)
const testDir = 'tmp/integration'

if (!fs.existsSync('package.json')) {
  process.stderr.write('Tests must run from the root of the repository')
  process.exit(1)
}

describe('execSyncWithEnv', function () {
  it('cleans the tmp/integration dir', async function () {
    await execSyncWithEnv(`rm -rfv ./${testDir}`)
    await mkdir(testDir)
    expect(fs.existsSync(testDir)).to.be.a('boolean')
  })
})

const cratestDir = `${testDir}/cra-test`
describe('deploy create-node-app', function () {
  it('clones the repo', async function () {
    this.timeout(30000)
    await execSyncWithEnv(`npx create-react-app ${cratestDir}`)
    expect(fs.existsSync(cratestDir)).to.be.a('boolean')
  })
})
