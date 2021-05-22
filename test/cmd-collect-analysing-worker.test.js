'use strict'

const { test } = require('tap')
const rimraf = require('rimraf')
const ClinicDoctor = require('../index.js')

test('cmd - test collect - emits "analysing" event', function (t) {
  const tool = new ClinicDoctor()

  function cleanup (err, dirname) {
    t.ifError(err)
    t.match(dirname, /^[0-9]+\.clinic-doctor/)
    rimraf(dirname, (err) => {
      t.ifError(err)
      t.end()
    })
  }

  let seenAnalysing = false
  tool.on('analysing', () => {
    seenAnalysing = true
  })

  const expr = 'setTimeout(() => {}, 123);' +
               'const { Worker } = require("worker_threads");' +
               'new Worker("setTimeout(() => {}, 123);", { eval: true });'

  tool.collect(
    [process.execPath, '-e', expr],
    function (err, dirname) {
      if (err) return cleanup(err, dirname)

      t.ok(seenAnalysing) // should've happened before this callback
      cleanup(null, dirname)
    }
  )
})
