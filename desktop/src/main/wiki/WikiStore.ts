// Wiki = thư mục file markdown thường tại ~/wz-bien-ban/wiki/ (sync/sửa ngoài app
// được, engine wiki-ask và MCP đọc chung). Mỗi note có frontmatter title/tags/updated;
// id = tên file không đuôi, ổn định kể cả khi đổi title (wikilink resolve theo
// title hoặc slug nên đổi title vẫn tự nối lại theo title mới).
import * as fs from 'fs'
import * as path from 'path'
import type { WikiNote, WikiNoteMeta } from '../../shared/types'
import { wikiDir } from '../paths'

const WIKILINK_RE = /\[\[([^\]|#]+)\]\]/g

/** Slug tên file từ title: bỏ dấu tiếng Việt, thường hoá, gạch nối. */
export function slugify(title: string): string {
  const s = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'ghi-chu'
}

interface Parsed {
  title: string
  tags: string[]
  updated: number
  content: string
}

/** Frontmatter tối giản (title/tags/updated) - không dùng thư viện YAML. */
function parseNote(raw: string, fallbackTitle: string): Parsed {
  let title = fallbackTitle
  let tags: string[] = []
  let updated = 0
  let content = raw
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  if (m) {
    content = raw.slice(m[0].length)
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':')
      if (i < 0) continue
      const key = line.slice(0, i).trim()
      const val = line.slice(i + 1).trim()
      if (key === 'title' && val) title = val
      else if (key === 'tags') {
        tags = val
          .split(',')
          .map((t) => t.trim().replace(/^#/, ''))
          .filter(Boolean)
      } else if (key === 'updated') updated = Number(val) || 0
    }
  }
  return { title, tags, updated, content }
}

function serializeNote(title: string, tags: string[], updated: number, content: string): string {
  return `---\ntitle: ${title}\ntags: ${tags.join(', ')}\nupdated: ${Math.round(updated)}\n---\n${content}`
}

function noteFile(id: string): string {
  // chặn path traversal như meetingDir
  if (!id || id !== path.basename(id) || id.startsWith('.')) {
    throw new Error(`Tên ghi chú không hợp lệ: ${id}`)
  }
  return path.join(wikiDir, `${id}.md`)
}

function readAll(): Map<string, Parsed> {
  const out = new Map<string, Parsed>()
  if (!fs.existsSync(wikiDir)) return out
  for (const f of fs.readdirSync(wikiDir)) {
    if (!f.endsWith('.md') || f.startsWith('.')) continue
    const id = f.slice(0, -3)
    try {
      const raw = fs.readFileSync(path.join(wikiDir, f), 'utf8')
      const p = parseNote(raw, id)
      if (!p.updated) p.updated = Math.round(fs.statSync(path.join(wikiDir, f)).mtimeMs / 1000)
      out.set(id, p)
    } catch {
      /* file hỏng - bỏ qua */
    }
  }
  return out
}

/** Resolve 1 wikilink theo title (không phân biệt hoa thường) hoặc slug. */
function resolveLink(target: string, notes: Map<string, Parsed>): string | null {
  const t = target.trim().toLowerCase()
  for (const [id, p] of notes) {
    if (p.title.toLowerCase() === t || id === slugify(target)) return id
  }
  return null
}

function extractLinks(
  content: string,
  notes: Map<string, Parsed>
): { links: string[]; unresolved: string[] } {
  const links = new Set<string>()
  const unresolved = new Set<string>()
  for (const m of content.matchAll(WIKILINK_RE)) {
    const id = resolveLink(m[1], notes)
    if (id) links.add(id)
    else unresolved.add(m[1].trim())
  }
  return { links: [...links], unresolved: [...unresolved] }
}

export function listNotes(): WikiNoteMeta[] {
  const notes = readAll()
  const metas: WikiNoteMeta[] = []
  for (const [id, p] of notes) {
    const { links, unresolved } = extractLinks(p.content, notes)
    const firstLine = p.content
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#')) // bỏ heading để excerpt là nội dung thật
    metas.push({
      id,
      title: p.title,
      tags: p.tags,
      updated: p.updated,
      excerpt: (firstLine ?? '').slice(0, 140),
      links: links.filter((l) => l !== id),
      unresolved
    })
  }
  metas.sort((a, b) => b.updated - a.updated)
  return metas
}

export function getNote(id: string): WikiNote {
  const notes = readAll()
  const p = notes.get(id)
  if (!p) throw new Error(`Không thấy ghi chú: ${id}`)
  const backlinks: { id: string; title: string }[] = []
  for (const [otherId, other] of notes) {
    if (otherId === id) continue
    const { links } = extractLinks(other.content, notes)
    if (links.includes(id)) backlinks.push({ id: otherId, title: other.title })
  }
  return { id, title: p.title, tags: p.tags, updated: p.updated, content: p.content, backlinks }
}

/** Tạo note mới, tên file slug từ title (thêm -2, -3... nếu trùng). */
export function createNote(title: string, content = ''): string {
  fs.mkdirSync(wikiDir, { recursive: true })
  const t = title.trim() || 'Ghi chú mới'
  const base = slugify(t)
  let id = base
  for (let i = 2; fs.existsSync(noteFile(id)); i++) id = `${base}-${i}`
  fs.writeFileSync(noteFile(id), serializeNote(t, [], Date.now() / 1000, content), 'utf8')
  return id
}

export function saveNote(
  id: string,
  patch: { title: string; tags: string[]; content: string }
): void {
  if (!fs.existsSync(noteFile(id))) throw new Error(`Không thấy ghi chú: ${id}`)
  fs.writeFileSync(
    noteFile(id),
    serializeNote(patch.title.trim() || id, patch.tags, Date.now() / 1000, patch.content),
    'utf8'
  )
}

export function deleteNote(id: string): void {
  fs.rmSync(noteFile(id), { force: true })
}

/** Resolve tên wikilink -> id (cho renderer bấm link/tạo mới). */
export function resolveTitle(target: string): string | null {
  return resolveLink(target, readAll())
}
