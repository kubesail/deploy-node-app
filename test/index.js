const { expect } = require('chai')

const { API_TARGET } = require('../../../src/service/_shared/config')

const describe = global.describe
const it = global.it

describe('Api tests', function () {
  describe('Protocol stuff', function () {
    it('Should always return JSON', function (done) {
      got(`${API_TARGET}/fosdjfbhsjdf`)
        .json()
        .catch(err => {
          expect(err.response.statusCode).to.equal(404)
          expect(JSON.parse(err.response.body)).to.be.an('object')
          done()
        })
    })
    it('OPTION calls should work properly', function (done) {
      got(`${API_TARGET}/templates`, { method: 'OPTIONS' }).then(response => {
        expect(response.statusCode).to.equal(200)
        done()
      })
    })
  })
})
