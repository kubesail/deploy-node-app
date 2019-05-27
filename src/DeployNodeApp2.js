// @flow

const fs = require('fs')
const util = require('util')
const path = require('path')

const inquirer = require('inquirer')
const yaml = require('js-yaml')
const style = require('ansi-styles')

const {
  getDeployTags,
  execSyncWithEnv,
  readLocalKubeConfig,
  readLocalDockerConfig,
  readKubeConfigNamespace,
  shouldUseYarn,
  fatal,
  WARNING,
  ensureBinaries
} = require('./util')

const cwd = process.cwd()
const readFile = util.promisify(fs.readFile)
const statFile = util.promisify(fs.stat)
const writeFile = util.promisify(fs.writeFile)
const copyFile = util.promisify(fs.copyFile)

/**
 * Discovers "meta-module" packages within the package.json dep tree
 * Returns an array of package.json blobs from deps marked with a special key
 */
async function findMetaModules (packageJson /*: Object */) /*: Array<Object> */ {
  const depNames = Object.keys(packageJson.dependencies)
  const readFiles = depNames.map(async dep => {
    try {
      return await readFile(`node_modules/${dep}/package.json`).then(json => JSON.parse(json))
    } catch (err) {
      return Promise.resolve(null)
    }
  })
  const files = await Promise.all(readFiles)
  // filter out deps without a package.json and without any specified deployments
  return files.filter(file => file !== null).filter(file => !!file['deploy-node-app'])
}

/**
 * Concatenates all environment variables from all metamodules
 * Returns a flat object of KEYS and VALUES where KEYS are environment variables and VALUES are their data
 */
async function generateLocalEnv (metaModules /*: Array<Object> */) /*: Array<Object> */ {
  const envVars = {}
  for (let i = 0; i < metaModules.length; i++) {
    const mm = metaModules[i]
    if (await statFile(`node_modules/${mm.name}/lib/config.js`)) {
      // eslint-disable-next-line security/detect-non-literal-require
      const vars = require(`${process.cwd()}/node_modules/${mm.name}/lib/config`)
      for (const env in vars) {
        envVars[env] = vars[env]
      }
    }
    if (mm['deploy-node-app'].ports) {
      for (const env in mm['deploy-node-app'].ports) {
        envVars[env] = mm['deploy-node-app'].ports[env]
      }
    }
  }
  return envVars
}

/**
 * Top level wrapper for Deploy Node App
 */
async function deployNodeApp (packageJson /*: Object */, env /*: string */, opts /*: Object */) {
  const metaModules = await findMetaModules(packageJson)
  const output = opts.output
  const silence = output === '-'
  const prompts = opts.confirm
  const overwrite = opts.overwrite

  function log () {
    if (silence) return
    // eslint-disable-next-line no-console
    console.log(...arguments)
  }

  function fatal () {
    // eslint-disable-next-line no-console
    console.error(...arguments)
    process.exit(1)
  }

  async function confirmWriteFile (
    { path, content, copySource } /*: { path: string, content: string, copySource: string } */
  ) {
    const fullPath = `${cwd}/${path}`
    let doWrite = false
    if (overwrite) doWrite = true
    else {
      let exists = false
      try {
        exists = await statFile(fullPath)
      } catch (err) {}
      if (exists && prompts) {
        const confirmOverwrite = await inquirer.prompt({
          name: 'overwrite',
          type: 'confirm',
          message: `Would you like to overwrite "${path}"?`
        })
        if (confirmOverwrite) doWrite = true
      } else if (exists && !prompts) {
        log(
          `Refusing to overwrite "${path}"... Continuing... (Use --overwrite to ignore this check)`
        )
      } else if (!exists) {
        doWrite = true
      }
    }
    if (!doWrite) {
      return false
    } else if (content || copySource) {
      try {
        if (content) writeFile(fullPath, content)
        else if (copySource) copyFile(`${__dirname}/${copySource}`, path)
        log(`Successfully ${content ? 'wrote' : 'wrote from template'} "${path}"`)
      } catch (err) {
        fatal(`Error writing ${path}:`, err.message)
      }
      return true
    } else throw new Error('Please provide one of content, copySource for confirmWriteFile')
  }

  if (opts.generateLocalEnv) {
    const envVars = await generateLocalEnv(metaModules)
    const envVarLines = []
    for (const env in envVars) {
      envVarLines.push(`${env}=${envVars[env]}`)
    }
    await confirmWriteFile({ path: '.env', content: envVarLines.join('\n') + '\n' })
    let ignored
    try {
      ignored = execSyncWithEnv('git grep \'.env$\' .gitignore').toString()
    } catch (err) {}
    if (!ignored) {
      log(
        'WARN: It doesnt look like you have .env ignored by your .gitignore file! This is usually a bad idea! Fix with: "echo .env >> .gitignore"'
      )
    }
    return null
  }

  await confirmWriteFile({ path: 'Dockerfile', copySource: './defaults/Dockerfile' })

  if (!(await statFile('inf'))) fatal('There is no ./inf directory in this repository!')

  await confirmWriteFile({
    path: 'inf/node-deployment.yaml',
    copySource: './defaults/deployment.yaml'
  })
}

module.exports = {
  deployNodeApp
}
