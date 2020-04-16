const fs = require('fs')
const { expect } = require('chai')
const { execSyncWithEnv } = require('../src/util')

const describe = global.describe
const it = global.it
const cmd = 'node ./src/index.js'

describe('Deploy-node-app init', function () {
  describe('Nginx', function () {
    describe('Simple', function () {
      const path = 'test/nginx/simple'

      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
          -d ${path} \
          --write \
          --project-name=foobar \
          --entrypoint=index.js \
          --ports=8000 \
          --address=nginx-simple.test \
          --image=kubesail/nginx-simple-test \
          --context=test`, { catchErr: false })
      })

      it('Creates appropriate YAML:', () => {
        expect(fs.existsSync(`${path}/k8s/base/deployment.yaml`), 'deployment.yaml').to.equal(true)
        expect(fs.existsSync(`${path}/k8s/base/ingress.yaml`), 'ingress.yaml').to.equal(true)
        expect(fs.existsSync(`${path}/k8s/base/kustomization.yaml`), 'kustomization.yaml').to.equal(true)
        expect(fs.existsSync(`${path}/k8s/base/service.yaml`), 'service.yaml').to.equal(true)
        expect(fs.existsSync(`${path}/k8s/base/deployment.yaml`, 'deployment.yaml')).to.equal(true)
        expect(fs.existsSync(`${path}/k8s/overlays/production/kustomization.yaml`), 'overlays/production/kustomization.yaml').to.equal(true)
      })

      it('Updates package.json properly', () => {
        const packageJson = JSON.parse(fs.readFileSync(`${path}/package.json`))
        const cfg = packageJson['deploy-node-app']
        expect(cfg.envs.production).to.be.an('Object')
        expect(cfg.envs.production.uri).to.equal('nginx-simple.test')
        expect(cfg.envs.production.image).to.equal('kubesail/nginx-simple-test')
        expect(cfg.envs.production.entrypoint).to.equal('index.js')
        expect(cfg.envs.production.context).to.equal('test')
        expect(cfg.ports[0]).to.equal(8000)
      })
    })
  })

  describe('nodejs', function () {
    describe('simple', function () {
      const path = 'test/nodejs/simple'
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
          -d ${path} \
          --write \
          --project-name=nodejs-simple \
          --entrypoint=index.js \
          --ports=8001 \
          --address=nodejs-simple.test \
          --image=kubesail/nodejs-simple-test \
          --context=test`, { catchErr: false })
      })
    })
    describe('postgres', function () {
      const path = 'test/nodejs/postgres'
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
          -d ${path} \
          --write \
          --project-name=nodejs-postgres \
          --entrypoint=index.js \
          --ports=8002 \
          --address=nodejs-postgres.test \
          --image=kubesail/nodejs-postgres-test \
          --context=test`, { catchErr: false })
      })
    })
    describe('redis', function () {
      const path = 'test/nodejs/redis'
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
          -d ${path} \
          --write \
          --project-name=nodejs-redis \
          --entrypoint=index.js \
          --ports=8003 \
          --address=nodejs-redis.test \
          --image=kubesail/nodejs-redis-test \
          --context=test`, { catchErr: false })
      })
    })
    describe('elasticsearch', function () {
      const path = 'test/nodejs/elasticsearch'
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
          -d ${path} \
          --write \
          --project-name=nodejs-elasticsearch \
          --entrypoint=index.js \
          --ports=8004 \
          --address=nodejs-elasticsearch.test \
          --image=kubesail/nodejs-elasticsearch-test \
          --context=test`, { catchErr: false })
      })
    })
    describe('kafka', function () {
      const path = 'test/nodejs/kafka'
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
          -d ${path} \
          --write \
          --project-name=nodejs-kafka \
          --entrypoint=index.js \
          --ports=8005 \
          --address=nodejs-kafka.test \
          --image=kubesail/nodejs-kafka-test \
          --context=test`, { catchErr: false })
      })
    })
    describe('mongodb', function () {
      const path = 'test/nodejs/mongodb'
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
          -d ${path} \
          --write \
          --project-name=nodejs-mongodb \
          --entrypoint=index.js \
          --ports=8006 \
          --address=nodejs-mongodb.test \
          --image=kubesail/nodejs-mongodb-test \
          --context=test`, { catchErr: false })
      })
    })
  })

  describe('python', function () {
    describe('simple', function () {
      const path = 'test/python/simple'
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
          -d ${path} \
          --write \
          --project-name=python-simple \
          --entrypoint=index.js \
          --ports=8008 \
          --address=python-simple.test \
          --image=kubesail/python-simple-test \
          --context=test`, { catchErr: false })
      })
    })
    describe('redis', function () {
      const path = 'test/python/redis'
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
          -d ${path} \
          --write \
          --project-name=python-redis \
          --entrypoint=index.js \
          --ports=8007 \
          --address=python-redis.test \
          --image=kubesail/python-redis-test \
          --context=test`, { catchErr: false })
      })
    })
  })

  describe('ruby', function () {
    describe('simple', function () {
      const path = 'test/ruby/simple'
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
          -d ${path} \
          --write \
          --project-name=ruby-simple \
          --entrypoint=index.js \
          --ports=8010 \
          --address=ruby-simple.test \
          --image=kubesail/ruby-simple-test \
          --context=test`, { catchErr: false })
      })
    })
    describe('redis', function () {
      const path = 'test/ruby/redis'
      it('Runs init without exception', () => {
        execSyncWithEnv(`${cmd} init production \
          -d ${path} \
          --write \
          --project-name=ruby-redis \
          --entrypoint=index.js \
          --ports=8009 \
          --address=ruby-redis.test \
          --image=kubesail/ruby-redis-test \
          --context=test`, { catchErr: false })
      })
    })
  })
})
