'use strict'

const { test } = require('tap')
const ClinicDoctor = require('../index.js')

test('get issue', function (t) {
  const tool = new ClinicDoctor({ dest: './foo' })
  t.equal(tool.issue, null)
  t.end()
})
