const fs = require('fs')
const { prompt, _debug, _writeTextLine } = require('../util')

module.exports = {
  name: 'plain-dockerfile',
  skipEntrypointPrompt: true,
  skipPortPrompt: true,
  skipHttpPrompt: true,

  detect: async () => {
    if (fs.existsSync('./Dockerfile')) {
      const { simpleDockerfile } = await prompt([
        {
          name: 'simpleDockerfile',
          type: 'confirm',
          message:
            "We can't detect the language for this project, but there does appear to be a Dockerfile - would you like to build and deploy this repo anyways?"
        }
      ])
      if (!simpleDockerfile) return false
      return true
    }
    return false
  }
}
