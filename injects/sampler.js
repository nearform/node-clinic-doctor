'use strict'

const fs = require('fs')
const makeDir = require('mkdirp')
const traceEvents = require('trace_events')
const systemInfo = require('../collect/system-info.js')
const ProcessStat = require('../collect/process-stat.js')
const getLoggingPaths = require('@nearform/clinic-common').getLoggingPaths('doctor')
const ProcessStatEncoder = require('../format/process-stat-encoder.js')

// create encoding files and directory
const paths = getLoggingPaths({ path: process.env.NODE_CLINIC_DOCTOR_DATA_PATH, identifier: process.pid })

makeDir.sync(paths['/'])

// write system file
fs.writeFileSync(paths['/systeminfo'], JSON.stringify(systemInfo(), null, 2))

const tracing = traceEvents.createTracing({
  categories: ['v8']
})

const processStatEncoder = new ProcessStatEncoder()
const out = processStatEncoder.pipe(fs.createWriteStream(paths['/processstat']))

// sample every 10ms
const processStat = new ProcessStat(parseInt(
  process.env.NODE_CLINIC_DOCTOR_SAMPLE_INTERVAL, 10
))

// keep sample time unrefed such it doesn't interfere too much
let timer = null
function scheduleSample () {
  timer = setTimeout(saveSample, processStat.sampleInterval)
  timer.unref()
}

function saveSample () {
  const sample = processStat.sample()
  processStatEncoder.write(sample)
  processStat.refresh()

  scheduleSample()
}

// allow time delay to be specified before we start collecting data
function start () {
  tracing.enable()
  process.nextTick(() => {
    processStat.refresh()
    scheduleSample()
  })
}

const delay = parseInt(process.env.NODE_CLINIC_DOCTOR_TIMEOUT_DELAY || '0', 10)
if (delay > 0) {
  setTimeout(start, delay)
} else {
  start()
}

// before process exits, flush the encoded data to the sample file
process.once('beforeExit', function () {
  clearTimeout(timer)
  processStatEncoder.end()
  out.on('close', function () {
    process.exit()
  })
})

// NOTE: Workaround until https://github.com/nodejs/node/issues/18476 is solved
process.on('SIGINT', function () {
  if (process.listenerCount('SIGINT') === 1) process.emit('beforeExit')
})

process.on('SIGUSR2', function () {
  // noop to avoid process ending on SIGUSR2
})

process.on('SIGUSR1', function () {
  // noop to avoid process ending on SIGUSR1
})
