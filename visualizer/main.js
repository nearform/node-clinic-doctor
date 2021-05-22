'use strict'

const loaddata = require('./data.js')

const menu = require('./menu.js')
const alert = require('./alert.js')
const graph = require('./graph.js')
const recommendation = require('./recommendation.js')
const loadFonts = require('@nearform/clinic-common/behaviours/font-loader')
const versionInfo = require('./version-info.js')

// Called on font load or timeout
const drawUi = () => {
  document.body.classList.remove('is-loading-font')
  document.body.classList.add('is-font-loaded')

  menu.on('toggle-theme', function () {
    document.documentElement.classList.toggle('light-theme')
  })

  menu.on('toggle-grid', function () {
    document.documentElement.classList.toggle('grid-layout')
    graph.draw()
  })

  alert.on('open', () => alert.open())
  alert.on('close', () => alert.close())
  alert.on('click', function (graphId) {
    document.getElementById(graphId).scrollIntoView({
      block: 'start',
      inline: 'nearest',
      behavior: 'smooth'
    })
  })
  alert.on('hover-in', function (graphId) {
    document.getElementById(graphId).classList.add('highlight')
  })
  alert.on('hover-out', function (graphId) {
    document.getElementById(graphId).classList.remove('highlight')
  })

  graph.on('hover-show', () => graph.hoverShow())
  graph.on('hover-hide', () => graph.hoverHide())
  graph.on('hover-update', (unitX) => graph.hoverUpdate(unitX))

  graph.on('alert-click', function () {
    document.documentElement.classList.add('recommendation-open')
    recommendation.openPanel()
    recommendation.draw()
  })

  recommendation.on('open-panel', function () {
    document.documentElement.classList.add('recommendation-open')
    recommendation.openPanel()
    recommendation.draw()
  })
  recommendation.on('close-panel', function () {
    document.documentElement.classList.remove('recommendation-open')
    recommendation.closePanel()
    recommendation.draw()
  })

  recommendation.on('menu-click', function (category) {
    recommendation.setPage(category)
    recommendation.draw()
  })

  recommendation.on('open-read-more', function () {
    document.documentElement.classList.add('recommendation-read-more-open')
    recommendation.openReadMore()
    recommendation.draw()
    recommendation.setPage(recommendation.selectedCategory)
  })
  recommendation.on('close-read-more', function () {
    document.documentElement.classList.remove('recommendation-read-more-open')
    recommendation.closeReadMore()
    recommendation.draw()
  })

  recommendation.on('open-undetected', function () {
    recommendation.openUndetected()
    recommendation.draw()
  })
  recommendation.on('close-undetected', function () {
    recommendation.closeUndetected()
    recommendation.setPage(recommendation.defaultCategory)
    recommendation.draw()
  })

  loaddata(function maybeDone (err, data) {
    if (err) throw err

    alert.setData(data)
    alert.draw()

    graph.setData(data)
    graph.draw()

    recommendation.setData(data)
    recommendation.draw()

    versionInfo.setData(data)
    versionInfo.draw()

    window.addEventListener('resize', function () {
      alert.draw()
      graph.draw()
    })
  })
}

// Orchestrate font loading
loadFonts()

drawUi()
