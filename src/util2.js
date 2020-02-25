const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const diff = require('diff')
const util = require('util')
const inquirer = require('inquirer')
const style = require('ansi-styles')

const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)
const ERR_ARROWS = `${style.red.open}>>${style.red.close}`

function fatal (message /*: string */) {
  process.stderr.write(`${ERR_ARROWS} ${message}\n`)
  process.exit(1)
}

function log () {
  // eslint-disable-next-line no-console
  console.log(...arguments)
}

function tryDiff (content /*: string */, existingData /*: string */) {
  const compare = diff.diffLines(existingData, content)
  compare.forEach(part =>
    process.stdout.write(
      part.added ? chalk.green(part.value) : part.removed ? chalk.red(part.value) : part.value
    )
  )
}

async function confirmWriteFile (filePath, content, options = { update: false, force: false }) {
  const fullPath = path.join(process.cwd(), filePath)
  const { update, force } = options

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
      await writeFile(fullPath, content)
      log(`Successfully wrote "${filePath}"`)
    } catch (err) {
      fatal(`Error writing ${filePath}: ${err.message}`)
    }
    return true
  }
}

module.exports = {
  fatal,
  log,
  confirmWriteFile
}
