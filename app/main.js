'use strict'

/**
 * Pomodoro desktop shell (Windows).
 *
 * One frameless, transparent BrowserWindow serves both faces:
 *   - `panel`: the movable timer panel (dragged by its header).
 *   - `mini` : a small always-on-top pill showing only the tomato icon and
 *              the countdown, also movable by dragging.
 *
 * Everything the app persists lives under `<project>/data`:
 *   data/settings.json   timer settings, today's total, last window box/mode
 *   data/electron/       Chromium profile (kept out of %APPDATA%)
 */
const { app, BrowserWindow, ipcMain, screen } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const ROOT = __dirname

/**
 * Where settings.json and the Chromium profile live.
 *
 * - portable build: next to the portable .exe (PORTABLE_EXECUTABLE_DIR), so the
 *   whole thing stays self-contained; if that folder is read-only we fall back
 *   to the normal per-user folder.
 * - other packaged builds: %APPDATA%\PomatoTimer.
 * - running from source: <project>/data.
 */
const IS_PACKAGED = app.isPackaged
const PORTABLE_DIR = process.env.PORTABLE_EXECUTABLE_DIR || ''

function resolveDataDir() {
  if (PORTABLE_DIR) {
    const candidate = path.join(PORTABLE_DIR, 'data')
    try {
      fs.mkdirSync(candidate, { recursive: true })
      return candidate
    } catch {
      /* read-only location: use the per-user folder instead */
    }
  }
  if (IS_PACKAGED) return app.getPath('userData')
  return path.join(ROOT, '..', 'data')
}

const DATA_DIR = resolveDataDir()
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

const SIZES = {
  panel: { width: 352, height: 566 },
  mini: { width: 188, height: 58 },
}
const TITLE = '番茄钟 Pomodoro'
const START_MINI = process.argv.includes('--mini')

// Keep Chromium's own profile with the settings instead of a second folder.
if (!IS_PACKAGED || PORTABLE_DIR) {
  app.setPath('userData', path.join(DATA_DIR, 'electron'))
}

let win = null
let mode = START_MINI ? 'mini' : 'panel'
let moveTimer = null

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readSettingsFile() {
  try {
    // Editors on Windows (and PowerShell) may prepend a UTF-8 BOM; JSON.parse
    // rejects it, which would silently reset every saved preference.
    const text = fs.readFileSync(SETTINGS_FILE, 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeSettingsFile(next) {
  ensureDataDir()
  const text = `${JSON.stringify(next, null, 2)}\n`
  const tmp = `${SETTINGS_FILE}.tmp`
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, SETTINGS_FILE)
  return next
}

/** Merge timer fields sent by the renderer while keeping the window record. */
function saveTimerSettings(patch) {
  const current = readSettingsFile()
  const next = { ...current }
  for (const key of ['focusMinutes', 'breakMinutes', 'todayDate', 'todayFocusSeconds']) {
    if (patch && patch[key] !== undefined) next[key] = patch[key]
  }
  return writeSettingsFile(next)
}

function saveWindowBox() {
  if (!win || win.isDestroyed()) return
  const bounds = win.getBounds()
  const current = readSettingsFile()
  writeSettingsFile({
    ...current,
    window: { x: bounds.x, y: bounds.y, mode },
  })
}

function scheduleWindowSave() {
  if (moveTimer) clearTimeout(moveTimer)
  moveTimer = setTimeout(() => {
    moveTimer = null
    saveWindowBox()
  }, 400)
}

/** Keep a window fully inside the work area of the display it belongs to. */
function clampToWorkArea(x, y, size) {
  const hasPosition = Number.isFinite(x) && Number.isFinite(y)
  const display = hasPosition
    ? screen.getDisplayMatching({ x, y, width: size.width, height: size.height })
    : screen.getPrimaryDisplay()
  const area = display.workArea
  if (!hasPosition) {
    return {
      x: Math.round(area.x + area.width - size.width - 24),
      y: Math.round(area.y + 24),
    }
  }
  return {
    x: Math.min(Math.max(Math.round(x), area.x), area.x + area.width - size.width),
    y: Math.min(Math.max(Math.round(y), area.y), area.y + area.height - size.height),
  }
}

/** Resize the single window between the two faces, keeping it on screen. */
function applyMode(next, options = {}) {
  const target = next === 'mini' ? 'mini' : 'panel'
  mode = target
  if (!win || win.isDestroyed()) return mode

  const size = SIZES[target]
  const bounds = win.getBounds()
  const position = clampToWorkArea(bounds.x, bounds.y, size)

  // A non-resizable window still accepts programmatic bounds on Windows, but
  // toggling the flag removes any chance of the platform clamping the size.
  win.setResizable(true)
  win.setBounds({ x: position.x, y: position.y, width: size.width, height: size.height })
  win.setResizable(false)
  win.setAlwaysOnTop(target === 'mini', 'screen-saver')
  win.setSkipTaskbar(target === 'mini')
  if (!options.silent) win.webContents.send('pomodoro:mode', target)
  scheduleWindowSave()
  return mode
}

function createWindow() {
  const saved = readSettingsFile()
  const savedWindow = saved.window && typeof saved.window === 'object' ? saved.window : {}
  mode = START_MINI || savedWindow.mode === 'mini' ? 'mini' : 'panel'
  const size = SIZES[mode]
  const position = clampToWorkArea(savedWindow.x, savedWindow.y, size)

  win = new BrowserWindow({
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: mode === 'mini',
    // A DWM shadow is drawn as a rectangle around the transparent window and
    // shows up as grey wedges beside the CSS rounded corners; the same goes for
    // Windows 11's own corner rounding. Both are off so the CSS radius owns the
    // silhouette and everything outside it stays fully transparent.
    hasShadow: false,
    roundedCorners: false,
    // Taskbar/Alt-Tab icon: without this Windows falls back to the icon of the
    // Electron binary we ship with (the host app's logo).
    icon: path.join(ROOT, 'assets', 'tomato.ico'),
    show: false,
    title: TITLE,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })

  win.setAlwaysOnTop(mode === 'mini', 'screen-saver')
  win.loadFile(path.join(ROOT, 'renderer', 'index.html'), { query: { mode } })

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('pomodoro:mode', mode)
    win.show()
  })

  win.on('move', scheduleWindowSave)
  win.on('closed', () => {
    win = null
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('renderer gone:', details.reason)
  })
}

ipcMain.handle('pomodoro:load-settings', () => {
  const settings = readSettingsFile()
  return {
    focusMinutes: settings.focusMinutes,
    breakMinutes: settings.breakMinutes,
    todayDate: settings.todayDate,
    todayFocusSeconds: settings.todayFocusSeconds,
    file: SETTINGS_FILE,
  }
})

ipcMain.handle('pomodoro:save-settings', (_event, patch) => {
  saveTimerSettings(patch)
  return { file: SETTINGS_FILE }
})

ipcMain.handle('pomodoro:mode', () => mode)
ipcMain.handle('pomodoro:set-mode', (_event, next) => applyMode(next))
ipcMain.on('pomodoro:quit', () => app.quit())

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  app.whenReady().then(() => {
    ensureDataDir()
    createWindow()
    app.on('activate', () => {
      if (win) win.show()
      else createWindow()
    })
  })

  app.on('window-all-closed', () => app.quit())
}
