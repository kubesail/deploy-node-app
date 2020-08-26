const fs = require('fs')
const path = require('path')
const readline = require('readline')
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
const got = require('got')

const pipeline = util.promisify(stream.pipeline)
const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)
const ERR_ARROWS = `${style.red.open}>>${style.red.close}`

// Tracks files written to during this process
const filesWritten = []
const dirsWritten = []

function debug() {
  if (!process.env.DNA_DEBUG) return
  console.log(...arguments) // eslint-disable-line no-console
}

function log() {
  console.log(...arguments) // eslint-disable-line no-console
}

// Fatal is like log, but exits the process
function fatal(message /*: string */) {
  process.stderr.write(`${ERR_ARROWS} ${message}\n`)
  process.exit(1)
}

// Diffs two strings prettily to stdout
function tryDiff(content /*: string */, existingData /*: string */) {
  const compare = diff.diffLines(existingData, content)
  compare.forEach(part =>
    process.stdout.write(
      part.added ? chalk.green(part.value) : part.removed ? chalk.red(part.value) : part.value
    )
  )
}

// A wrapper around prompt()
function prompt(options) {
  return new Promise((resolve, reject) => {
    if (process.env.REPO_BUILDER_PROMPTS) {
      process.stdout.write('KUBESAIL_REPO_BUILDER_PROMPTS\n')
      const timeout = setTimeout(() => {
        log(
          'Repo build timeout. Running with KUBESAIL_REPO_BUILDER_PROMPTS, questions must be answered in a separate process and this process resumed via SIGCONT.'
        )
        process.exit(0)
      }, 30 * 60 * 1000)
      process.on('SIGCONT', () => {
        log('Prompts completed. Starting build...')
        clearTimeout(timeout)
      })
    } else if (process.env.REPO_BUILDER_PROMPT_JSON) {
      let question = options
      if (Array.isArray(options)) {
        question = options[0]
      }
      log(`KUBESAIL_REPO_BUILDER_PROMPT_JSON|${JSON.stringify(question)}`)
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.on('line', line => {
        resolve({ [question.name]: line })
      })
    } else {
      resolve(inquirer.prompt(options))
    }
  })
}

// Writes a file unless it already exists, then properly handles that
// Can also diff before writing!
async function confirmWriteFile(filePath, content, options = { update: false, force: false }) {
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
    process.stdout.write('\n')
    const confirmUpdate = (
      await prompt({
        name: 'update',
        type: 'expand',
        message: `Would you like to update "${filePath}"?`,
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
const cleanupWrittenFiles = options => {
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
    env: process.env
  })
  cmd = cmd.replace(/^\.\//, process.cwd() + path.sep)
  debug(`execSyncWithEnv: ${cmd}`)
  let output
  try {
    output = execSync(cmd, mergedOpts)
  } catch (err) {
    if (mergedOpts.catchErr) {
      return false
    } else {
      throw err
    }
  }
  if (output) return output.toString().trim()
}

// Ensures other applications are installed (eg: skaffold)
async function ensureBinaries(options) {
  // Check for skaffold and download it if it does not exist
  const nodeModulesPath = `${options.target}/node_modules/.bin`
  const skaffoldVersion = 'v1.13.2'
  const skaffoldDownloadPath = `${nodeModulesPath}/skaffold-${skaffoldVersion}`
  let skaffoldPath = process.env.SKAFFOLD_PATH || skaffoldDownloadPath

  if (!fs.existsSync(skaffoldPath)) {
    let skaffoldUri = ''
    switch (process.platform) {
      case 'darwin':
        skaffoldUri = `https://storage.googleapis.com/skaffold/releases/${skaffoldVersion}/skaffold-darwin-amd64`
        break
      case 'linux':
        skaffoldUri = `https://storage.googleapis.com/skaffold/releases/${skaffoldVersion}/skaffold-linux-amd64`
        break
      case 'win32':
        skaffoldUri = `https://storage.googleapis.com/skaffold/releases/${skaffoldVersion}/skaffold-windows-amd64.exe`
        break
      default:
        return fatal(
          "Can't determine platform! Please download skaffold manually - see https://skaffold.dev/docs/install/"
        )
    }
    if (skaffoldUri) {
      log(`Downloading skaffold ${skaffoldVersion} to ${nodeModulesPath}...`)
      await mkdir(nodeModulesPath, options)
      await pipeline(got.stream(skaffoldUri), fs.createWriteStream(skaffoldDownloadPath)).catch(
        err => {
          log(`Failed to download skaffold ${skaffoldVersion} to ${nodeModulesPath}!`, {
            error: err.message
          })
          fs.unlinkSync(skaffoldDownloadPath)
          process.exit(1)
        }
      )
      fs.chmodSync(skaffoldDownloadPath, 0o775)
      return skaffoldDownloadPath
    }
  }

  return skaffoldPath
}

function promptUserForValue(
  name,
  { message, validate, defaultValue, type = 'input', defaultToProjectName }
) {
  return async (existing, options) => {
    defaultValue = defaultValue || existing
    if (defaultToProjectName) defaultValue = options.name
    if (defaultValue && (!options.update || !options.prompts)) return defaultValue
    if (!message) message = `Module "${options.name}" needs a setting: ${name}`
    process.stdout.write('\n')
    const values = await prompt([{ name, type, message, validate, default: defaultValue }])
    return values[name]
  }
}

function generateRandomStr(length = 16) {
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

async function readDNAConfig(options) {
  let dnaConfig = {}
  try {
    dnaConfig = JSON.parse(await readFile(path.join(options.target, '.dna.json')))
  } catch (_err) {}
  return dnaConfig
}

// Idempotently writes a line of text to a file
async function writeTextLine(file, line, options = { update: false, force: false, append: false }) {
  if (!options.write) return
  let existingContent
  try {
    existingContent = (await readFile(path.join(options.target, file))).toString()
  } catch (_err) {}
  if (
    !existingContent ||
    (existingContent && existingContent.indexOf(line) === -1 && options.append)
  ) {
    await confirmWriteFile(file, [existingContent, line].filter(Boolean).join('\n'), options)
  }
}

module.exports = {
  debug,
  fatal,
  log,
  mkdir,
  prompt,
  cleanupWrittenFiles,
  generateRandomStr,
  ensureBinaries,
  confirmWriteFile,
  writeTextLine,
  execSyncWithEnv,
  readDNAConfig,
  promptUserForValue
}
