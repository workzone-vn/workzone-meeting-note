// Hồ sơ công ty: mỗi công ty một thư mục ~/wz-bien-ban/profiles/<tên>/
// chứa glossary.yaml riêng. Cuộc họp gắn với hồ sơ nào thì chỉ dùng
// glossary của hồ sơ đó -> không lẫn tên người/thuật ngữ giữa các công ty.
import * as fs from 'fs'
import * as path from 'path'
import { dataDir, outputDir, profilesDir } from './paths'
import { getSettings, setSettings } from './settings/SettingsStore'

/** Hồ sơ mặc định, luôn tồn tại. Cùng giá trị với PERSONAL_PROFILE của wz.py. */
export const PERSONAL_PROFILE = 'Cá nhân'

/** Đảm bảo hồ sơ "Cá nhân" tồn tại và di trú các file cũ (1 lần):
 * - ~/wz-bien-ban/glossary.yaml (bản rất cũ) -> profiles/Cá nhân/context.md
 * - profiles/<tên>/glossary.yaml (tên cũ)    -> profiles/<tên>/context.md
 * Ngữ cảnh là văn bản tự do nên chuẩn mới dùng markdown; engine vẫn đọc được
 * tên cũ nếu còn (fallback) - đổi tên chỉ để rõ nghĩa. */
export function ensurePersonalProfile(): void {
  fs.mkdirSync(path.join(profilesDir, PERSONAL_PROFILE), { recursive: true })
  const legacy = path.join(dataDir, 'glossary.yaml')
  const personalNew = path.join(profilesDir, PERSONAL_PROFILE, 'context.md')
  if (fs.existsSync(legacy) && !fs.existsSync(personalNew)) {
    fs.renameSync(legacy, personalNew)
  }
  for (const name of listProfiles()) {
    const oldF = path.join(profilesDir, name, 'glossary.yaml')
    const newF = path.join(profilesDir, name, 'context.md')
    if (fs.existsSync(oldF) && !fs.existsSync(newF)) fs.renameSync(oldF, newF)
  }
}

/** Tên hồ sơ hợp lệ: giữ tiếng Việt, chặn path traversal (khớp _safe_profile của wz.py). */
export function safeProfileName(name: string): string | null {
  const p = (name || '').trim()
  if (!p || p.includes('/') || p.includes('\\') || p === '.' || p === '..' || p.startsWith('.')) {
    return null
  }
  return p
}

export function listProfiles(): string[] {
  let names: string[] = []
  try {
    names = fs
      .readdirSync(profilesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, 'vi'))
  } catch {
    /* chưa có thư mục profiles */
  }
  // "Cá nhân" luôn có và đứng đầu
  return [PERSONAL_PROFILE, ...names.filter((n) => n !== PERSONAL_PROFILE)]
}

export function profileGlossaryFile(profile: string): string {
  const p = safeProfileName(profile)
  if (!p) throw new Error(`Tên ngữ cảnh không hợp lệ: ${profile}`)
  return path.join(profilesDir, p, 'context.md')
}

export function createProfile(name: string): string {
  const p = safeProfileName(name)
  if (!p) throw new Error('Tên ngữ cảnh không hợp lệ.')
  fs.mkdirSync(path.join(profilesDir, p), { recursive: true })
  return p
}

/** Đổi tên hồ sơ ngữ cảnh: rename thư mục + cập nhật meeting.json của các cuộc
 * họp cũ đang trỏ tên cũ (không thì đổi tên xong "Viết lại biên bản" mất ngữ cảnh)
 * + lastProfiles trong settings. "Cá nhân" là mặc định, không đổi được. */
export function renameProfile(oldName: string, newName: string): string {
  const from = safeProfileName(oldName)
  const to = safeProfileName(newName)
  if (!from || !to) throw new Error('Tên ngữ cảnh không hợp lệ.')
  if (from === PERSONAL_PROFILE) throw new Error('Hồ sơ "Cá nhân" là mặc định, không đổi tên được.')
  if (to === from) return to
  const src = path.join(profilesDir, from)
  const dst = path.join(profilesDir, to)
  if (!fs.existsSync(src)) throw new Error(`Không thấy hồ sơ: ${from}`)
  if (to === PERSONAL_PROFILE || fs.existsSync(dst)) throw new Error(`Đã có hồ sơ tên "${to}".`)
  fs.renameSync(src, dst)
  try {
    for (const d of fs.readdirSync(outputDir)) {
      const f = path.join(outputDir, d, 'meeting.json')
      if (!fs.existsSync(f)) continue
      try {
        const meta = JSON.parse(fs.readFileSync(f, 'utf8'))
        let changed = false
        if (Array.isArray(meta.profiles) && meta.profiles.includes(from)) {
          meta.profiles = meta.profiles.map((p: string) => (p === from ? to : p))
          changed = true
        }
        if (meta.profile === from) {
          meta.profile = to // khoá legacy
          changed = true
        }
        if (changed) fs.writeFileSync(f, JSON.stringify(meta), 'utf8')
      } catch {
        /* meeting.json hỏng - bỏ qua */
      }
    }
  } catch {
    /* chưa có thư mục output */
  }
  const last = getSettings().lastProfiles
  if (last.includes(from)) {
    setSettings({ lastProfiles: last.map((p) => (p === from ? to : p)) })
  }
  return to
}
