const fs = require('fs')
const path = require('path')
const inquirer = require('inquirer')
const npmPackages = ['webpack', 'react']

module.exports = {
  name: 'nginx',
  suggestedPorts: [8080],

  detect: async (options) => {
    // Look for common node.js based frontend packages
    let looksLikeFrontend = false
    const pkgPath = path.join(options.target, './package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(pkgPath))
        looksLikeFrontend = !!npmPackages.find(pkg => {
          return Object.keys(packageJson.dependencies).includes(pkg)
        })
      } catch {}
    }

    // If there is a /public folder, they may just want to deploy that (completely static site, with no build pipeline?)
    if (fs.existsSync('./public/index.html') || fs.existsSync('./public/index.htm')) {
      looksLikeFrontend = true
    }

    if (looksLikeFrontend) {
      const { useNginx } = await inquirer.prompt([
        {
          name: 'useNginx',
          type: 'confirm',
          message: 'This project looks like it might be a static site, would you like to use nginx?'
        }
      ])
      return useNginx
    }

    return false
  },

  dockerfile: ({ entrypoint }) => {
    return [
      'FROM nginxinc/nginx-unprivileged',
      `COPY ${path.dirname(entrypoint)} /usr/share/nginx/html`
    ].join('\n')
  }
}
