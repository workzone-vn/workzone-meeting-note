// Mọi đường dẫn phụ thuộc nền tảng gom về đây (seam cho Windows sau này).
import { app } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const HOME = os.homedir()

export const dataDir = process.env.WZ_DATA_DIR || path.join(HOME, 'wz-bien-ban')
export const outputDir = path.join(dataDir, 'output')
export const stateFile = path.join(dataDir, '.state.json')
export const envFile = path.join(dataDir, '.env')
export const systemAudioFlag = path.join(dataDir, '.system_audio')
export const tasksFile = path.join(dataDir, 'tasks.json')
export const profilesDir = path.join(dataDir, 'profiles')
export const wikiDir = path.join(dataDir, 'wiki')
export const venvDir = path.join(dataDir, '.venv')
export const venvPython = path.join(venvDir, 'bin', 'python')

/** Thư mục chứa engine (wz.py, render.py, glossary.yaml, wz-syscap).
 * Đóng gói: resources/engine. Dev: scripts trong repo (syscap tự tìm ở ../native). */
export function engineDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'engine')
  return path.resolve(__dirname, '../../../plugins/workzone-meeting-note/scripts')
}

export function wzScript(): string {
  return path.join(engineDir(), 'wz.py')
}

/** PATH bổ sung cho tiến trình con: app mở từ Finder có PATH rất hẹp. */
export function extraPath(): string[] {
  return [path.join(HOME, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
}

/** Tìm CLI claude (giống wz.py _claude_bin) để UI cảnh báo sớm khi chưa cài. */
export function findClaude(): string | null {
  const candidates = [
    ...(process.env.PATH || '').split(path.delimiter),
    ...extraPath()
  ].map((d) => path.join(d, 'claude'))
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK)
      return c
    } catch {
      /* thử ứng viên tiếp theo */
    }
  }
  return null
}

export function findUv(): string | null {
  const candidates = [
    ...(process.env.PATH || '').split(path.delimiter),
    path.join(HOME, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ].map((d) => path.join(d, 'uv'))
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK)
      return c
    } catch {
      /* thử ứng viên tiếp theo */
    }
  }
  return null
}

/** Thư mục cache model Whisper của HuggingFace. */
export function hfModelDir(): string {
  const hfHome = process.env.HF_HOME || path.join(HOME, '.cache', 'huggingface')
  return path.join(hfHome, 'hub', 'models--mlx-community--whisper-large-v3-mlx')
}

/** Icon template cho menu bar (trayTemplate.png + @2x nằm cùng thư mục). */
export function trayIconPath(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'tray', 'trayTemplate.png')
  return path.resolve(__dirname, '../../build/tray/trayTemplate.png')
}

export function syscapPath(): string | null {
  const candidates = [
    path.join(engineDir(), 'wz-syscap'),
    path.resolve(engineDir(), '..', 'native', 'wz-syscap'),
    path.join(dataDir, 'engine', 'wz-syscap')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}
