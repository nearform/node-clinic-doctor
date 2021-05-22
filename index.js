'use strict'

const events = require('events')
const fs = require('fs')
const os = require('os')
const path = require('path')
const pump = require('pump')
const pumpify = require('pumpify')
const stream = require('./lib/destroyable-stream')
const { spawn } = require('child_process')
const Analysis = require('./analysis/index.js')
const Stringify = require('streaming-json-stringify')
const streamTemplate = require('stream-template')
const joinTrace = require('@nearform/node-trace-log-join')
const getLoggingPaths = require('@nearform/clinic-common').getLoggingPaths('doctor')
const SystemInfoDecoder = require('./format/system-info-decoder.js')
const TraceEventDecoder = require('./format/trace-event-decoder.js')
const ProcessStatDecoder = require('./format/process-stat-decoder.js')
const RenderRecommendations = require('./recommendations/index.js')
const minifyStream = require('minify-stream')
const v8 = require('v8')
const HEAP_MAX = v8.getHeapStatistics().heap_size_limit
const buildJs = require('@nearform/clinic-common/scripts/build-js')
const buildCss = require('@nearform/clinic-common/scripts/build-css')
const mainTemplate = require('@nearform/clinic-common/templates/main')

class ClinicDoctor extends events.EventEmitter {
  constructor (settings = {}) {
    super()

    // define default parameters
    const {
      collectDelay = 0,
      sampleInterval = 10,
      detectPort = false,
      debug = false,
      dest = null
    } = settings

    this.collectDelay = collectDelay
    this.sampleInterval = sampleInterval
    this.detectPort = detectPort
    this.debug = debug
    this.path = dest
  }

  collect (args, callback) {
    this.args = args
    // run program, but inject the sampler
    const logArgs = [
      '-r', 'no-cluster.js',
      '-r', 'sampler.js',
      '--trace-events-enabled', '--trace-event-categories', 'v8'
    ]

    const stdio = ['inherit', 'inherit', 'inherit']

    if (this.detectPort) {
      logArgs.push('-r', 'detect-port.js')
      stdio.push('pipe')
    }

    let NODE_PATH = path.join(__dirname, 'injects')
    // use NODE_PATH to work around issues with spaces in inject path
    if (process.env.NODE_PATH) {
      NODE_PATH += `${path.delimiter}${process.env.NODE_PATH}`
    }

    const customEnv = {
      // use NODE_PATH to work around issues with spaces in inject path
      NODE_PATH,
      NODE_OPTIONS: logArgs.join(' ') + (
        process.env.NODE_OPTIONS ? ' ' + process.env.NODE_OPTIONS : ''
      ),
      NODE_CLINIC_DOCTOR_SAMPLE_INTERVAL: this.sampleInterval,
      NODE_CLINIC_DOCTOR_TIMEOUT_DELAY: this.collectDelay
    }

    if (this.path) {
      customEnv.NODE_CLINIC_DOCTOR_DATA_PATH = this.path
    }

    const proc = spawn(args[0], args.slice(1), {
      stdio,
      env: Object.assign({}, process.env, customEnv)
    })

    if (this.detectPort) {
      proc.stdio[3].once('data', (data) => {
        this.emit('port', Number(data), proc, () => {
          proc.stdio[3].destroy()
        })
      })
    }

    // get logging directory structure
    const options = { identifier: proc.pid, path: this.path }
    const paths = getLoggingPaths(options)
    // relay SIGINT to process
    process.once('SIGINT', /* istanbul ignore next: SIGINT is only emitted at Ctrl+C on windows */ () => {
      // we cannot kill(SIGINT) on windows but it seems
      // to relay the ctrl-c signal per default, so only do this
      // if not windows
      /* istanbul ignore next: platform specific */
      if (os.platform() !== 'win32') proc.kill('SIGINT')
    })

    process.once('beforeExit', function () {
      if (!fs.existsSync(paths['/processstat']) || fs.statSync(paths['/processstat']).size === 0) {
        console.log('Profile data collected seems to be empty, report may not be generated')
      }
    })

    proc.once('exit', (code, signal) => {
      // Windows exit code STATUS_CONTROL_C_EXIT 0xC000013A returns 3221225786
      // if not caught. See https://msdn.microsoft.com/en-us/library/cc704588.aspx
      /* istanbul ignore next */
      if (code === 3221225786 && os.platform() === 'win32') signal = 'SIGINT'

      // report if the process did not exit normally.
      if (code !== 0 && signal !== 'SIGINT') {
        /* istanbul ignore next */
        if (code !== null) {
          console.error(`process exited with exit code ${code}`)
        } else {
          /* istanbul ignore next */
          return callback(
            new Error(`process exited by signal ${signal}`),
            paths['/']
          )
        }
      }

      this.emit('analysing')

      // move trace_event file to logging directory
      joinTrace(
        'node_trace.*.log', paths['/traceevent'],
        function (err) {
          /* istanbul ignore if: the node_trace file should always exists */
          if (err) return callback(err, paths['/'])
          callback(null, paths['/'])
        }
      )
    })
  }

  visualize (dataDirname, outputFilename, callback) {
    const stylePath = path.join(__dirname, 'visualizer', 'style.css')
    const scriptPath = path.join(__dirname, 'visualizer', 'main.js')
    const logoPath = path.join(__dirname, 'visualizer', 'app-logo.svg')
    const clinicFaviconPath = path.join(__dirname, 'visualizer', 'clinic-favicon.png.b64')

    // Load data
    const paths = getLoggingPaths({ path: dataDirname })

    const systemInfoReader = pumpify.obj(
      fs.createReadStream(paths['/systeminfo']),
      new SystemInfoDecoder()
    )
    const traceEventReader = pumpify.obj(
      fs.createReadStream(paths['/traceevent']),
      new TraceEventDecoder(systemInfoReader)
    )
    const processStatReader = pumpify.obj(
      fs.createReadStream(paths['/processstat']),
      new ProcessStatDecoder()
    )

    // create analysis
    const analysisStringified = pumpify(
      new Analysis(systemInfoReader, traceEventReader, processStatReader),
      new stream.Transform({
        readableObjectMode: false,
        writableObjectMode: true,
        transform (data, encoding, callback) {
          callback(null, JSON.stringify(data))
        }
      })
    )

    const traceEventStringify = pumpify(
      traceEventReader,
      new Stringify({
        seperator: ',\n',
        stringifier: JSON.stringify
      })
    )

    const processStatStringify = pumpify(
      processStatReader,
      new Stringify({
        seperator: ',\n',
        stringifier: JSON.stringify
      })
    )

    const systemInfoStringify = pumpify(
      systemInfoReader,
      new Stringify({
        seperator: ',\n',
        stringifier: JSON.stringify
      })
    )

    const hasFreeMemory = () => {
      const used = process.memoryUsage().heapTotal / HEAP_MAX
      if (used > 0.5) {
        traceEventReader.destroy()
        processStatReader.destroy()
        this.emit('truncate')
        this.emit('warning', 'Truncating input data due to memory constraints')
      }
    }

    const checkHeapInterval = setInterval(hasFreeMemory, 50)

    const argsString = JSON.stringify(this.args)

    const dataFile = streamTemplate`
      {
        "traceEvent": ${traceEventStringify},
        "processStat": ${processStatStringify},
        "analysis": ${analysisStringified},
        "systemInfo": ${systemInfoStringify},
        "args": ${argsString}
      }
    `

    // render recommendations as HTML templates
    const recommendations = new RenderRecommendations()

    // open logo
    const logoFile = fs.createReadStream(logoPath)
    const clinicFaviconBase64 = fs.createReadStream(clinicFaviconPath)

    const doctorVersion = require('./package.json').version

    // build JS
    let scriptFile = buildJs({
      basedir: __dirname,
      debug: this.debug,
      scriptPath
    })

    if (!this.debug) {
      scriptFile = scriptFile.pipe(minifyStream({ sourceMap: false, mangle: false }))
    }

    // build CSS
    const styleFile = buildCss({
      stylePath,
      debug: this.debug
    })

    // Create body contents with recommendations
    const body = streamTemplate`
      <div class="ncd-font-spinner-container"></div>
      <div id="front-matter">
        <div id="alert"></div>
        <div id="menu"></div>
      </div>
      <div id="graph"></div>
      <div id="version-info"></div>
      <div id="recommendation-space"></div>
      <div id="recommendation"></div>
      ${recommendations}
    `

    // build output file
    const outputFile = mainTemplate({
      htmlClass: 'grid-layout',
      favicon: clinicFaviconBase64,
      title: 'Clinic Doctor',
      styles: styleFile,
      data: dataFile,
      script: scriptFile,
      headerLogoUrl: 'https://clinicjs.org/doctor/',
      headerLogoTitle: 'Clinic Doctor on Clinicjs.org',
      headerLogo: logoFile,
      headerText: 'Doctor',
      toolVersion: doctorVersion,
      uploadId: outputFilename.split('/').pop().split('.html').shift(),
      body
    })

    pump(
      outputFile,
      fs.createWriteStream(outputFilename),
      function (err) {
        clearInterval(checkHeapInterval)
        callback(err)
      }
    )
  }
}

module.exports = ClinicDoctor
