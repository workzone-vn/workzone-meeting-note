// Mọi đường dẫn phụ thuộc nền tảng gom về đây (seam cho Windows sau này).
import { app } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const HOME = os.homedir()
const WIN = process.platform === 'win32'

export const dataDir = process.env.WZ_DATA_DIR || path.join(HOME, 'wz-bien-ban')
export const outputDir = path.join(dataDir, 'output')
export const stateFile = path.join(dataDir, '.state.json')
export const envFile = path.join(dataDir, '.env')
export const systemAudioFlag = path.join(dataDir, '.system_audio')
export const tasksFile = path.join(dataDir, 'tasks.json')
export const profilesDir = path.join(dataDir, 'profiles')
export const wikiDir = path.join(dataDir, 'wiki')
export const venvDir = path.join(dataDir, '.venv')
export const venvPython = WIN
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python')

/** Thư mục chứa engine (wz.py, render.py, glossary.yaml, wz-syscap).
 * Đóng gói: resources/engine. Dev: scripts trong repo (syscap tự tìm ở ../native). */
export function engineDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'engine')
  return path.resolve(__dirname, '../../../plugins/workzone-meeting-note/scripts')
}

/** Windows dùng wz-win.py (WASAPI + faster-whisper), macOS dùng wz.py (mlx). */
export function wzScript(): string {
  return path.join(engineDir(), WIN ? 'wz-win.py' : 'wz.py')
}

/** PATH bổ sung cho tiến trình con: app mở từ Finder/Explorer có PATH rất hẹp. */
export function extraPath(): string[] {
  if (WIN) return [path.join(HOME, '.local', 'bin')]
  return [path.join(HOME, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
}

/** Tìm 1 CLI trong PATH + extraPath, kèm đuôi .exe/.cmd/.bat trên Windows. */
function findCli(name: string, extraDirs: string[] = []): string | null {
  const dirs = [...(process.env.PATH || '').split(path.delimiter), ...extraPath(), ...extraDirs]
  const names = WIN ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name] : [name]
  for (const d of dirs) {
    for (const n of names) {
      const c = path.join(d, n)
      try {
        fs.accessSync(c, fs.constants.X_OK)
        return c
      } catch {
        /* thử ứng viên tiếp theo */
      }
    }
  }
  return null
}

/** Tìm CLI claude (giống wz.py _claude_bin) để UI cảnh báo sớm khi chưa cài. */
export function findClaude(): string | null {
  return findCli('claude')
}

export function findUv(): string | null {
  return findCli('uv', ['/opt/homebrew/bin', '/usr/local/bin'])
}

/** Thư mục cache model Whisper của HuggingFace (mỗi nền tảng 1 model khác). */
export function hfModelDir(): string {
  const hfHome = process.env.HF_HOME || path.join(HOME, '.cache', 'huggingface')
  const model = WIN
    ? 'models--Systran--faster-whisper-large-v3'
    : 'models--mlx-community--whisper-large-v3-mlx'
  return path.join(hfHome, 'hub', model)
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
