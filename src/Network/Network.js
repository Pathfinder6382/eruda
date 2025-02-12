import Tool from '../DevTools/Tool'
import XhrRequest from './XhrRequest'
import FetchRequest from './FetchRequest'
import Settings from '../Settings/Settings'
import {
  evalCss,
  isNative,
  defaults,
  now,
  extend,
  isEmpty,
  $,
  ms
} from '../lib/util'

export default class Network extends Tool {
  constructor() {
    super()

    this._style = evalCss(require('./Network.scss'))

    this.name = 'network'
    this._requests = {}
    this._tpl = require('./Network.hbs')
    this._isFetchSupported = false
    if (window.fetch) this._isFetchSupported = isNative(window.fetch)
  }
  init($el, container) {
    super.init($el)

    this._container = container
    this._bindEvent()
    this._initCfg()
    this.overrideXhr()
  }
  show() {
    super.show()

    this._render()
  }
  clear() {
    this._requests = {}
    this._render()
  }
  overrideXhr() {
    const winXhrProto = window.XMLHttpRequest.prototype

    const origSend = (this._origSend = winXhrProto.send)
    const origOpen = (this._origOpen = winXhrProto.open)
    const origSetRequestHeader = (this._origSetRequestHeader =
      winXhrProto.setRequestHeader)

    const self = this

    winXhrProto.open = function(method, url) {
      const xhr = this

      const req = (xhr.erudaRequest = new XhrRequest(xhr, method, url))

      req.on('send', (id, data) => self._addReq(id, data))
      req.on('update', (id, data) => self._updateReq(id, data))

      xhr.addEventListener('readystatechange', function() {
        switch (xhr.readyState) {
          case 2:
            return req.handleHeadersReceived()
          case 4:
            return req.handleDone()
        }
      })

      origOpen.apply(this, arguments)
    }

    winXhrProto.send = function(data) {
      const req = this.erudaRequest
      if (req) req.handleSend(data)

      origSend.apply(this, arguments)
    }

    winXhrProto.setRequestHeader = function() {
      const req = this.erudaRequest
      if (!req._headers) {
        req._headers = {}
      }
      const key = arguments[0]
      const val = arguments[1]
      if (key && val) {
        req._headers[key] = val
      }

      origSetRequestHeader.apply(this, arguments)
    }
  }
  restoreXhr() {
    const winXhrProto = window.XMLHttpRequest.prototype

    if (this._origOpen) winXhrProto.open = this._origOpen
    if (this._origSend) winXhrProto.send = this._origSend
    if (this._origSetRequestHeader) {
      winXhrProto.setRequestHeader = this._origSetRequestHeader
    }
  }
  overrideFetch() {
    if (!this._isFetchSupported) return

    const origFetch = (this._origFetch = window.fetch)

    const self = this

    window.fetch = function(...args) {
      const req = new FetchRequest(...args)
      req.on('send', (id, data) => self._addReq(id, data))
      req.on('update', (id, data) => self._updateReq(id, data))

      const fetchResult = origFetch(...args)
      req.send(fetchResult)

      return fetchResult
    }
  }
  restoreFetch() {
    if (!this._isFetchSupported) return

    if (this._origFetch) window.fetch = this._origFetch
  }
  _addReq(id, data) {
    defaults(data, {
      name: '',
      url: '',
      status: 'pending',
      type: 'unknown',
      subType: 'unknown',
      size: 0,
      data: '',
      method: 'GET',
      startTime: now(),
      time: 0,
      resHeaders: {},
      reqHeaders: {},
      resTxt: '',
      done: false
    })

    this._requests[id] = data

    this._render()
  }
  _updateReq(id, data) {
    const target = this._requests[id]

    if (!target) return

    extend(target, data)

    target.time = target.time - target.startTime
    target.displayTime = ms(target.time)

    if (target.done && (target.status < 200 || target >= 300))
      target.hasErr = true

    this._render()
  }
  _bindEvent() {
    const $el = this._$el
    const container = this._container

    const self = this

    $el
      .on('click', '.eruda-request', function() {
        const id = $(this).data('id'),
          data = self._requests[id]

        if (!data.done) return

        showSources('http', {
          url: data.url,
          data: data.data,
          resTxt: data.resTxt,
          type: data.type,
          subType: data.subType,
          resHeaders: data.resHeaders,
          reqHeaders: data.reqHeaders
        })
      })
      .on('click', '.eruda-clear-request', () => this.clear())

    function showSources(type, data) {
      const sources = container.get('sources')
      if (!sources) return

      sources.set(type, data)

      container.showTool('sources')
    }
  }
  destroy() {
    super.destroy()

    evalCss.remove(this._style)
    this.restoreXhr()
    this.restoreFetch()
    this._rmCfg()
  }
  _rmCfg() {
    const cfg = this.config

    const settings = this._container.get('settings')

    if (!settings) return

    settings.remove(cfg, 'overrideFetch').remove('Network')
  }
  _initCfg() {
    const cfg = (this.config = Settings.createCfg('network', {
      overrideFetch: true
    }))

    if (cfg.get('overrideFetch')) this.overrideFetch()

    cfg.on('change', (key, val) => {
      switch (key) {
        case 'overrideFetch':
          return val ? this.overrideFetch() : this.restoreFetch()
      }
    })

    const settings = this._container.get('settings')
    settings
      .text('Network')
      .switch(cfg, 'overrideFetch', 'Catch Fetch Requests')
      .separator()
  }
  _render() {
    if (!this.active) return

    const renderData = {}

    if (!isEmpty(this._requests)) renderData.requests = this._requests

    this._renderHtml(this._tpl(renderData))
  }
  _renderHtml(html) {
    if (html === this._lastHtml) return
    this._lastHtml = html
    this._$el.html(html)
  }
}
