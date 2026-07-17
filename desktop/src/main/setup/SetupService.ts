// Cài đặt lần đầu (mirror install.sh): uv -> venv -> pip -> model (~3GB) -> engine.
// Idempotent: bước nào xong rồi thì bỏ qua; máy đã cài plugin trước đó chỉ sync engine.
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import type { SetupProgress, SetupStatus, SetupStepId } from '../../shared/types'
import {
  dataDir,
  engineDir,
  findClaude,
  findUv,
  hfModelDir,
  outputDir,
  syscapPath,
  venvDir,
  venvPython
} from '../paths'

const WIN = process.platform === 'win32'

// Cùng pin version với install.sh - tránh bản upstream breaking.
// Windows: faster-whisper (CPU) + WASAPI loopback; không mlx/torch/pyannote
// (mlx chỉ có Apple Silicon; diarization tắt trên Windows bản beta).
const PIP_PACKAGES = WIN
  ? ['faster-whisper==1.2.1', 'pyaudiowpatch==0.2.12.7', 'imageio-ffmpeg==0.6.0', 'mcp[cli]==1.28.0']
  : [
      'mlx-whisper==0.4.3',
      'soundfile==0.14.0',
      'imageio-ffmpeg==0.6.0',
      'mcp[cli]==1.28.0',
      'torch==2.12.1',
      'pyannote.audio>=3.1,<4'
    ]

const PIP_PROBE = WIN ? 'import faster_whisper, pyaudiowpatch, imageio_ffmpeg' : 'import mlx_whisper, imageio_ffmpeg'
const HF_MODEL = WIN ? 'Systran/faster-whisper-large-v3' : 'mlx-community/whisper-large-v3-mlx'

type ProgressFn = (p: SetupProgress) => void
let running = false

export function getSetupStatus(): SetupStatus {
  const venvOk = fs.existsSync(venvPython)
  const modelOk = fs.existsSync(path.join(hfModelDir(), 'snapshots'))
  const engineSynced = fs.existsSync(path.join(dataDir, 'engine', 'wz.py'))
  return {
    venvOk,
    modelOk,
    engineSynced,
    claudePath: findClaude(),
    // Windows: loopback WASAPI nằm ngay trong engine, không cần binary riêng
    syscapOk: WIN ? true : syscapPath() !== null,
    ready: venvOk && modelOk
  }
}

function sh(cmd: string, args: string[], onLine?: (l: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const extra = WIN
      ? [path.join(process.env.USERPROFILE || '', '.local', 'bin')]
      : [`${process.env.HOME}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
    const child = spawn(cmd, args, {
      env: {
        ...process.env,
        PYTHONUTF8: '1', // pipe Windows mặc định cp1252 -> marker tiếng Việt vỡ
        PATH: [...extra, process.env.PATH || ''].join(path.delimiter)
      }
    })
    // tqdm ghi tiến trình bằng \r trên stderr -> tách theo \r lẫn \n
    let buf = ''
    const feed = (d: Buffer): void => {
      buf += d.toString()
      const parts = buf.split(/[\r\n]/)
      buf = parts.pop() || ''
      for (const p of parts) if (p.trim() && onLine) onLine(p)
    }
    child.stdout.on('data', feed)
    child.stderr.on('data', feed)
    child.on('error', () => resolve(1))
    child.on('close', (code) => resolve(code ?? 1))
  })
}

async function stepUv(progress: ProgressFn): Promise<string> {
  const existing = findUv()
  if (existing) {
    progress({ step: 'uv', status: 'done' })
    return existing
  }
  progress({ step: 'uv', status: 'running', message: 'Đang cài uv (trình quản lý Python)...' })
  const code = WIN
    ? await sh('powershell', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'irm https://astral.sh/uv/install.ps1 | iex'
      ])
    : await sh('bash', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'])
  const uv = findUv()
  if (code !== 0 || !uv) throw new Error('Không cài được uv. Kiểm tra kết nối mạng rồi thử lại.')
  progress({ step: 'uv', status: 'done' })
  return uv
}

async function stepVenv(uv: string, progress: ProgressFn): Promise<void> {
  if (fs.existsSync(venvPython)) {
    progress({ step: 'venv', status: 'done' })
    return
  }
  progress({ step: 'venv', status: 'running', message: 'Tạo môi trường Python 3.12...' })
  const code = await sh(uv, ['venv', '--python', '3.12', venvDir])
  if (code !== 0 || !fs.existsSync(venvPython)) throw new Error('Không tạo được môi trường Python.')
  progress({ step: 'venv', status: 'done' })
}

async function stepPip(uv: string, progress: ProgressFn): Promise<void> {
  const probe = await sh(venvPython, ['-c', PIP_PROBE])
  if (probe === 0) {
    progress({ step: 'pip', status: 'done' })
    return
  }
  progress({ step: 'pip', status: 'running', message: 'Cài thư viện nhận giọng nói...' })
  const code = await sh(uv, ['pip', 'install', '--python', venvPython, ...PIP_PACKAGES], (l) =>
    progress({ step: 'pip', status: 'running', message: l.slice(0, 120) })
  )
  if (code !== 0) throw new Error('Cài thư viện thất bại. Kiểm tra mạng rồi thử lại.')
  progress({ step: 'pip', status: 'done' })
}

async function stepModel(progress: ProgressFn): Promise<void> {
  if (fs.existsSync(path.join(hfModelDir(), 'snapshots'))) {
    progress({ step: 'model', status: 'done' })
    return
  }
  progress({ step: 'model', status: 'running', message: 'Tải model Whisper large-v3 (~3GB, chỉ lần đầu)...' })
  const code = await sh(
    venvPython,
    ['-u', '-c', `from huggingface_hub import snapshot_download; snapshot_download("${HF_MODEL}")`],
    (l) => {
      // Parse % từ tqdm; nếu format đổi thì bỏ qua (không được chặn cài đặt)
      const m = l.match(/(\d{1,3})%\|/)
      progress({
        step: 'model',
        status: 'running',
        pct: m ? Math.min(100, parseInt(m[1], 10)) : undefined,
        message: m ? undefined : l.slice(0, 120)
      })
    }
  )
  if (code !== 0) throw new Error('Tải model thất bại. Kiểm tra mạng rồi thử lại.')
  progress({ step: 'model', status: 'done' })
}

/** Copy engine vào ~/wz-bien-ban/engine để Claude Desktop MCP / plugin dùng chung
 * (tương đương install.sh bước 3). App tự chạy engine từ resources, không từ đây. */
export async function syncEngine(progress?: ProgressFn): Promise<void> {
  progress?.({ step: 'engine', status: 'running', message: 'Đồng bộ engine...' })
  const dst = path.join(dataDir, 'engine')
  fs.mkdirSync(dst, { recursive: true })
  fs.mkdirSync(outputDir, { recursive: true })
  const src = engineDir()
  for (const f of ['wz.py', 'wz-win.py', 'render.py', 'glossary.yaml', 'server.py']) {
    const from = fs.existsSync(path.join(src, f))
      ? path.join(src, f)
      : path.resolve(src, '../../..', 'mcp', f) // dev: server.py nằm ở <repo>/mcp/
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dst, f))
  }
  const syscap = syscapPath()
  if (syscap) {
    fs.copyFileSync(syscap, path.join(dst, 'wz-syscap'))
    fs.chmodSync(path.join(dst, 'wz-syscap'), 0o755)
  }
  progress?.({ step: 'engine', status: 'done' })
}

export async function startSetup(progress: ProgressFn): Promise<void> {
  if (running) return
  running = true
  let current: SetupStepId = 'uv'
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    const uv = await stepUv(progress)
    current = 'venv'
    await stepVenv(uv, progress)
    current = 'pip'
    await stepPip(uv, progress)
    current = 'model'
    await stepModel(progress)
    current = 'engine'
    await syncEngine(progress)
  } catch (e) {
    // lỗi báo qua event trên đúng bước đang chạy - renderer hiện nút Thử lại
    progress({ step: current, status: 'error', message: e instanceof Error ? e.message : String(e) })
  } finally {
    running = false
  }
}
