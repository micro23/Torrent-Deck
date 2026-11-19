/* eslint-disable @typescript-eslint/no-require-imports -- Verify column allocation without Electron. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const exportsObject = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/renderer/app/lib/fit-column-widths.ts','utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject, Set })
const fit = exportsObject.fitColumnWidths
const resize = exportsObject.resizeFittedColumn

test('a tiny saved State preference keeps a readable width without enlarging the table', () => {
  for (const available of [600, 1200, 2400]) {
    const widths = fit([9000, 1, 90, 90], available, [32, 108, 32, 32])
    assert.ok(widths[1] >= 108)
    assert.ok(Math.abs(widths.reduce((a,b) => a+b,0) - available) < 1e-6)
    assert.ok(widths.every(width => width >= 32))
  }
})
test('impossible floors still fit the available pane and handle empty or invalid preferences', () => {
  for (const available of [0, 50, 120]) {
    const widths = fit([NaN, -1, 0], available, [32, 108, 32])
    assert.ok(widths.every(width => Number.isFinite(width) && width >= 0))
    assert.ok(Math.abs(widths.reduce((a,b) => a+b,0)-available) < 1e-6)
  }
  assert.equal(fit([], 800).length, 0)
})

test('dragging the divider can grow Name even when the State column is already at its floor', () => {
  const floors = [110, 108, 58, 70]
  const resized = resize([140, 108, 80, 110], floors, [false, false, false, false], 0, 40)
  assert.deepEqual(Array.from(resized), [180, 108, 58, 92])
  assert.deepEqual(Array.from(fit(resized, 438, floors)), [180, 108, 58, 92], 'refreshes must preserve the dragged divider')
})

test('shrinking keeps readable minimums, honors fixed controls, and reuses the entire table width', () => {
  const widths = [30, 220, 108, 72]
  const floors = [30, 110, 108, 52]
  const fixed = [true, false, false, false]
  const resized = resize(widths, floors, fixed, 1, -500)
  assert.equal(resized[0], 30)
  assert.equal(resized[1], 110)
  assert.ok(resized[2] > widths[2] && resized[3] > widths[3])
  assert.ok(Math.abs(resized.reduce((a, b) => a + b, 0) - 430) < 1e-6)
  assert.deepEqual(Array.from(resize(widths, floors, fixed, 0, 30)), widths)
  assert.equal(resize(widths, floors, fixed, 3, -100)[3], 52)
})
