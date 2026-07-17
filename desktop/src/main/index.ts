import { app, dialog } from 'electron'
import * as path from 'path'
import { isRecording } from './engine/EngineService'
import { registerIpc } from './ipc'
import { syscapPath } from './paths'
import { requestPermissionsAtLaunch } from './permissions'
import { ensurePersonalProfile } from './profiles'
import { ensureSystemAudioDefault } from './settings/SettingsStore'
import { getSetupStatus, syncEngine } from './setup/SetupService'
import { createTray } from './tray'
import { setQuitting, showMainWindow } from './window'

// Một instance duy nhất: mở lần 2 -> focus cửa sổ đang chạy
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  app.whenReady().then(() => {
    // Dev chạy bằng binary Electron nên dock không tự có icon; bản đóng gói dùng icns
    if (!app.isPackaged && process.platform === 'darwin') {
      try {
        app.dock?.setIcon(path.join(__dirname, '../../build/icon.png'))
      } catch {
        /* thiếu icon.png cũng không sao */
      }
    }
    // Mặc định BẬT ghi tiếng trong máy (chất lượng tốt nhất) - áp 1 lần duy nhất
    ensureSystemAudioDefault(syscapPath() !== null)
    // Hồ sơ "Cá nhân" luôn tồn tại + di trú file ngữ cảnh cũ (1 lần)
    ensurePersonalProfile()
    registerIpc()
    createTray()
    showMainWindow()
    void requestPermissionsAtLaunch()
    // Máy đã cài rồi -> đồng bộ engine mới nhất cho plugin/MCP dùng chung
    if (getSetupStatus().ready) void syncEngine().catch(() => {})
  })

  app.on('activate', () => showMainWindow())

  // App sống ở tray kể cả khi mọi cửa sổ đóng
  app.on('window-all-closed', () => {})

  let confirmedQuit = false
  app.on('before-quit', (e) => {
    const st = isRecording()
    if (confirmedQuit || !st.recording) {
      setQuitting(true)
      return
    }
    e.preventDefault()
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Ở lại', 'Vẫn thoát'],
      defaultId: 0,
      cancelId: 0,
      message: 'Đang ghi cuộc họp',
      detail:
        'Ghi âm vẫn tiếp tục chạy nền sau khi thoát. Mở lại app và bấm "Kết thúc & tạo biên bản" để hoàn tất.'
    })
    if (choice === 1) {
      confirmedQuit = true
      app.quit()
    }
  })
}
