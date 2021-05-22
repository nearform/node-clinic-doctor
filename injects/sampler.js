'use strict'

// Important to keep in mind that every Node.js worker thread
// will run it's own instance of the sample.js.

const fs = require('fs')
const makeDir = require('mkdirp')
const systemInfo = require('../collect/system-info.js')
const ProcessStat = require('../collect/process-stat.js')
const getLoggingPaths = require('@nearform/clinic-common').getLoggingPaths('doctor')
const ProcessStatEncoder = require('../format/process-stat-encoder.js')
const { isMainThread, threadId } = require('worker_threads')

// create encoding files and directory
const paths = getLoggingPaths({ path: process.env.NODE_CLINIC_DOCTOR_DATA_PATH, identifier: process.pid })

makeDir.sync(paths['/'])

// write system file only on the main thread
if (isMainThread) {
  fs.writeFileSync(paths['/systeminfo'], JSON.stringify(systemInfo(), null, 2))
}

const processStatEncoder = new ProcessStatEncoder()

// If sampling in a worker thread, we have to write samples
// out to a separate processstat file.
let outpath = paths['/processstat']
if (!isMainThread) {
  outpath += `-${threadId}`
}

const out = processStatEncoder.pipe(fs.createWriteStream(outpath))

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
setTimeout(() => {
  processStat.refresh()
  scheduleSample()
}, process.env.NODE_CLINIC_DOCTOR_TIMEOUT_DELAY)

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
