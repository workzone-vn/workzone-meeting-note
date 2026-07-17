// Chủ động xin quyền macOS ngay lúc mở app (thay vì để vấp lúc bắt đầu họp):
// - Micro: hỏi thẳng qua askForMediaAccess.
// - Ghi âm thanh hệ thống (Core Audio Tap trong wz-syscap): macOS chỉ hiện prompt
//   khi có tiến trình thực sự tap -> chạy wz-syscap ~1.5s một lần duy nhất.
//   Không có API tra trạng thái quyền này nên dựa vào marker probe-1-lần.
import { spawn } from 'child_process'
import { systemPreferences } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { syscapPath } from './paths'
import { getSettings, screenPermProbedOnce } from './settings/SettingsStore'

export async function requestPermissionsAtLaunch(): Promise<void> {
  if (process.platform !== 'darwin') return
  try {
    if (systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') {
      await systemPreferences.askForMediaAccess('microphone')
    }
    const syscap = syscapPath()
    if (getSettings().systemAudio && syscap && !screenPermProbedOnce()) {
      const tmp = path.join(os.tmpdir(), 'wz-perm-probe.wav')
      const p = spawn(syscap, [tmp], { stdio: 'ignore' })
      setTimeout(() => {
        try {
          p.kill('SIGINT')
        } catch {
          /* đã thoát */
        }
        fs.rmSync(tmp, { force: true })
      }, 1500)
    }
  } catch {
    /* quyền không được chặn khởi động app */
  }
}
