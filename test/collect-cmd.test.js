'use strict'

const test = require('tap').test
const async = require('async')
const summary = require('summary')
const endpoint = require('endpoint')
const CollectAndRead = require('./collect-and-read.js')

function diff (data) {
  const output = []
  let last = data[0]
  for (let i = 1; i < data.length; i++) {
    output.push(data[i] - last)
    last = data[i]
  }
  return output
}

test('test gc events', function (t) {
  const cmd = new CollectAndRead({}, '--expose-gc', '-e', `
    const t = [];

    const interval1 = setInterval(function () {
      for (let i = 0; i < 2000; i++) {
        t.push(new Date())
      }
    }, 20)

    const interval2 = setInterval(function () {
      for (let i = 0; i < 500; i++) {
        t.pop()
      }
    })

    setTimeout(function () {
      clearInterval(interval1)
      clearInterval(interval2)
      global.gc()
    }, 200)
  `)

  cmd.on('error', t.ifError.bind(t))
  cmd.on('ready', function (gcEventReader, processStatReader) {
    async.parallel({
      gcEvent (done) {
        gcEventReader.pipe(endpoint({ objectMode: true }, done))
      },

      processStat (done) {
        processStatReader.pipe(endpoint({ objectMode: true }, done))
      }
    }, function (err, output) {
      if (err) return t.ifError(err)

      const scavenge = output.gcEvent
        .filter((event) => event.type === 'SCAVENGE')
      const markSweepCompact = output.gcEvent
        .filter((event) => event.type === 'MARK_SWEEP_COMPACT')

      t.ok(scavenge.length >= 2)
      t.strictDeepEqual(scavenge[0], {
        timestamp: scavenge[0].timestamp,
        type: 'SCAVENGE',
        phase: 'BEGIN'
      })
      t.strictDeepEqual(scavenge[1], {
        timestamp: scavenge[1].timestamp,
        type: 'SCAVENGE',
        phase: 'END'
      })
      t.ok(scavenge[0].timestamp <= scavenge[1].timestamp)

      t.strictEqual(markSweepCompact.length, 2)
      t.strictDeepEqual(markSweepCompact[0], {
        timestamp: markSweepCompact[0].timestamp,
        type: 'MARK_SWEEP_COMPACT',
        phase: 'BEGIN'
      })
      t.strictDeepEqual(markSweepCompact[1], {
        timestamp: markSweepCompact[1].timestamp,
        type: 'MARK_SWEEP_COMPACT',
        phase: 'END'
      })
      t.ok(markSweepCompact[0].timestamp <= markSweepCompact[1].timestamp)

      t.end()
    })
  })
})

test('collect command produces data files with content', function (t) {
  const cmd = new CollectAndRead({}, '-e', 'setTimeout(() => {}, 200)')
  cmd.on('error', t.ifError.bind(t))
  cmd.on('ready', function (gcEventReader, processStatReader) {
    async.parallel({
      gcEvent (done) {
        gcEventReader.pipe(endpoint({ objectMode: true }, done))
      },

      processStat (done) {
        processStatReader.pipe(endpoint({ objectMode: true }, done))
      }
    }, function (err, output) {
      if (err) return t.ifError(err)

      // to fast to cause gc
      t.ok(output.gcEvent.length >= 0)

      // expect time seperation to be 10ms, allow 10ms error
      const sampleTimes = output.processStat.map((stat) => stat.timestamp)
      const timeSeperation = summary(diff(sampleTimes)).mean()
      t.ok(sampleTimes.length > 0, 'data is outputted')
      t.ok(Math.abs(timeSeperation - 10) < 10)

      t.end()
    })
  })
})

test('custom sample interval', function (t) {
  const cmd = new CollectAndRead({
    sampleInterval: 1
  }, '-e', 'setTimeout(() => {}, 200)')

  cmd.on('error', t.ifError.bind(t))
  cmd.on('ready', function (gcEventReader, processStatReader) {
    async.parallel({
      gcEvent (done) {
        gcEventReader.pipe(endpoint({ objectMode: true }, done))
      },

      processStat (done) {
        processStatReader.pipe(endpoint({ objectMode: true }, done))
      }
    }, function (err, output) {
      if (err) return t.ifError(err)

      // to fast to cause gc
      t.ok(output.gcEvent.length >= 0)

      // expect time seperation to be 1ms, allow 5ms error
      const sampleTimes = output.processStat.map((stat) => stat.timestamp)
      const timeSeperation = summary(diff(sampleTimes)).mean()
      t.ok(sampleTimes.length > 0, 'data is outputted')
      t.ok(Math.abs(timeSeperation - 1) < 5)

      t.end()
    })
  })
})
