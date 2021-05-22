const d3 = require('./d3.js')

class VersionInfo {
  constructor () {
    this.container = d3.select('#version-info')
    this.container.append('span')
      .classed('version-holder', true)
      .attr('id', 'node-version')

    this.container.append('span')
      .classed('version-holder', true)
      .attr('id', 'cmd-line-args')
  }

  draw () {
    d3.select('#node-version').append('span')
      .text('Node version: ' + this.nodeVersion)
    d3.select('#cmd-line-args').append('span')
      .text('Arguments: ' + this.cmdLineArgs)
  }

  setData (data) {
    this.nodeVersion = data.system.nodeVersion.version
    const args = data.args
    const cmdArray = Object.values(args)
    const cmdString = cmdArray.toString()
    const cmdStringNoComma = cmdString.replace(/,/g, ' ')
    this.cmdLineArgs = cmdStringNoComma
  }
}
module.exports = new VersionInfo()
