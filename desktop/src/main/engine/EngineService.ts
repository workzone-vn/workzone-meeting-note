// Ranh giới app <-> engine Python: spawn wz.py bằng python của venv,
// stream từng dòng stdout/stderr và parse các marker (OUTPUT_DIR=, WARN_SILENT...).
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as readline from 'readline'
import type { RecorderStatus } from '../../shared/types'
import { dataDir, extraPath, stateFile, venvPython, wzScript } from '../paths'
import { getSettings } from '../settings/SettingsStore'

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

function engineEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: [...extraPath(), process.env.PATH || ''].join(':')
  }
  const dev = getSettings().audioDeviceIndex
  if (dev !== null && dev !== '' && !process.env.WZ_AUDIO_DEV) {
    env.WZ_AUDIO_DEV = `:${dev}` // định dạng avfoundation ":<index>" như wz.py
  }
  return env
}

/** Lệnh ngắn (list, devices, check, print-html...). */
export function run(args: string[], timeoutMs = 120_000): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(venvPython, [wzScript(), ...args], {
      cwd: dataDir,
      env: engineEnv(),
      timeout: timeoutMs
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (err) => resolve({ code: 1, stdout, stderr: stderr + String(err) }))
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

/** Lệnh dài (record-stop có transcribe 30+ phút, bienban, revise). Stream từng dòng.
 * `stdin`: nội dung ghi vào stdin của engine rồi đóng (revise đọc yêu cầu sửa từ stdin). */
export function runStreaming(
  args: string[],
  onLine: (line: string) => void,
  timeoutMs = 3 * 3600_000,
  stdin?: string
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(venvPython, [wzScript(), ...args], {
      cwd: dataDir,
      env: engineEnv(),
      timeout: timeoutMs
    })
    child.stdin.on('error', () => {}) // engine thoát sớm (vd NO_CLAUDE) -> EPIPE, bỏ qua
    if (stdin !== undefined) child.stdin.write(stdin)
    child.stdin.end()
    let stdout = ''
    let stderr = ''
    const out = readline.createInterface({ input: child.stdout })
    out.on('line', (l) => {
      stdout += l + '\n'
      onLine(l)
    })
    const err = readline.createInterface({ input: child.stderr })
    err.on('line', (l) => {
      stderr += l + '\n'
    })
    child.on('error', (e) => resolve({ code: 1, stdout, stderr: stderr + String(e) }))
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

/** Đọc .state.json + kiểm tra CÒN tiến trình nào sống (cùng logic `status` của wz.py:
 * "đang ghi" = any pid còn sống). Chỉ kiểm mỗi st.pid là sai: khi ghi mic + tiếng
 * hệ thống, st.pid là syscap - nếu chưa cấp quyền Ghi âm thanh hệ thống nó chết ngay còn mic
 * vẫn ghi, khiến app báo nhầm "không ghi" và UI không lật (nút Record "không có gì
 * xảy ra"). Guard pid <= 0: kill(-1, 0) không raise và sẽ báo nhầm "đang ghi". */
export function isRecording(): RecorderStatus {
  let st: { name?: string; pid?: number; pids?: number[]; started?: number }
  try {
    st = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  } catch {
    return { recording: false }
  }
  const pids = st.pids?.length ? st.pids : st.pid ? [st.pid] : []
  const alive = pids.some((pid) => {
    if (!pid || pid <= 0) return false
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  })
  if (!alive) return { recording: false }
  return { recording: true, name: st.name, startedAt: st.started }
}
