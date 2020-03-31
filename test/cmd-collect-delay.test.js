'use strict'

const test = require('tap').test
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
