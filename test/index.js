const fs = require('fs')
const { expect } = require('chai')
const { execSyncWithEnv } = require('../src/util')

const describe = global.describe
const it = global.it
const cmd = 'node ./src/index.js'
const debug = false

function wrotePkgJsonProperly (path, { language, uri, image, entrypoint, context, ports }) {
  const packageJson = JSON.parse(fs.readFileSync(`${path}/package.json`))
  const cfg = packageJson['deploy-node-app']
  expect(cfg.language).to.equal(language)
  expect(cfg.envs.production).to.be.an('Object')
  expect(cfg.envs.production.uri).to.equal(uri)
  expect(cfg.envs.production.image).to.equal(image)
  expect(cfg.envs.production.entrypoint).to.equal(entrypoint)
  expect(cfg.envs.production.context).to.equal(context)
  expect(cfg.ports).to.have.members(ports)
}

function wroteYamlStructureProperly (path, env = 'production') {
  expect(fs.existsSync(`${path}/k8s/base/deployment.yaml`), 'deployment.yaml').to.equal(true)

  expect(fs.existsSync(`${path}/k8s/base/kustomization.yaml`), 'kustomization.yaml').to.equal(true)
  expect(fs.existsSync(`${path}/k8s/overlays/${env}/kustomization.yaml`), `overlays/${env}/kustomization.yaml`).to.equal(true)
  expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(true)
  expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(true)
}

describe('Deploy-node-app init', function () {
  describe('Nginx', function () {
    describe('Simple', function () {
      const path = 'test/nginx/simple'
      const opts = {
        language: 'nginx',
        name: 'nginx-simple',
        uri: 'nginx-simple.test',
        image: 'kubesail/nginx-simple-test',
        entrypoint: 'public/index.html',
        context: 'test',
        ports: [8000]
      }

      it('Runs init without writing anything except the package.json', () => {
        execSyncWithEnv(`${cmd} init production \
          -t ${path} --config=kubeconfig.yaml \
          --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
          --ports=${opts.ports.join(',')} --address=${opts.uri} \
          --image=${opts.image} --context=${opts.context}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(false)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(false)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(false)
      })

      it('Updates package.json properly', () => {
        wrotePkgJsonProperly(path, opts)
      })

      it('Writes out files in write mode', () => {
        execSyncWithEnv(`${cmd} init production -t ${path} --write`, { catchErr: false })
        wroteYamlStructureProperly(path)
        wrotePkgJsonProperly(path, opts)
        expect(fs.existsSync(`${path}/k8s/base/ingress.yaml`), 'ingress.yaml').to.equal(true)
        expect(fs.existsSync(`${path}/k8s/base/service.yaml`), 'service.yaml').to.equal(true)
      })
    })
  })

  describe('nodejs', function () {
    describe('simple', function () {
      const path = 'test/nodejs/simple'
      const opts = {
        language: 'nodejs',
        name: 'nodejs-simple',
        uri: 'nodejs-simple.test',
        image: 'kubesail/nodejs-simple-test',
        entrypoint: 'index.js',
        context: 'test',
        ports: [8001]
      }
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
            -t ${path} --config=kubeconfig.yaml --update --force \
            --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
            --ports=${opts.ports.join(',')} --address=${opts.uri} \
            --image=${opts.image} --context=${opts.context}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(false)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(false)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(false)
        wrotePkgJsonProperly(path, opts)
      })
    })

    describe('postgres', function () {
      const path = 'test/nodejs/postgres'
      const opts = {
        language: 'nodejs',
        name: 'nodejs-postgres',
        uri: 'nodejs-postgres.test',
        image: 'kubesail/nodejs-postgres-test',
        entrypoint: 'index.js',
        context: 'test',
        ports: [8002]
      }
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
            -t ${path} --config=kubeconfig.yaml --update --force \
            --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
            --ports=${opts.ports.join(',')} --address=${opts.uri} \
            --image=${opts.image} --context=${opts.context}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(false)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(false)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(false)
        wrotePkgJsonProperly(path, opts)
      })
    })

    describe('redis', function () {
      const path = 'test/nodejs/redis'
      const opts = {
        language: 'nodejs',
        name: 'nodejs-redis',
        uri: 'nodejs-redis.test',
        image: 'kubesail/nodejs-redis-test',
        entrypoint: 'index.js',
        context: 'test',
        ports: [8003]
      }
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
            -t ${path} --config=kubeconfig.yaml --update --force \
            --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
            --ports=${opts.ports.join(',')} --address=${opts.uri} \
            --image=${opts.image} --context=${opts.context}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(false)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(false)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(false)
        wrotePkgJsonProperly(path, opts)
      })
    })

    describe('elasticsearch', function () {
      const path = 'test/nodejs/elasticsearch'
      const opts = {
        language: 'nodejs',
        name: 'nodejs-elasticsearch',
        uri: 'nodejs-elasticsearch.test',
        image: 'kubesail/nodejs-elasticsearch-test',
        entrypoint: 'index.js',
        context: 'test',
        ports: [8004]
      }
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
              -t ${path} --config=kubeconfig.yaml --update --force \
              --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
              --ports=${opts.ports.join(',')} --address=${opts.uri} \
              --image=${opts.image} --context=${opts.context}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(false)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(false)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(false)
        wrotePkgJsonProperly(path, opts)
      })
    })

    describe('kafka', function () {
      const path = 'test/nodejs/kafka'
      const opts = {
        language: 'nodejs',
        name: 'nodejs-kafka',
        uri: 'nodejs-kafka.test',
        image: 'kubesail/nodejs-kafka-test',
        entrypoint: 'src/index.js',
        context: 'test',
        ports: [8005]
      }
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
              -t ${path} --config=kubeconfig.yaml --update --force \
              --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
              --ports=${opts.ports.join(',')} --address=${opts.uri} \
              --image=${opts.image} --context=${opts.context}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(false)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(false)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(false)
        wrotePkgJsonProperly(path, opts)
      })
    })

    describe('mongodb', function () {
      const path = 'test/nodejs/mongodb'
      const opts = {
        language: 'nodejs',
        name: 'nodejs-mongodb',
        uri: 'nodejs-mongodb.test',
        image: 'kubesail/nodejs-mongodb-test',
        entrypoint: 'src/index.js',
        context: 'test',
        ports: [8005]
      }
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
              -t ${path} --config=kubeconfig.yaml --update --force \
              --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
              --ports=${opts.ports.join(',')} --address=${opts.uri} \
              --image=${opts.image} --context=${opts.context}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(false)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(false)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(false)
        wrotePkgJsonProperly(path, opts)
      })
    })

    describe('python', function () {
      describe('simple', function () {
        const path = 'test/python/simple'
        const opts = {
          language: 'python',
          name: 'python-simple',
          uri: 'python-simple.test',
          image: 'kubesail/python-simple-test',
          entrypoint: 'server.py',
          context: 'test',
          ports: [8005]
        }
        it('Runs init without exception', () => {
          execSyncWithEnv(`${cmd} init production \
                -t ${path} --config=kubeconfig.yaml --update --force \
                --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
                --ports=${opts.ports.join(',')} --address=${opts.uri} \
                --image=${opts.image} --context=${opts.context}`, { catchErr: false, debug })
          expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(false)
          expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(false)
          expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(false)
          wrotePkgJsonProperly(path, opts)
        })
      })

      describe('redis', function () {
        const path = 'test/python/redis'
        const opts = {
          language: 'python',
          name: 'python-redis',
          uri: 'python-redis.test',
          image: 'kubesail/python-redis-test',
          entrypoint: 'server.py',
          context: 'test',
          ports: [8005]
        }
        it('Runs init without exception', () => {
          execSyncWithEnv(`${cmd} init production \
                -t ${path} --config=kubeconfig.yaml --update --force \
                --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
                --ports=${opts.ports.join(',')} --address=${opts.uri} \
                --image=${opts.image} --context=${opts.context}`, { catchErr: false, debug })
          expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(false)
          expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(false)
          expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(false)
          wrotePkgJsonProperly(path, opts)
        })
      })
    })
  })

  describe('ruby', function () {
    describe('simple', function () {
      const path = 'test/ruby/simple'
      const opts = {
        language: 'ruby',
        name: 'ruby-simple',
        uri: 'ruby-simple.test',
        image: 'kubesail/ruby-simple-test',
        entrypoint: 'index.rb',
        context: 'test',
        ports: [8080]
      }
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
              -t ${path} --config=kubeconfig.yaml --update --force \
              --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
              --ports=${opts.ports.join(',')} --address=${opts.uri} \
              --image=${opts.image} --context=${opts.context}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(false)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(false)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(false)
        wrotePkgJsonProperly(path, opts)
      })
    })

    describe('redis', function () {
      const path = 'test/ruby/redis'
      const opts = {
        language: 'ruby',
        name: 'ruby-redis',
        uri: 'ruby-redis.test',
        image: 'kubesail/ruby-redis-test',
        entrypoint: 'app/index.rb',
        context: 'test',
        ports: [8080]
      }
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
              -t ${path} --config=kubeconfig.yaml --update --force \
              --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
              --ports=${opts.ports.join(',')} --address=${opts.uri} \
              --image=${opts.image} --context=${opts.context}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(false)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(false)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(false)
        wrotePkgJsonProperly(path, opts)
      })
    })
  })
})
