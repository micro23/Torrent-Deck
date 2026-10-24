/* eslint-disable @typescript-eslint/no-require-imports -- Verify modal event ownership independently of OS focus timing. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

test('modal captures Escape before a dropdown and dismisses only one level at a time', () => {
  const node = {}
  const element = { 0: node, addClass() {}, append() {}, remove() {} }
  let listener, destroy, removed = false, childOpen = true, parentOpen = true, closes = 0
  const document = {
    addEventListener(name, callback, capture) {
      assert.equal(name, 'keydown')
      assert.equal(capture, true, 'must run before the focused dropdown consumes the event')
      listener = callback
    },
    removeEventListener(name, callback, capture) {
      removed = name === 'keydown' && callback === listener && capture === true
    },
  }
  const modal = {
    modal(command) {
      if (command === 'is active') return parentOpen
      if (command === 'hide') { parentOpen = false; closes++ }
      return this
    },
    find() { return { length: childOpen ? 1 : 0, dropdown() { childOpen = false } } },
    remove() {},
  }
  const $ = value => {
    if (value === element) return modal
    if (value === '.ui.modal.active') return { last: () => [node] }
    throw Error(`Unexpected selector: ${String(value)}`)
  }
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync('src/renderer/app/directives/modal/modal.directive.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(source, { exports, document, $, require: () => ({ ModalController: class {} }) })
  new exports.ModalDirective().link({ $on(_name, callback) { destroy = callback } }, element, {},
    { attachModal() {} }, callback => callback([], {}))

  const escape = () => {
    const event = { key: 'Escape', defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true }, stopPropagation() { this.stopped = true } }
    listener(event)
    assert.equal(event.defaultPrevented, true)
    assert.equal(event.stopped, true)
  }
  escape()
  assert.equal(childOpen, false)
  assert.equal(parentOpen, true)
  assert.equal(closes, 0)
  escape()
  assert.equal(parentOpen, false)
  assert.equal(closes, 1)
  destroy()
  assert.equal(removed, true)
})
