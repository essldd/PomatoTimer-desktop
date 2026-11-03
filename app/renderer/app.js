;(function () {
  'use strict'

  const { createStore, formatMs } = window.PomodoroTimer
  const api = window.pomodoro

  const byId = (id) => document.getElementById(id)
  const panel = byId('panel')
  const mini = byId('mini')
  const ringBar = byId('ringBar')
  const RADIUS = Number(ringBar.getAttribute('r'))
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS

  const TOMATO_SVG =
    '<svg width="100%" height="100%" viewBox="0 0 64 64" aria-hidden="true">' +
    '<circle cx="32" cy="37" r="20" fill="#E2553F"/>' +
    '<path d="M32 16c-4.4-5-10.6-5.2-14-2.6 1.6 5.2 6 7.8 10.2 7.8 1.4 0 2.8-.3 3.8-1-1.4-.5-2.6-1.4-3.4-2.4 2.9 1.2 6 1 8.2-.4 2.4 2.2 6.6 2.4 10 .6-2.6 4-6.9 5-10.7 3.8" fill="#2E9E5B"/>' +
    '<path d="M32 21.5v-3.2" stroke="#2E9E5B" stroke-width="3" stroke-linecap="round" fill="none"/>' +
    '</svg>'

  const PHASE_TEXT = { focus: '专注', break: '休息' }
  const NOTICE_TEXT = {
    focusEnd: '专注结束，休息一下吧',
    breakEnd: '休息结束，继续专注吧',
    breakSkipped: '已跳过休息，准备好再开始下一轮',
  }

  const params = new URLSearchParams(location.search)
  let currentMode = params.get('mode') === 'mini' ? 'mini' : 'panel'
  let saveTimer = null

  const store = createStore({
    onPersist(data) {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveTimer = null
        api.saveSettings(data).catch(() => {})
      }, 300)
    },
  })

  function setTomatoSize(host, size) {
    host.style.width = `${size}px`
    host.style.height = `${size}px`
    host.innerHTML = TOMATO_SVG
  }

  function applyMode(next) {
    currentMode = next === 'mini' ? 'mini' : 'panel'
    panel.hidden = currentMode !== 'panel'
    mini.hidden = currentMode !== 'mini'
    document.body.dataset.mode = currentMode
    if (currentMode === 'panel') paint()
  }

  function paint() {
    const s = store.state
    const time = formatMs(s.remainingMs)
    const phaseText = PHASE_TEXT[s.phase] || '专注'
    const editable = s.status === 'idle'

    byId('time').textContent = time
    byId('miniTime').textContent = time
    byId('phaseText').textContent = phaseText

    const chip = byId('phaseChip')
    chip.textContent = s.status === 'paused' ? `${phaseText} · 已暂停` : phaseText
    chip.dataset.phase = s.phase
    chip.dataset.status = s.status

    byId('btnPrimary').textContent =
      s.status === 'running' ? '暂停' : s.status === 'paused' ? '继续' : '开始'
    byId('btnSkip').hidden = !(s.phase === 'break' && s.status !== 'idle')

    const focusInput = byId('focusInput')
    const breakInput = byId('breakInput')
    focusInput.disabled = !editable
    breakInput.disabled = !editable
    if (document.activeElement !== focusInput) focusInput.value = String(s.focusMinutes)
    if (document.activeElement !== breakInput) breakInput.value = String(s.breakMinutes)
    document.querySelectorAll('.step').forEach((button) => {
      button.disabled = !editable
    })
    byId('hint').textContent = editable ? '开始前可调整时长' : '倒计时进行中：先暂停或重置再修改'

    const ratio = s.totalMs > 0 ? Math.min(1, Math.max(0, s.remainingMs / s.totalMs)) : 0
    ringBar.style.strokeDasharray = `${CIRCUMFERENCE.toFixed(2)}`
    ringBar.style.strokeDashoffset = `${(CIRCUMFERENCE * (1 - ratio)).toFixed(2)}`

    const notice = byId('notice')
    const noticeText = s.notice ? NOTICE_TEXT[s.notice] || '' : ''
    notice.textContent = noticeText
    notice.dataset.tone = s.noticeTone
    notice.hidden = !noticeText

    const todayTotal = Math.min(
      86400,
      s.todaySeconds + Math.floor(s.focusAccumMs / 1000),
    )
    byId('todayValue').textContent = String(Math.floor(todayTotal / 60))
    byId('todaySec').textContent = todayTotal % 60 > 0 ? `+ ${todayTotal % 60}s` : ''
    byId('rounds').textContent = `已完成 ${s.rounds} 轮`

    document.body.dataset.phase = s.phase
    document.body.dataset.status = s.status
    mini.dataset.phase = s.phase
    mini.dataset.status = s.status
  }

  function wire() {
    setTomatoSize(byId('tomatoPanel'), 18)
    setTomatoSize(byId('tomatoMini'), 21)

    byId('btnMini').addEventListener('click', () => api.setMode('mini'))
    byId('btnQuit').addEventListener('click', () => api.quit())
    byId('btnRestore').addEventListener('click', () => api.setMode('panel'))
    byId('btnQuitMini').addEventListener('click', () => api.quit())

    byId('btnPrimary').addEventListener('click', () => {
      if (store.state.status === 'running') store.pause()
      else store.start()
    })
    byId('btnReset').addEventListener('click', () => store.reset())
    byId('btnSkip').addEventListener('click', () => store.skipBreak())

    byId('focusInput').addEventListener('change', (event) => {
      store.setFocusMinutes(event.target.value)
    })
    byId('breakInput').addEventListener('change', (event) => {
      store.setBreakMinutes(event.target.value)
    })

    document.querySelectorAll('.step').forEach((button) => {
      button.addEventListener('click', () => {
        if (store.state.status !== 'idle') return
        const delta = Number(button.dataset.delta)
        if (button.dataset.target === 'focus') {
          store.setFocusMinutes(store.state.focusMinutes + delta)
        } else {
          store.setBreakMinutes(store.state.breakMinutes + delta)
        }
      })
    })

    // The pill is a drag region, so restoring is offered on hover (and by
    // double-click where the platform still delivers it).
    mini.addEventListener('dblclick', () => api.setMode('panel'))

    window.addEventListener('keydown', (event) => {
      const tag = event.target && event.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (event.code === 'Space') {
        event.preventDefault()
        if (store.state.status === 'running') store.pause()
        else store.start()
      } else if (event.key === 'Escape') {
        api.setMode('mini')
      }
    })

    api.onMode((next) => applyMode(next))
  }

  wire()
  applyMode(currentMode)
  store.subscribe(paint)
  paint()
  setInterval(() => store.tick(), 250)

  api
    .loadSettings()
    .then((loaded) => {
      if (loaded) store.hydrate(loaded)
      paint()
    })
    .catch(() => {})
})()
