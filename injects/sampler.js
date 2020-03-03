'use strict'

const fs = require('fs')
const makeDir = require('mkdirp')
const systemInfo = require('../collect/system-info.js')
const ProcessStat = require('../collect/process-stat.js')
const getLoggingPaths = require('@nearform/clinic-common').getLoggingPaths('doctor')
const ProcessStatEncoder = require('../format/process-stat-encoder.js')

// create encoding files and directory
const paths = getLoggingPaths({ path: process.env.NODE_CLINIC_DOCTOR_DATA_PATH, identifier: process.pid })

makeDir.sync(paths['/'])

// write system file
fs.writeFileSync(paths['/systeminfo'], JSON.stringify(systemInfo(), null, 2))

const processStatEncoder = new ProcessStatEncoder()
const out = processStatEncoder.pipe(fs.createWriteStream(paths['/processstat']))

// sample every 10ms
const processStat = new ProcessStat(parseInt(
  process.env.NODE_CLINIC_DOCTOR_SAMPLE_INTERVAL, 10
))

function checkForTranspiledCode (filename) {
  const readFile = fs.readFileSync(filename, 'utf8')
  const regex = /function\s+(?<functionName>\w+)/g
  let matchedObj; let longerThanLimit = false

  while ((matchedObj = regex.exec(readFile)) !== null) {
    // Avoid infinite loops with zero-width matches
    if (matchedObj.index === regex.lastIndex) {
      regex.lastIndex++
    }
    // Loop through results and check length of fn name
    matchedObj.forEach((match, groupIndex) => {
      if (groupIndex !== 0 && match.length > 3) {
        longerThanLimit = true
      }
    })
  }
  return longerThanLimit
}

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

// start sampler on next tick, to avoid measuring the startup time
process.nextTick(function () {
  if (!checkForTranspiledCode(process.mainModule.filename)) {
    // Show warning to user
    console.log('WRITESYNC', 'FIRE CALL')
    fs.writeSync(3, 'source_warning', null, 'utf8')
    // process.emit('beforeExit')
  }
  processStat.refresh()
  scheduleSample()
})

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
