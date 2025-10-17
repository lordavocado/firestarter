#!/usr/bin/env node
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ts = require('typescript')

const postMessageLog = []

class FakeElement {
  constructor(tagName, documentRef) {
    this.tagName = tagName.toUpperCase()
    this._document = documentRef
    this.children = []
    this.style = {}
    this.listeners = {}
    this.parentNode = null
    this._innerHTML = ''
    this._textContent = ''
    this._id = undefined
    this.classList = {
      _owner: this,
      _set: new Set(),
      toggle(cls) {
        if (this._set.has(cls)) {
          this._set.delete(cls)
          return false
        }
        this._set.add(cls)
        return true
      },
      contains(cls) {
        return this._set.has(cls)
      },
      add(cls) {
        this._set.add(cls)
      },
      remove(cls) {
        this._set.delete(cls)
      },
    }

    if (this.tagName === 'IFRAME') {
      this.contentWindow = {
        postMessage(message, target) {
          postMessageLog.push({ message, target })
        },
      }
    }
  }

  appendChild(child) {
    child.parentNode = this
    this.children.push(child)
  }

  set id(value) {
    this._id = value
    if (value) {
      this._document._registerId(value, this)
    }
  }

  get id() {
    return this._id
  }

  set innerHTML(value) {
    this._innerHTML = value
  }

  get innerHTML() {
    return this._innerHTML
  }

  set textContent(value) {
    this._textContent = value
  }

  get textContent() {
    return this._textContent
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) {
      this.listeners[type] = []
    }
    this.listeners[type].push(handler)
  }

  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || []
    handlers.forEach((handler) => handler(event))
  }

  click() {
    this.dispatchEvent({ type: 'click' })
  }
}

class FakeDocument {
  constructor(scriptOptions = {}) {
    this._byId = new Map()
    this.head = new FakeElement('head', this)
    this.body = new FakeElement('body', this)
    this.currentScript = {
      src: scriptOptions.src || 'https://partner-site.dk/embed/lejechat?slug=test-slug&accent=%23123456&label=Tal%20med%20os',
      getAttribute: (attr) => {
        const dataset = scriptOptions.dataset || {}
        return dataset[attr]
      },
    }
  }

  createElement(tag) {
    return new FakeElement(tag, this)
  }

  getElementById(id) {
    return this._byId.get(id) || null
  }

  _registerId(id, element) {
    this._byId.set(id, element)
  }
}

function loadEmbedBuilder() {
  const embedPath = path.join(__dirname, '..', 'lib', 'embed-script.ts')
  const source = fs.readFileSync(embedPath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
    },
    fileName: 'embed-script.ts',
  })

  const sandboxModule = { exports: {} }
  const sandbox = {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require,
    __dirname: path.dirname(embedPath),
    __filename: embedPath,
  }

  vm.runInNewContext(transpiled.outputText, sandbox, { filename: 'embed-script.js' })
  const builder = sandbox.module.exports.buildEmbedScript
  if (typeof builder !== 'function') {
    throw new Error('Failed to load buildEmbedScript from embed-script.ts')
  }
  return builder
}

function runEmbedScriptVerification() {
  const buildEmbedScript = loadEmbedBuilder()
  const runScenario = (options = {}) => {
    const scriptString = buildEmbedScript({
      slug: options.slug || 'test-slug',
      accent: options.accent || '#123456',
      label: options.label || 'Tal med os',
      origin: options.origin || 'https://lejechat.dk',
      position: options.position,
    })

    const document = new FakeDocument({
      src: `https://partner-site.dk/embed/lejechat?slug=${options.slug || 'test-slug'}`,
      dataset: options.dataset,
    })
    const windowObj = {
      location: {
        origin: 'https://external-client.dk',
      },
    }

    const context = {
      document,
      window: windowObj,
      console,
      URLSearchParams,
      JSON,
      setTimeout,
      clearTimeout,
    }
    context.global = context
    context.globalThis = context

    vm.runInNewContext(scriptString, context, { filename: 'lejechat-embed-runtime.js' })

    return { document, windowObj, context, scriptString }
  }

  const { document, context, scriptString } = runScenario()

  const container = document.getElementById('lejechat-widget-container')
  assert(container, 'launcher container should exist')

  const iframe = document.getElementById('lejechat-widget-frame')
  assert(iframe, 'iframe should exist')
  assert.strictEqual(
    iframe.src,
    'https://lejechat.dk/chat/test-slug?embed=1',
    'iframe src should target Lejechat chat view'
  )

  const style = document.getElementById('lejechat-widget-styles')
  assert(style, 'style tag should be injected')
  assert(
    style.textContent.includes('#lejechat-widget-container'),
    'style tag should contain widget CSS rules'
  )

  const launcher = document.getElementById('lejechat-widget-launcher')
  assert(launcher, 'launcher button should exist')
  assert(
    launcher.innerHTML.includes('Tal med os'),
    'launcher label should match provided label'
  )

  launcher.click()
  assert(
    iframe.classList.contains('open'),
    'iframe should toggle open class on click'
  )
  assert.strictEqual(
    postMessageLog.length,
    1,
    'iframe should postMessage once when opened'
  )

  const widgetHandle = context.window.lejechatWidget
  assert(widgetHandle, 'window.lejechatWidget helper should be defined')
  assert.strictEqual(
    widgetHandle.slug,
    'test-slug',
    'global helper should expose slug'
  )
  assert.strictEqual(
    widgetHandle.position,
    'bottom-right',
    'default position should be bottom-right'
  )

  // Duplicate load guard – running script again should not add another launcher
  document.currentScript = {
    src: 'https://partner-site.dk/embed/lejechat?slug=test-slug',
    getAttribute: () => null,
  }
  vm.runInNewContext(scriptString, context, { filename: 'duplicate-runtime.js' })
  const launchers = document.body.children.filter((child) => child.id === 'lejechat-widget-container')
  assert.strictEqual(launchers.length, 1, 'duplicate embed should be ignored')

  // Bottom-left position scenario
  const leftScenario = runScenario({ position: 'bottom-left' })
  const leftContainer = leftScenario.document.getElementById('lejechat-widget-container')
  assert(leftContainer, 'left-position container should exist')
  assert.strictEqual(
    leftContainer.style.left,
    '20px',
    'left positioned widget should set left offset'
  )
  assert.strictEqual(
    leftScenario.context.window.lejechatWidget.position,
    'bottom-left',
    'helper should reflect left position'
  )

  console.info('✅ Embed widget verification passed: DOM elements mounted, launcher toggles, duplicate guard works, and positioning is configurable.')
}

runEmbedScriptVerification()
