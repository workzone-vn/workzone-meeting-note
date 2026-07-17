// Port các helper hiển thị từ render.py để UI app khớp viewer/PDF.

/** hh:mm:ss (bỏ giờ nếu 0) - giống render.py _ts */
export function ts(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`
}

/** hh:mm:ss đầy đủ cho đồng hồ đang ghi */
export function tsFull(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const VN_WEEKDAY = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

/** '13h30 Thứ Tư, ngày 24/06/2026' - giống render.py fmt_meeting_time */
export function fmtMeetingTime(started: number | null): string {
  if (!started) return ''
  const d = new Date(started * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}h${pad(d.getMinutes())} ${VN_WEEKDAY[d.getDay()]}, ngày ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** 'hop-20260709-1405' -> 'Hop 20260709 1405' - giống render.py _title */
export function titleCase(name: string): string {
  return name
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** Lọc nhiễu hallucination của Whisper - port render.py clean_noise */
export function cleanNoise(text: string): { text: string; isNoise: boolean } {
  const tokens = text.split(/\s+/).filter(Boolean)
  if (!tokens.length) return { text, isNoise: true }
  const collapsed: string[] = []
  let i = 0
  const n = tokens.length
  while (i < n) {
    let j = i
    while (j < n && tokens[j].toLowerCase() === tokens[i].toLowerCase()) j++
    if (j - i >= 4) collapsed.push(tokens[i], '…')
    else collapsed.push(...tokens.slice(i, j))
    i = j
  }
  const newText = collapsed.join(' ').trim()
  if (tokens.length >= 5 && new Set(tokens.map((t) => t.toLowerCase())).size <= 2) {
    return { text: newText, isNoise: true }
  }
  if (!collapsed.some((t) => t !== '…' && t.length > 1)) return { text: newText, isNoise: true }
  return { text: newText, isNoise: false }
}

export interface MdSection {
  title: string
  body: string
}

/** Tách biên bản thành phần mở đầu (tiêu đề + thời gian...) và các đề mục `## ` */
export function splitMdSections(md: string): { preamble: string; sections: MdSection[] } {
  const sections: MdSection[] = []
  const pre: string[] = []
  let cur: MdSection | null = null
  for (const line of md.split('\n')) {
    const m = line.match(/^##\s+(.*)/)
    if (m) {
      cur = { title: m[1].trim(), body: line + '\n' }
      sections.push(cur)
    } else if (cur) {
      cur.body += line + '\n'
    } else {
      pre.push(line)
    }
  }
  return { preamble: pre.join('\n').trim(), sections }
}

export interface ActionItem {
  name: string
  assignee: string
  due: string
}

/** Đọc bảng "Action items" trong biên bản -> danh sách việc (name/assignee/due).
 * Tìm đề mục chứa "Action item" (không phân biệt hoa thường), rồi đọc bảng markdown
 * ngay sau đó: bỏ dòng phân cách `|---|` + dòng header, mỗi dòng dữ liệu lấy 3 cột đầu.
 * Không có section/bảng -> []. Cột thiếu -> chuỗi rỗng. */
export function parseActionItems(md: string): ActionItem[] {
  const lines = md.split('\n')
  let i = lines.findIndex((l) => /^#{1,6}\s/.test(l) && /action item/i.test(l))
  if (i === -1) return []
  i++
  // bỏ qua dòng rỗng ngay trước bảng
  while (i < lines.length && !lines[i].trim()) i++
  // dừng nếu tới đề mục mới / dòng không phải bảng trước khi gặp bảng
  if (i >= lines.length || !lines[i].trimStart().startsWith('|')) return []
  const rows: string[][] = []
  while (i < lines.length && lines[i].trimStart().startsWith('|')) {
    rows.push(
      lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
    )
    i++
  }
  // bỏ dòng phân cách (|---|), rồi bỏ dòng header (dòng đầu còn lại)
  const dataRows = rows.filter((r) => !r.every((c) => /^[-: ]*$/.test(c))).slice(1)
  return dataRows.map((r) => ({ name: r[0] ?? '', assignee: r[1] ?? '', due: r[2] ?? '' }))
}

/** Chuyển Markdown biên bản -> định dạng Slack (mrkdwn):
 * heading -> dòng *đậm*, **x** -> *x*, bullet '-' -> '•',
 * bảng -> gạch đầu dòng (Slack không render bảng). */
export function mdToSlack(md: string): string {
  const inline = (s: string): string =>
    s.replace(/<br\s*\/?>/gi, ' ').replace(/\*\*(.+?)\*\*/g, '*$1*')
  const out: string[] = []
  const lines = md.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trimStart().startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
        if (!cells.every((c) => /^[-: ]*$/.test(c))) rows.push(cells)
        i++
      }
      // bỏ hàng tiêu đề; mỗi hàng dữ liệu thành 1 bullet "Việc — Người · Deadline"
      for (const r of rows.slice(1)) {
        const [first, ...rest] = r.filter((c) => c !== '')
        out.push(`• ${inline(first ?? '')}${rest.length ? ' — ' + rest.map(inline).join(' · ') : ''}`)
      }
      continue
    }
    const h = line.match(/^#{1,6}\s+(.*)/)
    if (h) {
      out.push(`*${inline(h[1]).replace(/\*/g, '')}*`)
      i++
      continue
    }
    if (line.trim() === '---') {
      i++
      continue
    }
    out.push(inline(line.replace(/^(\s*)[-*]\s+/, '$1• ')))
    i++
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function mdInline(s: string): string {
  let out = escapeHtml(s)
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/`(.+?)`/g, '<code>$1</code>')
  // quy ước biên bản dùng <br> để xuống dòng -> trả lại thẻ thật sau khi escape
  out = out.replace(/&lt;br\s*\/?&gt;/gi, '<br>')
  return out
}

/** Render tập con Markdown của biên bản - port render.py md_to_html
 * (heading, bảng, blockquote, list, hr, đoạn văn; inline bold + code). */
export function mdToHtml(md: string): string {
  const out: string[] = []
  const lines = md.split('\n')
  const n = lines.length
  let i = 0
  while (i < n) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    if (line.trimStart().startsWith('|')) {
      const rows: string[] = []
      while (i < n && lines[i].trimStart().startsWith('|')) {
        rows.push(lines[i])
        i++
      }
      let cells = rows.map((r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
      cells = cells.filter((r) => !r.every((c) => [...c].every((ch) => '-: '.includes(ch))))
      if (cells.length) {
        out.push(
          '<div class="tbl-wrap"><table><thead><tr>' +
            cells[0].map((c) => `<th>${mdInline(c)}</th>`).join('') +
            '</tr></thead><tbody>'
        )
        for (const r of cells.slice(1)) {
          out.push('<tr>' + r.map((c) => `<td>${mdInline(c)}</td>`).join('') + '</tr>')
        }
        out.push('</tbody></table></div>')
      }
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)/)
    if (h) {
      const lvl = h[1].length
      out.push(`<h${lvl}>${mdInline(h[2])}</h${lvl}>`)
      i++
      continue
    }
    if (line.trimStart().startsWith('>')) {
      const buf: string[] = []
      while (i < n && lines[i].trimStart().startsWith('>')) {
        buf.push(lines[i].trimStart().slice(1).trim())
        i++
      }
      out.push(`<blockquote>${mdInline(buf.join(' '))}</blockquote>`)
      continue
    }
    const isListLine = (l: string): boolean => /^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)
    if (isListLine(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line)
      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag}>`)
      while (i < n && isListLine(lines[i])) {
        out.push(`<li>${mdInline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`)
        i++
      }
      out.push(`</${tag}>`)
      continue
    }
    if (line.trim() === '---') {
      out.push('<hr>')
      i++
      continue
    }
    const buf = [line]
    i++
    while (i < n && lines[i].trim() && !/^(#{1,6}\s|\s*[-*]\s|\s*\d+\.\s|\||>|---)/.test(lines[i])) {
      buf.push(lines[i])
      i++
    }
    out.push(`<p>${mdInline(buf.join(' '))}</p>`)
  }
  return out.join('\n')
}
