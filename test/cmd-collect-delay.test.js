'use strict'

const test = require('tap').test
const async = require('async')
const endpoint = require('endpoint')
const CollectAndRead = require('./collect-and-read.js')

test('cmd - collect - delay', function (t) {
  const cmd = new CollectAndRead({ collectDelay: 300 }, '-e', `
    const sleep = require('atomic-sleep')
    setTimeout(function () {
      sleep(200)

      // keep process going for a while so we can collect stats
      setTimeout(function () {}, 500)
    }, 0)
  `)

  cmd.on('ready', function () {
    cmd.processStat.pipe(endpoint({ objectMode: true }, onprocessstat))
  })

  function onprocessstat (err, stats) {
    t.ifError(err)
    const highestDelay = stats.reduce((acc, stat) => Math.max(acc, stat.delay), 0)
    t.ok(highestDelay < 100, 'should not have measured the 200ms event loop delay')
    t.end()
  }
})

test('cmd - collect - delay for longer than the process runs', function (t) {
  // This test starts generating trace event and process stat data _after_ the app has done all its work.
  // This test ensures that the trace events log is either always created, or that we do not crash if it does not exist.
  const cmd = new CollectAndRead({ collectDelay: 300 }, '-e', `
    const sleep = require('atomic-sleep')
    setTimeout(function () {
      sleep(200)
    }, 0)
  `)

  cmd.on('ready', function () {
    async.parallel({
      traceEvent (done) {
        cmd.traceEvent.pipe(endpoint({ objectMode: true }, done))
      },

      processStat (done) {
        cmd.processStat.pipe(endpoint({ objectMode: true }, done))
      }
    }, function (err, output) {
      if (err) return t.ifError(err)

      t.equal(output.traceEvent.length, 0)
      t.equal(output.processStat.length, 0)

      t.end()
    })
  })
})
