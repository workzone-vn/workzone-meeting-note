// Đọc dữ liệu cuộc họp trực tiếp từ ~/wz-bien-ban/output (nhanh, không spawn python).
// Danh sách vẫn lấy qua `wz.py list` để giữ 1 nguồn logic; chi tiết đọc file tại đây.
import * as fs from 'fs'
import * as path from 'path'
import type { MeetingDetail, MeetingSummary, TranscriptSegment } from '../shared/types'
import { outputDir } from './paths'
import { run } from './engine/EngineService'

/** Chặn tên cuộc họp chứa dấu phân cách đường dẫn (an toàn path traversal). */
export function meetingDir(name: string): string {
  if (!name || name !== path.basename(name) || name.startsWith('.')) {
    throw new Error(`Tên cuộc họp không hợp lệ: ${name}`)
  }
  return path.join(outputDir, name)
}

export async function listMeetings(): Promise<MeetingSummary[]> {
  const r = await run(['list'])
  if (r.code !== 0) throw new Error(r.stderr || 'Không đọc được danh sách cuộc họp.')
  const raw = JSON.parse(r.stdout) as Array<{
    name: string
    started: number | null
    title?: string | null
    profiles: string[]
    duration: number | null
    has_audio?: boolean
    has_transcript: boolean
    has_bienban: boolean
    has_pdf: boolean
  }>
  return raw.map((m) => ({
    name: m.name,
    started: m.started,
    title: m.title ?? null,
    profiles: m.profiles ?? ['Cá nhân'],
    duration: m.duration,
    hasAudio: m.has_audio ?? false,
    hasTranscript: m.has_transcript,
    hasBienban: m.has_bienban,
    hasPdf: m.has_pdf
  }))
}

export function getMeeting(name: string): MeetingDetail {
  const dir = meetingDir(name)
  let segments: TranscriptSegment[] = []
  try {
    segments = JSON.parse(fs.readFileSync(path.join(dir, 'transcript.raw.json'), 'utf8'))
  } catch {
    /* chưa transcript */
  }
  let bienBanMd: string | null = null
  try {
    bienBanMd = fs.readFileSync(path.join(dir, 'bien-ban.md'), 'utf8')
  } catch {
    /* chưa có biên bản */
  }
  let started: number | null = null
  let title: string | null = null
  let profiles: string[] = ['Cá nhân']
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meeting.json'), 'utf8'))
    started = meta.started ?? null
    title = meta.title ?? null
    // chuẩn hoá như wz.py _meeting_profiles (khoá cũ 'profile' = 1 công ty + Cá nhân)
    profiles = Array.isArray(meta.profiles)
      ? meta.profiles
      : ['Cá nhân', ...(meta.profile ? [meta.profile] : [])]
  } catch {
    /* thiếu meeting.json */
  }
  return {
    name,
    started,
    title,
    profiles,
    duration: segments.length ? segments[segments.length - 1].end : null,
    segments,
    bienBanMd,
    hasAudio: fs.existsSync(path.join(dir, 'audio.16k.wav')),
    hasPdf: fs.existsSync(path.join(dir, 'bien-ban.pdf'))
  }
}

export function saveBienban(name: string, content: string): void {
  fs.writeFileSync(path.join(meetingDir(name), 'bien-ban.md'), content, 'utf8')
}

/** Đổi bộ hồ sơ ngữ cảnh của một cuộc họp ĐÃ ghi (chọn lại ở bước transcript -> biên bản).
 * Engine đọc profiles từ meeting.json lúc chạy `bienban` nên đổi trước lúc đó là áp dụng ngay. */
export function setMeetingProfiles(name: string, profiles: string[]): void {
  const f = path.join(meetingDir(name), 'meeting.json')
  let meta: Record<string, unknown> = {}
  try {
    meta = JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    /* meeting.json thiếu/hỏng -> tạo mới */
  }
  meta.profiles = profiles
  delete meta.profile // bỏ khoá cũ để không bị chuẩn hoá chồng
  fs.writeFileSync(f, JSON.stringify(meta), 'utf8')
}

/** Sửa tay tiêu đề hiển thị (trống = xoá, quay về tên thư mục). */
export function setMeetingTitle(name: string, title: string): void {
  const f = path.join(meetingDir(name), 'meeting.json')
  let meta: Record<string, unknown> = {}
  try {
    meta = JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    /* meeting.json thiếu/hỏng -> tạo mới */
  }
  const t = title.trim()
  if (t) meta.title = t
  else delete meta.title
  fs.writeFileSync(f, JSON.stringify(meta), 'utf8')
}

/** Tìm cuộc họp theo keyword: khớp tiêu đề hiển thị, tên thư mục hoặc nội dung
 * biên bản. Đọc file trực tiếp - vài chục cuộc họp vẫn tức thì. */
export function searchMeetings(q: string): string[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return []
  const hits: string[] = []
  if (!fs.existsSync(outputDir)) return hits
  for (const d of fs.readdirSync(outputDir)) {
    const dir = path.join(outputDir, d)
    try {
      if (!fs.statSync(dir).isDirectory()) continue
      let hay = d.toLowerCase()
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meeting.json'), 'utf8'))
        if (meta.title) hay += '\n' + String(meta.title).toLowerCase()
      } catch {
        /* thiếu meeting.json */
      }
      try {
        hay += '\n' + fs.readFileSync(path.join(dir, 'bien-ban.md'), 'utf8').toLowerCase()
      } catch {
        /* chưa có biên bản */
      }
      if (hay.includes(needle)) hits.push(d)
    } catch {
      /* bỏ qua entry hỏng */
    }
  }
  return hits
}

/** Xoá vĩnh viễn thư mục cuộc họp (caller phải confirm với user trước). */
export function deleteMeeting(name: string): void {
  fs.rmSync(meetingDir(name), { recursive: true, force: true })
}

export interface FindReplacePair {
  find: string
  replace: string
}

function countAndReplace(text: string, find: string): { replaced: (r: string) => string; count: number } {
  const parts = text.split(find)
  return { replaced: (r: string) => parts.join(r), count: parts.length - 1 }
}

/** Find & Replace (chuỗi literal, không regex) trên biên bản và/hoặc transcript.
 * Sửa cả transcript.raw.json + 2 file txt dẫn xuất để PDF xuất lại đúng nội dung mới. */
export function findReplaceInMeeting(
  name: string,
  pairs: FindReplacePair[],
  scope: { bienban: boolean; transcript: boolean }
): { count: number } {
  const dir = meetingDir(name)
  let total = 0
  const applyAll = (text: string): string => {
    for (const p of pairs) {
      if (!p.find) continue
      const { replaced, count } = countAndReplace(text, p.find)
      total += count
      text = replaced(p.replace)
    }
    return text
  }
  const applyToFile = (file: string): void => {
    const f = path.join(dir, file)
    if (!fs.existsSync(f)) return
    fs.writeFileSync(f, applyAll(fs.readFileSync(f, 'utf8')), 'utf8')
  }
  if (scope.bienban) applyToFile('bien-ban.md')
  if (scope.transcript) {
    const rawJson = path.join(dir, 'transcript.raw.json')
    if (fs.existsSync(rawJson)) {
      const segs = JSON.parse(fs.readFileSync(rawJson, 'utf8')) as { text: string }[]
      for (const s of segs) {
        for (const p of pairs) {
          if (!p.find) continue
          const { replaced, count } = countAndReplace(s.text, p.find)
          total += count
          s.text = replaced(p.replace)
        }
      }
      fs.writeFileSync(rawJson, JSON.stringify(segs, null, 2), 'utf8')
    }
    // 2 file txt dẫn xuất: thay thế thuần văn bản cho khớp với raw.json
    for (const f of ['transcript.raw.txt', 'transcript.speakers.txt']) {
      const fp = path.join(dir, f)
      if (!fs.existsSync(fp)) continue
      let text = fs.readFileSync(fp, 'utf8')
      for (const p of pairs) {
        if (p.find) text = text.split(p.find).join(p.replace)
      }
      fs.writeFileSync(fp, text, 'utf8')
    }
  }
  return { count: total }
}
