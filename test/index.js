const fs = require('fs')
const { expect } = require('chai')
const { execSyncWithEnv } = require('../src/util')

const describe = global.describe
const it = global.it
const cmd = 'node ./src/index.js'

describe('Deploy-node-app end-to-end', function () {
  describe('Nginx', function () {
    describe('Simple', function () {
      const path = 'test/nginx/simple'
      execSyncWithEnv(`${cmd} init production \
        -d ${path} \
        --write \
        --project-name=foobar \
        --entrypoint=index.js \
        --ports=8000 \
        --address=simple-nginx.test \
        --image=kubesail/nginx-simple-test \
        --context=test`, { catchErr: false, env: { DNA_DEBUG: true } })

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
        expect(cfg.envs.production.uri).to.equal('simple-nginx.test')
        expect(cfg.envs.production.image).to.equal('kubesail/nginx-simple-test')
        expect(cfg.envs.production.entrypoint).to.equal('index.js')
        expect(cfg.envs.production.context).to.equal('test')
        expect(cfg.ports[0]).to.equal(8000)
      })
    })
  })
})
