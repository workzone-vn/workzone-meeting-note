import { BrowserWindow, app, shell } from 'electron'
import * as path from 'path'

let mainWindow: BrowserWindow | null = null
let quitting = false

/** index.ts bật cờ này ngay trước khi cho phép quit thật sự
 * (không dùng before-quit ở đây: quit có thể bị huỷ bởi dialog xác nhận). */
export function setQuitting(v: boolean): void {
  quitting = v
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function showMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Claude Recorder',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // Đóng cửa sổ = ẩn (app sống ở tray); thoát thật qua tray/Cmd+Q
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return mainWindow
}
