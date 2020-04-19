const fs = require('fs')
const path = require('path')
// eslint-disable-next-line security/detect-child-process
const execSync = require('child_process').execSync
const util = require('util')
const crypto = require('crypto')
const stream = require('stream')
const chalk = require('chalk')
const diff = require('diff')
const mkdirp = require('mkdirp')
const inquirer = require('inquirer')
const style = require('ansi-styles')
const commandExists = require('command-exists')
const got = require('got')

const pipeline = util.promisify(stream.pipeline)
const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)
const ERR_ARROWS = `${style.red.open}>>${style.red.close}`

// Tracks files written to during this process
const filesWritten = []
const dirsWritten = []

function debug () {
  if (!process.env.DNA_DEBUG) return
  console.log(...arguments) // eslint-disable-line no-console
}

function log () {
  console.log(...arguments) // eslint-disable-line no-console
}

// Fatal is like log, but exits the process
function fatal (message /*: string */) {
  process.stderr.write(`${ERR_ARROWS} ${message}\n`)
  process.exit(1)
}

// Diffs two strings prettily to stdout
function tryDiff (content /*: string */, existingData /*: string */) {
  const compare = diff.diffLines(existingData, content)
  compare.forEach(part =>
    process.stdout.write(
      part.added ? chalk.green(part.value) : part.removed ? chalk.red(part.value) : part.value
    )
  )
}

// Writes a file unless it already exists, then properly handles that
// Can also diff before writing!
async function confirmWriteFile (filePath, content, options = { update: false, force: false }) {
  const { update, force } = options
  const fullPath = path.join(options.target, filePath)

  const exists = fs.existsSync(fullPath)
  let doWrite = !exists
  if (!update && exists) return false
  else if (exists && update && !force) {
    const existingData = (await readFile(fullPath)).toString()
    if (content === existingData) return false

    const YES_TEXT = 'Yes (update)'
    const NO_TEXT = 'No, dont touch'
    const SHOWDIFF_TEXT = 'Show diff'
    const confirmUpdate = (
      await inquirer.prompt({
        name: 'update',
        type: 'expand',
        message: `Would you like to update "${filePath}"?\n`,
        choices: [
          { key: 'Y', value: YES_TEXT },
          { key: 'N', value: NO_TEXT },
          { key: 'D', value: SHOWDIFF_TEXT }
        ],
        default: 0
      })
    ).update
    if (confirmUpdate === YES_TEXT) doWrite = true
    else if (confirmUpdate === SHOWDIFF_TEXT) {
      tryDiff(content, existingData)
      await confirmWriteFile(filePath, content, options)
    }
  } else if (force) {
    doWrite = true
  }

  if (doWrite) {
    try {
      // Don't document writes to existing files - ie: never delete a users files!
      if (!options.dontPrune && !fs.existsSync(fullPath)) filesWritten.push(fullPath)
      await writeFile(fullPath, content)
      debug(`Successfully wrote "${filePath}"`)
    } catch (err) {
      fatal(`Error writing ${filePath}: ${err.message}`)
    }
    return true
  }
}

const mkdir = async (filePath, options) => {
  const fullPath = path.join(options.target, filePath)
  const created = await mkdirp(fullPath)
  if (created) {
    const dirParts = filePath.replace('./', '').split('/')
    if (!options.dontPrune) {
      for (let i = dirParts.length; i > 0; i--) {
        dirsWritten.push(path.join(options.target, dirParts.slice(0, i).join(path.sep)))
      }
    }
  }
  return created
}

// Cleans up files written by confirmWriteFile and directories written by mkdir
// Does not delete non-empty directories!
const cleanupWrittenFiles = (options) => {
  if (options.write) return
  filesWritten.forEach(file => {
    debug(`Removing file "${file}"`)
    fs.unlinkSync(file)
  })
  const dirsToRemove = dirsWritten.filter((v, i, s) => s.indexOf(v) === i)
  for (let i = 0; i < dirsToRemove.length; i++) {
    const dir = dirsToRemove[i]
    const dirParts = dir.replace('./', '').split(path.sep)
    for (let i = dirParts.length; i >= 0; i--) {
      const dirPart = dirParts.slice(0, i).join(path.sep)
      if (!dirPart) continue
      else if (fs.existsSync(dirPart) && fs.readdirSync(dirPart).length === 0) {
        debug(`Removing directory "${dirPart}"`)
        fs.rmdirSync(dirPart)
      } else break
    }
  }
}

// Runs a shell command with our "process.env" - allows passing environment variables to skaffold, for example.
const execSyncWithEnv = (cmd, options = {}) => {
  const mergedOpts = Object.assign({ catchErr: true }, options, {
    stdio: options.stdio || 'pipe',
    cwd: process.cwd(),
    shell: process.env.SHELL || '/bin/sh'
  })
  if (options.debug) log(`execSyncWithEnv: ${cmd}`)
  let output
  try {
    output = execSync(cmd, mergedOpts)
  } catch (err) {
    if (mergedOpts.catchErr) {
      fatal(`Command "${cmd}" failed to run`)
      process.exit(1)
    } else {
      throw err
    }
  }
  if (output) return output.toString().trim()
}

// Ensures other applications are installed (eg: skaffold)
async function ensureBinaries (options) {
  const nodeModulesPath = path.join(options.target, 'node_modules/.bin/skaffold')
  const existsInNodeModules = fs.existsSync(nodeModulesPath)
  const existsInPath = commandExists.sync('skaffold')
  if (!existsInNodeModules && !existsInPath) {
    const { downloadSkaffold } = await inquirer.prompt([
      {
        name: 'downloadSkaffold',
        type: 'confirm',
        message: 'Can\'t find a local "skaffold" installed - Try to download one automatically?'
      }
    ])
    if (!downloadSkaffold) return fatal('Please install skaffold manually - see https://skaffold.dev/docs/install/')
    let skaffoldUri = ''
    switch (process.platform) {
      case 'darwin':
        skaffoldUri = 'https://storage.googleapis.com/skaffold/releases/latest/skaffold-darwin-amd64'; break
      case 'linux':
        skaffoldUri = 'https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-amd64'; break
      case 'win32':
        skaffoldUri = 'https://storage.googleapis.com/skaffold/releases/latest/skaffold-windows-amd64.exe'; break
      default:
        return fatal('Can\'t determine platform! Please download skaffold manually - see https://skaffold.dev/docs/install/')
    }
    if (skaffoldUri) await pipeline(got.stream(skaffoldUri), fs.createWriteStream(nodeModulesPath))
  }

  return existsInPath ? execSyncWithEnv('which skaffold') : nodeModulesPath
}

function promptUserForValue (name, { message, validate, defaultValue, type = 'input', defaultToProjectName }) {
  return async (existing, options) => {
    if (existing && !options.update) return existing
    defaultValue = defaultValue || existing
    if (defaultToProjectName) defaultValue = options.name
    if (!message) message = `Module "${options.name}" needs a setting: ${name}`
    const values = await inquirer.prompt([{ name, type, message, validate, default: defaultValue }])
    return values[name]
  }
}

function generateRandomStr (length = 16) {
  return (existing, _options) => {
    if (existing) return existing
    return new Promise((resolve, reject) => {
      crypto.randomBytes(length, function (err, buff) {
        if (err) throw err
        resolve(buff.toString('hex'))
      })
    })
  }
}

async function readConfig (options) {
  let packageJson = {}
  try {
    packageJson = JSON.parse(await readFile(path.join(options.target, './package.json')))
  } catch (_err) {}
  const config = packageJson['deploy-node-app'] || {}
  if (!config.name) config.name = packageJson.name
  return config
}

// Idempotently writes a line of text to a file
async function writeTextLine (file, line, options = { update: false, force: false, append: false }) {
  let existingContent
  try {
    existingContent = (await readFile(file)).toString()
  } catch (_err) {}
  if (!existingContent || (existingContent && existingContent.indexOf(line) === -1 && options.append)) {
    await confirmWriteFile(file, [existingContent, line].filter(Boolean).join('\n'), {
      ...options, force: filesWritten.includes(file) || options.force
    })
  }
}

module.exports = {
  debug,
  fatal,
  log,
  mkdir,
  cleanupWrittenFiles,
  generateRandomStr,
  ensureBinaries,
  confirmWriteFile,
  writeTextLine,
  execSyncWithEnv,
  readConfig,
  promptUserForValue
}
