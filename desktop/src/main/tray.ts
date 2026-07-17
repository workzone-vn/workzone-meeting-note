// Icon mic trên menu bar (template image - tự đổi màu theo theme macOS):
// đang ghi hiện đồng hồ MM:SS cạnh icon, đang xử lý hiện ⏳.
// Bắt đầu/kết thúc nhanh không cần mở cửa sổ (thay thế app rumps cũ).
import { BrowserWindow, Menu, Tray, app, nativeImage, shell } from 'electron'
import { IPC_EVENTS } from '../shared/ipc-contract'
import { confirmDialog } from './confirm'
import { isRecording, run } from './engine/EngineService'
import { getPipelineState, onPipelineChange, stopAndSave } from './engine/PipelineService'
import { outputDir, trayIconPath } from './paths'
import { getSettings } from './settings/SettingsStore'
import { showMainWindow } from './window'

let tray: Tray | null = null
let lastMenuKey = ''

function broadcastRecorder(): void {
  const st = isRecording()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC_EVENTS.recorderChanged, st)
  }
}

function fmtElapsed(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

async function confirmAndStop(): Promise<void> {
  const ok = await confirmDialog(
    'Kết thúc cuộc họp?',
    'Ghi âm sẽ dừng và lưu lại. Transcript & biên bản tạo sau, lúc nào bạn muốn.',
    'Kết thúc & lưu'
  )
  if (!ok) return
  void stopAndSave().then(() => broadcastRecorder())
  broadcastRecorder()
  refreshTray()
}

function buildMenu(recording: boolean, busy: boolean): Menu {
  return Menu.buildFromTemplate([
    {
      label: '● Bắt đầu họp',
      // pipeline nền đang xử lý KHÔNG chặn ghi mới (record-first, process-later)
      enabled: !recording,
      click: async () => {
        // dùng bộ hồ sơ ngữ cảnh gần nhất (đổi hồ sơ thì mở cửa sổ chính)
        const profiles = getSettings().lastProfiles
        await run(['record-start', ...profiles.flatMap((p) => ['--profile', p])])
        broadcastRecorder()
        refreshTray()
      }
    },
    {
      label: '■ Kết thúc & lưu',
      enabled: recording,
      click: () => void confirmAndStop()
    },
    { type: 'separator' },
    { label: 'Mở Claude Recorder', click: () => void showMainWindow() },
    { label: 'Mở thư mục kết quả', click: () => void shell.openPath(outputDir) },
    { type: 'separator' },
    { label: 'Thoát', click: () => app.quit() }
  ])
}

export function refreshTray(): void {
  if (!tray) return
  const st = isRecording()
  const busy = !['idle', 'done', 'error'].includes(getPipelineState().stage)
  // Title cập nhật mỗi giây; menu chỉ dựng lại khi trạng thái đổi
  // (setContextMenu liên tục sẽ đóng menu đang mở).
  // Ưu tiên đồng hồ ghi âm: có thể VỪA ghi cuộc mới VỪA xử lý nền cuộc cũ.
  // setTitle chỉ có trên macOS - Windows dùng tooltip thay.
  if (process.platform === 'darwin') {
    if (st.recording && st.startedAt) {
      tray.setTitle(` ${fmtElapsed(Math.max(0, Date.now() / 1000 - st.startedAt))}`, {
        fontType: 'monospacedDigit'
      })
    } else if (busy) tray.setTitle(' ⏳', { fontType: 'monospacedDigit' })
    else tray.setTitle('')
  } else {
    tray.setToolTip(
      st.recording && st.startedAt
        ? `Claude Recorder - đang ghi ${fmtElapsed(Math.max(0, Date.now() / 1000 - st.startedAt))}`
        : busy
          ? 'Claude Recorder - đang xử lý biên bản'
          : 'Claude Recorder'
    )
  }
  const key = `${st.recording}|${busy}`
  if (key !== lastMenuKey) {
    lastMenuKey = key
    tray.setContextMenu(buildMenu(st.recording, busy))
  }
}

export function createTray(): void {
  const icon = nativeImage.createFromPath(trayIconPath())
  icon.setTemplateImage(true) // đen/alpha -> macOS tự đổi màu theo light/dark
  tray = new Tray(icon)
  tray.setToolTip('Claude Recorder')
  refreshTray()
  setInterval(refreshTray, 1000)
  onPipelineChange(() => refreshTray())
}
