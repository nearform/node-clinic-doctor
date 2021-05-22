function loaddata (callback) {
  setTimeout(function () {
    const dataElement = document.querySelector('#clinic-data')
    const data = JSON.parse(dataElement.textContent)

    callback(null, wrapData(data))
  })
}
module.exports = loaddata

function wrapData () {
  return new Data(data.analysis, data.processStat, data.systemInfo, data.args)
}

// Construct data container
class Data {
  constructor (analysis, data, system, args) {
    this.analysis = analysis
    this.data = data
    this.system = system[0]
    this.args = args
    this.rawTimestamp = data.map((point) => point.timestamp)

    this.cpu = data.map((point) => ({
      x: new Date(point.timestamp),
      y: [point.cpu * 100]
    }))

    this.delay = data.map((point) => ({
      x: new Date(point.timestamp),
      y: [point.delay]
    }))

    const MB = Math.pow(1024, 2)
    this.memory = data.map((point) => ({
      x: new Date(point.timestamp),
      y: [
        point.memory.rss / MB,
        point.memory.heapTotal / MB,
        point.memory.heapUsed / MB
      ]
    }))

    this.handles = data.map((point) => ({
      x: new Date(point.timestamp),
      y: [point.handles]
    }))
  }

  getPoints (time) {
    const index = closestIndexByBinarySearch(
      this.rawTimestamp, time.getTime()
    )

    return {
      cpu: this.cpu[index],
      delay: this.delay[index],
      memory: this.memory[index],
      handles: this.handles[index],
      system: this.system,
      args: this.args
    }
  }
}

function closestIndexByBinarySearch (array, searchValue) {
  let startIndex = 0
  let endIndex = array.length - 1
  let middleIndex = Math.floor((startIndex + endIndex) / 2)

  // continue until there are no elements between start and end
  while (endIndex - startIndex > 1) {
    if (searchValue <= array[middleIndex]) {
      endIndex = middleIndex
    } else {
      startIndex = middleIndex
    }

    middleIndex = Math.floor((startIndex + endIndex) / 2)
  }

  // startIndex and endIndex are now the two options, return
  // the one that is closest.
  if (array[endIndex] - searchValue <= searchValue - array[startIndex]) {
    return endIndex
  } else {
    return startIndex
  }
}
