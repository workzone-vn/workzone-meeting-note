// Hồ sơ công ty: mỗi công ty một thư mục ~/wz-bien-ban/profiles/<tên>/
// chứa glossary.yaml riêng. Cuộc họp gắn với hồ sơ nào thì chỉ dùng
// glossary của hồ sơ đó -> không lẫn tên người/thuật ngữ giữa các công ty.
import * as fs from 'fs'
import * as path from 'path'
import { dataDir, profilesDir } from './paths'

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
  if (!p) throw new Error(`Tên công ty không hợp lệ: ${profile}`)
  return path.join(profilesDir, p, 'context.md')
}

export function createProfile(name: string): string {
  const p = safeProfileName(name)
  if (!p) throw new Error('Tên công ty không hợp lệ.')
  fs.mkdirSync(path.join(profilesDir, p), { recursive: true })
  return p
}
