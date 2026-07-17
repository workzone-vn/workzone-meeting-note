// Cấu hình app. systemAudio + hfToken dùng chung định dạng với plugin/MCP
// (flag file + .env trong ~/wz-bien-ban); audioDeviceIndex là của riêng app.
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { Settings } from '../../shared/types'
import { dataDir, envFile, systemAudioFlag } from '../paths'

const settingsFile = (): string => path.join(app.getPath('userData'), 'settings.json')

interface LocalSettings {
  audioDeviceIndex: string | null
  /** các hồ sơ ngữ cảnh dùng gần nhất - mặc định cho cuộc họp mới */
  lastProfiles?: string[]
  /** khoá cũ (1 hồ sơ) - đọc để di trú, không ghi nữa */
  lastProfile?: string | null
  /** đã áp mặc định "ghi tiếng trong máy = BẬT" lần đầu chưa */
  systemAudioDefaulted?: boolean
  /** đã chạy probe xin quyền Ghi âm thanh hệ thống lần đầu chưa */
  screenPermProbed?: boolean // khoá cũ (đời ScreenCaptureKit) - không dùng nữa
  audioPermProbed?: boolean
  /** giao diện Sáng/Tối - mặc định "light" khi chưa có */
  theme?: 'light' | 'dark'
}

function readLocal(): LocalSettings {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))
  } catch {
    return { audioDeviceIndex: null }
  }
}

function writeLocal(patch: Partial<LocalSettings>): void {
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify({ ...readLocal(), ...patch }))
}

function readHfToken(): string | null {
  try {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      if (line.startsWith('HF_TOKEN=')) return line.slice('HF_TOKEN='.length).trim() || null
    }
  } catch {
    /* chưa có .env */
  }
  return null
}

export function getSettings(): Settings {
  const local = readLocal()
  // di trú từ khoá cũ lastProfile (1 hồ sơ + Cá nhân ngầm định)
  const lastProfiles =
    local.lastProfiles ?? ['Cá nhân', ...(local.lastProfile ? [local.lastProfile] : [])]
  return {
    systemAudio: fs.existsSync(systemAudioFlag),
    audioDeviceIndex: local.audioDeviceIndex,
    lastProfiles,
    hfToken: readHfToken(),
    theme: local.theme ?? 'light'
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  fs.mkdirSync(dataDir, { recursive: true })
  if (patch.systemAudio !== undefined) {
    if (patch.systemAudio) fs.writeFileSync(systemAudioFlag, '')
    else fs.rmSync(systemAudioFlag, { force: true })
  }
  if (patch.audioDeviceIndex !== undefined) {
    writeLocal({ audioDeviceIndex: patch.audioDeviceIndex })
  }
  if (patch.lastProfiles !== undefined) {
    writeLocal({ lastProfiles: patch.lastProfiles })
  }
  if (patch.theme !== undefined) {
    writeLocal({ theme: patch.theme })
  }
  if (patch.hfToken !== undefined) {
    let lines: string[] = []
    try {
      lines = fs.readFileSync(envFile, 'utf8').split('\n').filter((l) => !l.startsWith('HF_TOKEN='))
    } catch {
      /* chưa có .env */
    }
    lines = lines.filter((l) => l.trim() !== '')
    if (patch.hfToken) lines.push(`HF_TOKEN=${patch.hfToken}`)
    fs.writeFileSync(envFile, lines.join('\n') + (lines.length ? '\n' : ''))
  }
  return getSettings()
}

/** Mặc định BẬT ghi tiếng trong máy (chất lượng tốt nhất) - chỉ áp 1 lần,
 * sau đó tôn trọng lựa chọn của user trong Settings. */
export function ensureSystemAudioDefault(syscapOk: boolean): void {
  const local = readLocal()
  if (local.systemAudioDefaulted) return
  if (syscapOk && !fs.existsSync(systemAudioFlag)) {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(systemAudioFlag, '')
  }
  writeLocal({ systemAudioDefaulted: true })
}

// Khoá mới `audioPermProbed` (thay `screenPermProbed` cũ): wz-syscap đổi sang
// Core Audio Tap dùng quyền TCC KHÁC ("Ghi âm thanh hệ thống"), bản cài cũ phải
// được probe lại 1 lần để prompt hiện ngay lúc mở app thay vì giữa buổi ghi đầu
// (lúc đó cuộc ghi đã kịp rớt xuống mic-only).
export function screenPermProbedOnce(): boolean {
  if (readLocal().audioPermProbed) return true
  writeLocal({ audioPermProbed: true })
  return false
}
