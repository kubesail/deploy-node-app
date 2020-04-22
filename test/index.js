const fs = require('fs')
const { expect } = require('chai')
const { execSyncWithEnv } = require('../src/util')

const describe = global.describe
const it = global.it
const cmd = 'node ./src/index.js'
const debug = false // Turns on execSyncWithEnv printouts

function wroteDNAConfigProperly (path, { language, uri, image, entrypoint, context, ports }) {
  const cfg = JSON.parse(fs.readFileSync(`${path}/.dna.json`))
  expect(cfg.envs.production[0].language).to.equal(language)
  expect(cfg.envs.production[0]).to.be.an('Object')
  expect(cfg.envs.production[0].uri).to.equal(uri)
  expect(cfg.envs.production[0].image).to.equal(image)
  expect(cfg.envs.production[0].entrypoint).to.equal(entrypoint)
  expect(cfg.envs.production[0].ports).to.have.members(ports)
}

function wroteYamlStructureProperly (path, name, env = 'production') {
  expect(fs.existsSync(`${path}/k8s/base/${name}/deployment.yaml`), 'deployment.yaml').to.equal(true)

  expect(fs.existsSync(`${path}/k8s/base/${name}/kustomization.yaml`), 'kustomization.yaml').to.equal(true)
  expect(fs.existsSync(`${path}/k8s/overlays/${env}/kustomization.yaml`), `overlays/${env}/kustomization.yaml`).to.equal(true)
  expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(true)
  expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(true)
}

describe('Deploy-node-app init', function () {
  describe('Nginx', function () {
    describe('Simple', function () {
      const path = 'test/nginx-simple'
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
        execSyncWithEnv(`${cmd} production init \
          --no-prompts -t ${path} --config=kubeconfig.yaml \
          --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
          --ports=${opts.ports.join(',')} --address=${opts.uri} \
          --image=${opts.image}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(true)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(true)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(true)
      })

      it('Updates DNA Config properly', () => {
        wroteYamlStructureProperly(path, opts.name)
        wroteDNAConfigProperly(path, opts)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/ingress.yaml`), 'ingress.yaml').to.equal(true)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/service.yaml`), 'service.yaml').to.equal(true)
      })
    })
  })

  describe('nodejs', function () {
    describe('simple', function () {
      const path = 'test/nodejs-simple'
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
        execSyncWithEnv(`${cmd} production init \
            --no-prompts -t ${path} --config=kubeconfig.yaml --update --force \
            --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
            --ports=${opts.ports.join(',')} --address=${opts.uri} \
            --image=${opts.image}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(true)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(true)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(true)
        wroteDNAConfigProperly(path, opts)
      })
      it('Updates DNA Config properly', () => {
        wroteYamlStructureProperly(path, opts.name)
        wroteDNAConfigProperly(path, opts)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/ingress.yaml`), 'ingress.yaml').to.equal(true)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/service.yaml`), 'service.yaml').to.equal(true)
      })
    })

    describe('postgres', function () {
      const path = 'test/nodejs-postgres'
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
        execSyncWithEnv(`${cmd} production init \
            --no-prompts -t ${path} --config=kubeconfig.yaml --update --force \
            --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
            --ports=${opts.ports.join(',')} --address=${opts.uri} \
            --image=${opts.image}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(true)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(true)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(true)
        wroteDNAConfigProperly(path, opts)
      })
      it('Updates DNA Config properly', () => {
        wroteYamlStructureProperly(path, opts.name)
        wroteDNAConfigProperly(path, opts)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/ingress.yaml`), 'ingress.yaml').to.equal(true)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/service.yaml`), 'service.yaml').to.equal(true)
      })
    })

    describe('redis', function () {
      const path = 'test/nodejs-redis'
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
        execSyncWithEnv(`${cmd} production init \
            --no-prompts -t ${path} --config=kubeconfig.yaml --update --force \
            --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
            --ports=${opts.ports.join(',')} --address=${opts.uri} \
            --image=${opts.image}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(true)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(true)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(true)
        wroteDNAConfigProperly(path, opts)
      })
      it('Updates DNA Config properly', () => {
        wroteYamlStructureProperly(path, opts.name)
        wroteDNAConfigProperly(path, opts)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/ingress.yaml`), 'ingress.yaml').to.equal(true)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/service.yaml`), 'service.yaml').to.equal(true)
      })
    })

    describe('mongodb', function () {
      const path = 'test/nodejs-mongodb'
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
        execSyncWithEnv(`${cmd} production init \
              --no-prompts -t ${path} --config=kubeconfig.yaml --update --force \
              --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
              --ports=${opts.ports.join(',')} --address=${opts.uri} \
              --image=${opts.image}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(true)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(true)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(true)
        wroteDNAConfigProperly(path, opts)
      })
      it('Updates DNA Config properly', () => {
        wroteYamlStructureProperly(path, opts.name)
        wroteDNAConfigProperly(path, opts)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/ingress.yaml`), 'ingress.yaml').to.equal(true)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/service.yaml`), 'service.yaml').to.equal(true)
      })
    })

    describe('python', function () {
      describe('simple', function () {
        const path = 'test/python-simple'
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
          execSyncWithEnv(`${cmd} production init \
                --no-prompts -t ${path} --config=kubeconfig.yaml --update --force \
                --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
                --ports=${opts.ports.join(',')} --address=${opts.uri} \
                --image=${opts.image}`, { catchErr: false, debug })
          expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(true)
          expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(true)
          expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(true)
          wroteDNAConfigProperly(path, opts)
        })
        it('Updates DNA Config properly', () => {
          wroteYamlStructureProperly(path, opts.name)
          wroteDNAConfigProperly(path, opts)
          expect(fs.existsSync(`${path}/k8s/base/${opts.name}/ingress.yaml`), 'ingress.yaml').to.equal(true)
          expect(fs.existsSync(`${path}/k8s/base/${opts.name}/service.yaml`), 'service.yaml').to.equal(true)
        })
      })

      describe('redis', function () {
        const path = 'test/python-redis'
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
          execSyncWithEnv(`${cmd} production init \
                --no-prompts -t ${path} --config=kubeconfig.yaml --update --force \
                --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
                --ports=${opts.ports.join(',')} --address=${opts.uri} \
                --image=${opts.image}`, { catchErr: false, debug })
          expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(true)
          expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(true)
          expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(true)
          wroteDNAConfigProperly(path, opts)
        })
        it('Updates DNA Config properly', () => {
          wroteYamlStructureProperly(path, opts.name)
          wroteDNAConfigProperly(path, opts)
          expect(fs.existsSync(`${path}/k8s/base/${opts.name}/ingress.yaml`), 'ingress.yaml').to.equal(true)
          expect(fs.existsSync(`${path}/k8s/base/${opts.name}/service.yaml`), 'service.yaml').to.equal(true)
        })
      })
    })
  })

  describe('ruby', function () {
    describe('simple', function () {
      const path = 'test/ruby-simple'
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
        execSyncWithEnv(`${cmd} production init \
              --no-prompts -t ${path} --config=kubeconfig.yaml --update --force \
              --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
              --ports=${opts.ports.join(',')} --address=${opts.uri} \
              --image=${opts.image}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(true)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(true)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(true)
        wroteDNAConfigProperly(path, opts)
      })
      it('Updates DNA Config properly', () => {
        wroteYamlStructureProperly(path, opts.name)
        wroteDNAConfigProperly(path, opts)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/ingress.yaml`), 'ingress.yaml').to.equal(true)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/service.yaml`), 'service.yaml').to.equal(true)
      })
    })

    describe('redis', function () {
      const path = 'test/ruby-redis'
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
        execSyncWithEnv(`${cmd} production init \
              --no-prompts -t ${path} --config=kubeconfig.yaml --update --force \
              --language=${opts.language} --project-name=${opts.name} --entrypoint=${opts.entrypoint} \
              --ports=${opts.ports.join(',')} --address=${opts.uri} \
              --image=${opts.image}`, { catchErr: false, debug })
        expect(fs.existsSync(`${path}/k8s`), 'k8s/').to.equal(true)
        expect(fs.existsSync(`${path}/Dockerfile`, 'Dockerfile')).to.equal(true)
        expect(fs.existsSync(`${path}/skaffold.yaml`, 'skaffold.yaml')).to.equal(true)
        wroteDNAConfigProperly(path, opts)
      })
      it('Updates DNA Config properly', () => {
        wroteYamlStructureProperly(path, opts.name)
        wroteDNAConfigProperly(path, opts)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/ingress.yaml`), 'ingress.yaml').to.equal(true)
        expect(fs.existsSync(`${path}/k8s/base/${opts.name}/service.yaml`), 'service.yaml').to.equal(true)
      })
    })
  })
})
