const fs = require('fs')
const util = require('util')
const yaml = require('js-yaml')

const readFile = util.promisify(fs.readFile)

async function buildDependencyConfig (pkg, format = 'compose') {
  const depNames = Object.keys(pkg.dependencies)
  const readFiles = depNames.map(async dep => {
    try {
      return await readFile(`node_modules/${dep}/package.json`).then(json => JSON.parse(json))
    } catch (err) {
      return Promise.resolve(null)
    }
  })
  let files = await Promise.all(readFiles)

  // filter out deps without a package.json, or without any specified deployments
  files = files.filter(file => file !== null).filter(file => !!file.deployments)

  const config = format === 'compose' ? buildCompose(files) : buildKube(files)
  return yaml.safeDump(config)
}

function buildCompose (files) {
  // Point of confusion: In Docker Compose, "services" are analagous to Kube "deployments",
  // meaning if you define a "service" you want a container running for that object
  let deployments = {}
  files.forEach(file => {
    file.deployments.forEach(deployment => {
      const image = deployment.spec.template.spec.containers[0].image
      const ports = deployment.spec.template.spec.containers[0].ports.map(
        port => `${port.containerPort}`
      )
      deployments[deployment.metadata.name] = {
        ports,
        // volumes: [{ '.': '/code' }], // TODO
        image
      }
    })
  })

  // Write out docker compose file
  return {
    version: '2',
    services: deployments
  }
}

function buildKube (files) {
  let configs = []
  files.forEach(file => {
    if (Array.isArray(file.deployments)) {
      configs = configs.concat(file.deployments)
    }
  })
  files.forEach(file => {
    if (Array.isArray(file.services)) {
      configs = configs.concat(file.services)
    }
  })
  return configs
}

function buildAppDeployment (pkg, env, tags, answers) {
  const appName = pkg.name.toLowerCase()
  const name = `${appName}-${env}`

  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name
    },
    spec: {
      selector: {
        matchLabels: {
          app: appName,
          env: env
        }
      },
      minReadySeconds: 5,
      strategy: {
        type: 'RollingUpdate',
        rollingUpdate: {
          maxSurge: 1,
          maxUnavailable: 0
        }
      },
      replicas: 1,
      template: {
        metadata: {
          labels: {
            deployedBy: 'deploy-node-app',
            app: appName,
            env: env
          }
        },
        spec: {
          volumes: [],
          // TODO:
          // imagePullSecrets: [
          //   {
          //     name: 'regsecret'
          //   }
          // ],
          containers: [
            {
              name,
              image: tags.env,
              imagePullPolicy: 'Always',
              ports: [
                {
                  name: answers.protocol,
                  containerPort: parseInt(answers.port, 10)
                }
              ],
              // envFrom: [
              //   {
              //     secretRef: {
              //       name: env
              //     }
              //   }
              // ],
              resources: {
                requests: {
                  cpu: '1m',
                  memory: '32Mi'
                },
                limits: {
                  cpu: '100m',
                  memory: '64Mi'
                }
              }
            }
          ]
        }
      }
    }
  }
}

// Assuming nginx container, listening on port 80
function buildUiDeployment (pkg, env, tags, answers) {
  const appName = `${pkg.name.toLowerCase()}-ui`
  const name = `${appName}-${env}`

  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name
    },
    spec: {
      selector: {
        matchLabels: {
          app: appName,
          env: env
        }
      },
      minReadySeconds: 5,
      strategy: {
        type: 'RollingUpdate',
        rollingUpdate: {
          maxSurge: 1,
          maxUnavailable: 0
        }
      },
      replicas: 1,
      template: {
        metadata: {
          labels: {
            deployedBy: 'deploy-node-app',
            app: appName,
            env: env
          }
        },
        spec: {
          volumes: [],
          // TODO:
          // imagePullSecrets: [
          //   {
          //     name: 'regsecret'
          //   }
          // ],
          containers: [
            {
              name,
              image: tags.uienv,
              imagePullPolicy: 'Always',
              ports: [
                {
                  name: 'http',
                  containerPort: 80
                }
              ],
              resources: {
                requests: {
                  cpu: '1m',
                  memory: '32Mi'
                },
                limits: {
                  cpu: '100m',
                  memory: '64Mi'
                }
              }
            }
          ]
        }
      }
    }
  }
}

module.exports = { buildDependencyConfig, buildAppDeployment, buildUiDeployment }
