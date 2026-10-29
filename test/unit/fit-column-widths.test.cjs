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
