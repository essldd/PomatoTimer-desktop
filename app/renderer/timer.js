/**
 * Pomodoro state machine — no DOM, no timers, no Electron.
 *
 * The renderer drives it with a 250 ms tick and renders `store.state`; the
 * Node test drives the same code with a fake clock. Shared by both so the
 * verified behaviour is the shipped behaviour.
 */
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.PomodoroTimer = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  const MINUTE = 60000
  const DAY_SECONDS = 86400
  const FOCUS_DEFAULT = 25
  const BREAK_DEFAULT = 5
  const FOCUS_RANGE = [1, 180]
  const BREAK_RANGE = [1, 120]

  function clamp(value, min, max) {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return min
    return Math.min(max, Math.max(min, Math.round(n)))
  }

  function pad2(n) {
    return n < 10 ? `0${n}` : String(n)
  }

  function formatMs(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000))
    return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
  }

  function localDate(ms) {
    const d = typeof ms === 'number' ? new Date(ms) : new Date()
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }

  function createStore(options) {
    const config = options || {}
    const clock = typeof config.now === 'function' ? config.now : () => Date.now()
    const onPersist = typeof config.onPersist === 'function' ? config.onPersist : () => {}

    const state = {
      phase: 'focus',
      status: 'idle',
      remainingMs: FOCUS_DEFAULT * MINUTE,
      totalMs: FOCUS_DEFAULT * MINUTE,
      focusMinutes: FOCUS_DEFAULT,
      breakMinutes: BREAK_DEFAULT,
      todaySeconds: 0,
      focusAccumMs: 0,
      todayDate: localDate(clock()),
      rounds: 0,
      notice: '',
      noticeTone: 'info',
    }

    const subscribers = new Set()
    let endsAt = 0
    let lastPersistAt = 0

    function emit() {
      for (const fn of Array.from(subscribers)) {
        try {
          fn()
        } catch {
          /* one bad subscriber must not stop the rest */
        }
      }
    }

    function focusMs() {
      return state.focusMinutes * MINUTE
    }

    function breakMs() {
      return state.breakMinutes * MINUTE
    }

    /** Committed seconds plus the focus currently in progress. */
    function displayedTodaySeconds() {
      return Math.min(DAY_SECONDS, state.todaySeconds + Math.floor(state.focusAccumMs / 1000))
    }

    function commitFocusAccum() {
      if (state.focusAccumMs <= 0) {
        state.focusAccumMs = 0
        return
      }
      state.todaySeconds = Math.min(
        DAY_SECONDS,
        state.todaySeconds + Math.floor(state.focusAccumMs / 1000),
      )
      state.focusAccumMs = 0
    }

    function checkDay() {
      const today = localDate(clock())
      if (state.todayDate !== today) {
        state.todayDate = today
        state.todaySeconds = 0
        state.focusAccumMs = 0
        state.rounds = 0
      }
    }

    function payload() {
      return {
        focusMinutes: state.focusMinutes,
        breakMinutes: state.breakMinutes,
        todayDate: state.todayDate,
        todayFocusSeconds: displayedTodaySeconds(),
      }
    }

    function persist() {
      lastPersistAt = clock()
      try {
        onPersist(payload())
      } catch {
        /* persistence must never break the timer */
      }
    }

    function tick() {
      checkDay()
      if (state.status !== 'running') return
      const now = clock()
      const left = endsAt - now
      state.remainingMs = Math.max(0, left)
      if (state.phase === 'focus') {
        const elapsed = Math.max(0, state.totalMs - state.remainingMs)
        state.focusAccumMs = Math.max(state.focusAccumMs, elapsed)
        if (now - lastPersistAt > 10000) persist()
      }
      if (left <= 0) {
        completePhase()
        return
      }
      emit()
    }

    function completePhase() {
      if (state.phase === 'focus') {
        state.focusAccumMs = Math.min(
          state.totalMs,
          Math.max(state.focusAccumMs, state.totalMs - state.remainingMs),
        )
        commitFocusAccum()
        state.rounds += 1
        state.phase = 'break'
        state.status = 'running'
        state.totalMs = breakMs()
        state.remainingMs = state.totalMs
        endsAt = clock() + state.totalMs
        state.notice = 'focusEnd'
        state.noticeTone = 'focus-end'
      } else {
        state.phase = 'focus'
        state.status = 'idle'
        state.totalMs = focusMs()
        state.remainingMs = state.totalMs
        state.notice = 'breakEnd'
        state.noticeTone = 'break-end'
      }
      persist()
      emit()
    }

    function start() {
      checkDay()
      if (state.status === 'running') return
      if (state.status === 'idle') {
        state.totalMs = state.phase === 'break' ? breakMs() : focusMs()
        state.remainingMs = state.totalMs
      }
      state.status = 'running'
      state.notice = ''
      state.noticeTone = 'info'
      endsAt = clock() + state.remainingMs
      emit()
    }

    function pause() {
      if (state.status !== 'running') return
      state.remainingMs = Math.max(0, endsAt - clock())
      if (state.phase === 'focus') {
        const elapsed = Math.max(0, state.totalMs - state.remainingMs)
        state.focusAccumMs = Math.max(state.focusAccumMs, elapsed)
      }
      state.status = 'paused'
      state.notice = ''
      state.noticeTone = 'info'
      persist()
      emit()
    }

    function reset() {
      if (state.phase === 'focus') {
        if (state.status === 'running') {
          state.remainingMs = Math.max(0, endsAt - clock())
          state.focusAccumMs = Math.max(state.focusAccumMs, state.totalMs - state.remainingMs)
        }
        // Abandoning a focus still credits the time already spent on it.
        commitFocusAccum()
      }
      state.phase = 'focus'
      state.status = 'idle'
      state.totalMs = focusMs()
      state.remainingMs = state.totalMs
      state.notice = ''
      state.noticeTone = 'info'
      persist()
      emit()
    }

    function skipBreak() {
      if (state.phase !== 'break') return
      state.phase = 'focus'
      state.status = 'idle'
      state.totalMs = focusMs()
      state.remainingMs = state.totalMs
      state.notice = 'breakSkipped'
      state.noticeTone = 'info'
      emit()
    }

    function setFocusMinutes(value) {
      const hadIdleFocus = state.status === 'idle' && state.phase === 'focus'
      state.focusMinutes = clamp(value, FOCUS_RANGE[0], FOCUS_RANGE[1])
      if (hadIdleFocus) {
        state.totalMs = focusMs()
        state.remainingMs = state.totalMs
      }
      persist()
      emit()
    }

    function setBreakMinutes(value) {
      state.breakMinutes = clamp(value, BREAK_RANGE[0], BREAK_RANGE[1])
      persist()
      emit()
    }

    /** Apply the settings loaded from disk without clobbering a running timer. */
    function hydrate(values) {
      if (!values || typeof values !== 'object') return
      const idleFocus = state.status === 'idle' && state.phase === 'focus'
      if (Number.isFinite(Number(values.focusMinutes))) {
        state.focusMinutes = clamp(values.focusMinutes, FOCUS_RANGE[0], FOCUS_RANGE[1])
      }
      if (Number.isFinite(Number(values.breakMinutes))) {
        state.breakMinutes = clamp(values.breakMinutes, BREAK_RANGE[0], BREAK_RANGE[1])
      }
      if (values.todayDate === localDate(clock()) && Number.isFinite(Number(values.todayFocusSeconds))) {
        state.todaySeconds = Math.max(state.todaySeconds, clamp(values.todayFocusSeconds, 0, DAY_SECONDS))
      }
      if (idleFocus) {
        state.totalMs = focusMs()
        state.remainingMs = state.totalMs
      }
      emit()
    }

    return {
      state,
      subscribe(fn) {
        subscribers.add(fn)
        return () => subscribers.delete(fn)
      },
      tick,
      start,
      pause,
      reset,
      skipBreak,
      setFocusMinutes,
      setBreakMinutes,
      hydrate,
      persist,
      displayedTodaySeconds,
    }
  }

  return { createStore, formatMs, clamp, localDate, FOCUS_RANGE, BREAK_RANGE, DAY_SECONDS, MINUTE }
})
