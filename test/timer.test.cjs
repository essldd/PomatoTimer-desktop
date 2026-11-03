'use strict'

/**
 * Headless checks for the timer state machine. The renderer drives the same
 * module, so these assertions describe the shipped behaviour.
 *
 *   node test/timer.test.cjs
 */
const assert = require('node:assert/strict')
const { createStore, localDate } = require('../app/renderer/timer.js')

let now = new Date(2026, 10, 3, 10, 0, 0).getTime() // local 2026-11-03 10:00
const persisted = []
const store = createStore({ now: () => now, onPersist: (data) => persisted.push(data) })

assert.equal(store.state.focusMinutes, 25, 'default focus is 25 minutes')
assert.equal(store.state.breakMinutes, 5, 'default break is 5 minutes')
assert.equal(store.state.status, 'idle')
assert.equal(store.displayedTodaySeconds(), 0)

store.setFocusMinutes(1)
assert.equal(store.state.focusMinutes, 1)
assert.equal(store.state.remainingMs, 60000)

store.start()
assert.equal(store.state.status, 'running')

// 30 s in: the total already reflects the running focus.
now += 30000
store.tick()
assert.equal(store.state.todaySeconds, 0)
assert.equal(store.displayedTodaySeconds(), 30, 'in-progress focus counts live')

// 61 s in: the focus completed and the break started automatically.
now += 31000
store.tick()
assert.equal(store.state.phase, 'break')
assert.equal(store.state.status, 'running')
assert.equal(store.state.todaySeconds, 60)
assert.equal(store.displayedTodaySeconds(), 60)
assert.equal(store.state.rounds, 1)
assert.equal(store.state.notice, 'focusEnd')

store.skipBreak()
assert.equal(store.state.phase, 'focus')
assert.equal(store.state.status, 'idle')
assert.equal(store.state.notice, 'breakSkipped')

// A paused focus keeps its partial credit and resumes from where it stopped.
store.start()
now += 20000
store.tick()
store.pause()
assert.equal(store.state.status, 'paused')
assert.equal(store.displayedTodaySeconds(), 80)
assert.equal(store.state.rounds, 1)

// Reset credits the elapsed time but does not add a round.
now += 5000
store.start()
now += 5000
store.tick()
store.reset()
assert.equal(store.state.status, 'idle')
assert.equal(store.state.phase, 'focus')
assert.equal(store.displayedTodaySeconds(), 85)
assert.equal(store.state.rounds, 1)

// Persistence carries the live total.
const last = persisted[persisted.length - 1]
assert.ok(last && last.todayFocusSeconds >= 80, `persisted total: ${JSON.stringify(last)}`)

// Duration clamping.
store.setFocusMinutes(999)
assert.equal(store.state.focusMinutes, 180)
store.setFocusMinutes(0)
assert.equal(store.state.focusMinutes, 1)
store.setBreakMinutes(-5)
assert.equal(store.state.breakMinutes, 1)

// Hydration restores a saved day and keeps the timer idle at the saved length.
const loaded = createStore({ now: () => now })
loaded.hydrate({
  focusMinutes: 40,
  breakMinutes: 10,
  todayDate: localDate(now),
  todayFocusSeconds: 120,
})
assert.equal(loaded.state.focusMinutes, 40)
assert.equal(loaded.state.breakMinutes, 10)
assert.equal(loaded.state.remainingMs, 40 * 60000)
assert.equal(loaded.state.todaySeconds, 120)

// A stale day is not carried over.
const stale = createStore({ now: () => now })
stale.hydrate({ focusMinutes: 25, breakMinutes: 5, todayDate: '2000-01-01', todayFocusSeconds: 600 })
assert.equal(stale.state.todaySeconds, 0)

console.log('timer.test.cjs: all assertions passed')
console.log('persist samples:', persisted.map((p) => p.todayFocusSeconds).join(' -> '))
