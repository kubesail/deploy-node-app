// @flow

// $FlowIssue
const { expect } = require('chai')

const Namespace = require('../../../src/service/_shared/models/Namespace')
const KubeCluster = require('../../../src/service/_shared/models/KubeCluster')
const { getK8s, getAvailableSharedClusters } = require('../../../src/service/_shared/k8s')

const examples = require('../../../src/service/_shared/models/ExampleApps')

const describe = global.describe
const it = global.it

describe('Kubernetes Methods', function () {
  describe('Namespace', function () {
    it('.apply()', async function () {
      this.timeout(5 * 60 * 1000)
      const clusterAddress = (await getAvailableSharedClusters())[0].address
      const data = await Namespace.apply({
        name: 'test',
        users: [1],
        clusterAddress
      })
      expect(data).to.be.a('object')
    })
  })

  describe('Deployment', function () {
    it('example deployment (qotm)', async function () {
      this.timeout(60000)
      const namespace = 'test'
      const deployment = examples.qotm
      const clusterAddress = (await getAvailableSharedClusters())[0].address
      const client = getK8s(clusterAddress)
      if (client) {
        const createdDeployment = await client.apply({
          group: 'apps',
          version: 'v1beta1',
          kind: 'deployments',
          namespace,
          body: deployment
        })
        expect(createdDeployment.body.kind).to.equal('Deployment')
      } else throw new Error('Didnt get cluster client')
    })
  })

  // DEPRECATED
  describe('Service', function () {
    it('example service for deployment (qotm)', async function () {
      this.timeout(60000)

      const namespace = 'test'
      const deployment = examples.qotm
      const clusterAddress = (await getAvailableSharedClusters())[0].address

      const service = await KubeCluster.applyHttpService(
        deployment.metadata.name,
        namespace,
        deployment.metadata.name,
        { containerPort: deployment.spec.template.spec.containers[0].ports[0].containerPort },
        deployment.spec.template.metadata.labels,
        clusterAddress
      )
      expect(service.body.kind).to.equal('Service')
    })
  })

  describe('UserCredentials', function () {
    it('.apply()', async function () {
      this.timeout(60000)
      const clusterAddress = (await getAvailableSharedClusters())[0].address
      const data = await KubeCluster.getUserCredentials('test', 'test', clusterAddress)
      expect(data).to.be.a('object')
      expect(data.clusterAddress).to.be.a('string')
      expect(data.token).to.be.a('string')
      expect(data.cert).to.be.a('string')
      expect(data.username).to.be.a('string')
    })
  })
})
