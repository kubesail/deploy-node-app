// @flow

const fs = require('fs')
const util = require('util')
const yaml = require('js-yaml')

const readFile = util.promisify(fs.readFile)

async function findMetaModules (pkg, format = 'compose') {
  const depNames = Object.keys(pkg.dependencies)
  const readFiles = depNames.map(async dep => {
    try {
      return await readFile(`node_modules/${dep}/package.json`).then(json => JSON.parse(json))
    } catch (err) {
      return Promise.resolve(null)
    }
  })
  let files = await Promise.all(readFiles)

  // filter out deps without a package.json and without any specified deployments
  files = files.filter(file => file !== null).filter(file => !!file['deploy-node-app'])

  const config = format === 'compose' ? buildCompose(files) : buildKustomize(files)
  return yaml.safeDump(config)
}

function buildCompose (dependencies) {
  let services = {}
  dependencies.forEach(dependency => {
    if (dependency['deploy-node-app'].metamodule) {
      const filename = `./node_modules/${dependency.name}/docker-compose.yaml`
      if (fs.existsSync(filename)) {
        const config = yaml.safeLoad(fs.readFileSync(filename))
        console.log({ config })
        services = Object.assign({}, services, config.services)
      } else {
        process.stdout.write('Warning:', dependency.name, 'doesn\'t support Docker Compose mode\n')
      }
    }
  })

  return {
    version: '2',
    services
  }
}

function buildKustomize (dependencies) {
  let bases = []
  dependencies.forEach(dependency => {
    if (dependency['deploy-node-app'].metamodule) {
      if (fs.existsSync(`./node_modules/${dependency.name}/kustomization.yaml`)) {
        bases.push(`./node_modules/${dependency.name}`)
      } else {
        process.stdout.write('Warning:', dependency.name, 'doesn\'t support Kustomize mode\n')
      }
    }
  })

  return { bases }
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

function buildUiConfigMap () {
  return {
    apiVersion: 'apps/v1',
    data: {
      default: `
      server {
        root /www/data;

        location / {
        }

        location /images/ {
        }

        location ~ \.(mp3|mp4) {
            root /www/media;
        }
    }

        upstream hello {
            server hello;
        }

        server {
            listen 80;

            location / {
                proxy_pass http://hello;
            }
        }`
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

// Currently only useful for KubeSail
function buildAppService (pkg, env, tags, answers, namespace, exposeExternally = true) {
  const appName = pkg.name.toLowerCase()
  const name = `${appName}-${env}-http`

  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      annotations: exposeExternally
        ? {
          'getambassador.io/config': JSON.stringify({
            apiVersion: 'ambassador/v1',
            kind: 'Mapping',
            name: `${name}.${namespace}`,
            prefix: '/',
            service: `http://${name}.${namespace}:${answers.port}`,
            host: `${appName}--${namespace}.kubesail.io`, // TODO allow custom domains
            timeout_ms: 10000,
            use_websocket: true
          })
        }
        : null,
      name: `${name}`
    },
    spec: {
      ports: [
        {
          port: answers.port,
          protocol: 'TCP',
          targetPort: answers.port
        }
      ],

      selector: {
        deployedBy: 'deploy-node-app',
        app: appName,
        env: env
      }
    }
  }
}

// Currently only useful for KubeSail
// Assuming nginx container, listening on port 80
function buildUiService (pkg, env, tags, answers, namespace) {
  const appName = `${pkg.name.toLowerCase()}-ui`
  const name = `${appName}-${env}-http`

  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      annotations: {
        'getambassador.io/config': JSON.stringify({
          apiVersion: 'ambassador/v1',
          kind: 'Mapping',
          name: `${name}.${namespace}`,
          prefix: '/',
          service: `http://${name}.${namespace}:80`,
          host: `${appName}-www--${namespace}.kubesail.io`, // TODO allow custom domains
          timeout_ms: 10000,
          use_websocket: true
        })
      },
      name: `${name}`
    },
    spec: {
      ports: [
        {
          port: 80,
          protocol: 'TCP',
          targetPort: 80
        }
      ],
      selector: {
        deployedBy: 'deploy-node-app',
        app: appName,
        env: env
      }
    }
  }
}

function buildUiDockerfile (staticDir = '/build') {
  const dockerfilePath = 'Dockerfile.ui'
  const dockerfile = `
  FROM nginx
  COPY ${staticDir} /usr/share/nginx/html`

  fs.writeFileSync(dockerfilePath, dockerfile)
}

function buildDockerfile (entrypoint) {
  // convert windows paths to unix paths
  entrypoint = entrypoint.replace(/\\/g, '/')

  let dockerfile
  let dockerignore
  const dockerfilePath = 'Dockerfile'
  const dockerignorePath = '.dockerignore'

  if (fs.existsSync(dockerfilePath)) {
    try {
      dockerfile = fs.readFileSync(dockerfilePath)
    } catch (err) {
      fatal(`It seems you have a Dockerfile at ${dockerfilePath}, but it is not readable!`)
    }
  } else {
    // TODO: Detect (or get from options, yarn versus npm)
    dockerfile = `
FROM node:alpine

WORKDIR /app

ENV NODE_ENV="production"

COPY package.json yarn.loc[k] package-lock.jso[n] /app/

RUN \\
  # apk add build-base make gcc g++ linux-headers python-dev libc-dev libc6-compat && \\
  yarn install --no-cache --production && \\
  adduser -S nodejs && \\
  chown -R nodejs /app && \\
  chown -R nodejs /home/nodejs

COPY . /app/

USER nodejs

CMD ["node", "${entrypoint}"]
      `

    fs.writeFileSync(dockerfilePath, dockerfile)
  }

  if (fs.existsSync(dockerignorePath)) {
    try {
      dockerignore = fs.readFileSync(dockerignorePath)
    } catch (err) {
      fatal(
        `It seems you have a .dockerignore file at ${dockerignorePath}, but it is not readable!`
      )
    }
  } else {
    dockerignore = '.git\nnode_modules'
    fs.writeFileSync(dockerignorePath, dockerignore)
  }

  return { dockerfile, dockerignore }
}

module.exports = {
  findMetaModules,
  buildAppDeployment,
  buildUiDeployment,
  buildAppService,
  buildUiService,
  buildDockerfile,
  buildUiDockerfile
}
