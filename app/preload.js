'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pomodoro', {
  loadSettings: () => ipcRenderer.invoke('pomodoro:load-settings'),
  saveSettings: (patch) => ipcRenderer.invoke('pomodoro:save-settings', patch),
  getMode: () => ipcRenderer.invoke('pomodoro:mode'),
  setMode: (mode) => ipcRenderer.invoke('pomodoro:set-mode', mode),
  quit: () => ipcRenderer.send('pomodoro:quit'),
  onMode: (listener) => {
    const handler = (_event, mode) => listener(mode)
    ipcRenderer.on('pomodoro:mode', handler)
    return () => ipcRenderer.removeListener('pomodoro:mode', handler)
  },
})
