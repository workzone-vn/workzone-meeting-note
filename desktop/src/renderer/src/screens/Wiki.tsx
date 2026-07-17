// Wiki cá nhân: ghi chú markdown + tag + wikilink [[...]] kiểu Obsidian.
// - Danh sách: tìm toàn văn, lọc tag, hỏi AI (Claude đọc note liên quan theo graph).
// - Trang note: render markdown với wikilink bấm được + backlinks; sửa/xoá.
// - Đồ thị: WikiGraph (canvas force-directed).
import { useEffect, useMemo, useState } from 'react'
import type { WikiAskResult, WikiNote, WikiNoteMeta } from '../../../shared/types'
import { Graph, PaperPlaneTilt, PencilSimple, Plus, Sparkle, Trash } from '../components/icons'
import { WikiGraph } from '../components/WikiGraph'
import { fmtMeetingTime, mdToHtml } from '../lib/format'

/** Render markdown rồi thay [[wikilink]] (đã bị escape thành text) bằng thẻ bấm được. */
function renderNoteHtml(content: string, resolved: Map<string, string | null>): string {
  return mdToHtml(content).replace(/\[\[([^\]|#]+)\]\]/g, (_m, target: string) => {
    const id = resolved.get(target.trim().toLowerCase())
    const cls = id ? 'wikilink' : 'wikilink missing'
    return `<a class="${cls}" data-wiki="${target.trim().replace(/"/g, '&quot;')}">${target.trim()}</a>`
  })
}

export function Wiki(): React.JSX.Element {
  const [notes, setNotes] = useState<WikiNoteMeta[] | null>(null)
  const [view, setView] = useState<'list' | 'graph' | { note: string }>('list')
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  // trang note
  const [note, setNote] = useState<WikiNote | null>(null)
  const [edit, setEdit] = useState<{ title: string; tags: string; content: string } | null>(null)
  // hỏi AI
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<WikiAskResult | null>(null)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = (): void => {
    void window.wz.wikiList().then(setNotes)
  }
  useEffect(reload, [])

  const openNote = (id: string): void => {
    setEdit(null)
    setNote(null)
    setView({ note: id })
    void window.wz.wikiGet(id).then(setNote)
  }

  const createNew = async (title = ''): Promise<void> => {
    const id = await window.wz.wikiCreate(title)
    reload()
    openNote(id)
    setEdit({ title: title || 'Ghi chú mới', tags: '', content: '' })
  }

  // bấm wikilink trong nội dung: có note -> mở, chưa có -> tạo mới với tên đó
  const onArticleClick = async (e: React.MouseEvent): Promise<void> => {
    const el = (e.target as HTMLElement).closest('[data-wiki]')
    if (!el) return
    const target = el.getAttribute('data-wiki') ?? ''
    const id = await window.wz.wikiResolve(target)
    if (id) openNote(id)
    else await createNew(target)
  }

  const ask = async (): Promise<void> => {
    const q = question.trim()
    if (!q || asking) return
    setAsking(true)
    setAnswer(null)
    try {
      setAnswer(await window.wz.wikiAsk(q))
    } finally {
      setAsking(false)
    }
  }

  // map "tên wikilink thường hoá" -> id để render link mờ/đậm (từ danh sách meta)
  const resolvedMap = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const n of notes ?? []) {
      m.set(n.title.toLowerCase(), n.id)
      m.set(n.id.toLowerCase(), n.id)
    }
    return m
  }, [notes])

  const allTags = useMemo(
    () => [...new Set((notes ?? []).flatMap((n) => n.tags))].sort(),
    [notes]
  )

  const q = query.trim().toLowerCase()
  const visible = (notes ?? []).filter((n) => {
    if (tagFilter && !n.tags.includes(tagFilter)) return false
    if (!q) return true
    return (
      n.title.toLowerCase().includes(q) ||
      n.tags.some((t) => t.toLowerCase().includes(q)) ||
      n.excerpt.toLowerCase().includes(q)
    )
  })

  if (notes === null) return <div className="empty">Đang tải...</div>

  // ---------- Trang note ----------
  if (typeof view === 'object') {
    if (!note) return <div className="empty">Đang tải...</div>
    return (
      <div>
        <div className="detail-head">
          <button
            className="btn"
            onClick={() => {
              setView('list')
              setNote(null)
              setEdit(null)
              reload()
            }}
          >
            ← Wiki
          </button>
          <h1 className="page-title" style={{ margin: 0 }}>
            {edit ? 'Chỉnh sửa ghi chú' : note.title}
          </h1>
        </div>
        {!edit && (
          <p className="count" style={{ marginTop: 0 }}>
            {fmtMeetingTime(note.updated)}
            {note.tags.length > 0 && (
              <>
                {' · '}
                {note.tags.map((t) => (
                  <span key={t} className="profile-tag">
                    #{t}
                  </span>
                ))}
              </>
            )}
          </p>
        )}

        {edit ? (
          <div>
            <input
              className="name-input"
              placeholder="Tiêu đề"
              value={edit.title}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
            />
            <input
              className="name-input"
              placeholder="Tags (phân cách bằng dấu phẩy): ai, marketing..."
              value={edit.tags}
              onChange={(e) => setEdit({ ...edit, tags: e.target.value })}
            />
            <textarea
              className="md-editor"
              placeholder={'Nội dung markdown. Liên kết ghi chú khác bằng [[Tiêu đề note]].'}
              value={edit.content}
              onChange={(e) => setEdit({ ...edit, content: e.target.value })}
              spellCheck={false}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                className="btn primary"
                onClick={async () => {
                  await window.wz.wikiSave(note.id, {
                    title: edit.title,
                    tags: edit.tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
                    content: edit.content
                  })
                  setEdit(null)
                  openNote(note.id)
                }}
              >
                Lưu
              </button>
              <button className="btn" onClick={() => setEdit(null)}>
                Huỷ
              </button>
            </div>
          </div>
        ) : (
          <>
            {notice && <div className="banner warn">{notice}</div>}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                className="btn"
                onClick={() =>
                  setEdit({ title: note.title, tags: note.tags.join(', '), content: note.content })
                }
              >
                <PencilSimple size={15} /> Chỉnh sửa
              </button>
              <button
                className="btn"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true)
                  setNotice(null)
                  try {
                    const body = renderNoteHtml(note.content, resolvedMap)
                    const r = await window.wz.wikiExportPdf(note.id, body)
                    if (r.saved) {
                      setNotice(`Đã xuất PDF: ${r.saved}`)
                      setTimeout(() => setNotice(null), 4000)
                    }
                  } catch (e) {
                    setNotice(`Xuất PDF lỗi: ${e instanceof Error ? e.message : e}`)
                  } finally {
                    setExporting(false)
                  }
                }}
              >
                {exporting ? 'Đang xuất...' : 'Xuất PDF'}
              </button>
              <button
                className="btn danger-hover"
                style={{ marginLeft: 'auto' }}
                onClick={async () => {
                  const r = await window.wz.wikiDelete(note.id)
                  if (r.deleted) {
                    setView('list')
                    setNote(null)
                    reload()
                  }
                }}
              >
                <Trash size={15} /> Xoá
              </button>
            </div>
            <article
              className="doc"
              onClick={(e) => void onArticleClick(e)}
              dangerouslySetInnerHTML={{ __html: renderNoteHtml(note.content, resolvedMap) }}
            />
            {note.backlinks.length > 0 && (
              <div className="card" style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
                  Liên kết đến đây
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {note.backlinks.map((b) => (
                    <button key={b.id} className="profile-chip" onClick={() => openNote(b.id)}>
                      {b.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ---------- Đồ thị ----------
  if (view === 'graph') {
    return (
      <div>
        <div className="detail-head">
          <button className="btn" onClick={() => setView('list')}>
            ← Wiki
          </button>
          <h1 className="page-title" style={{ margin: 0 }}>
            Đồ thị kiến thức
          </h1>
        </div>
        <p className="count" style={{ marginTop: 0 }}>
          Chấm xám = ghi chú (bấm để mở), chấm xanh = #tag. Kéo để sắp xếp.
        </p>
        <WikiGraph
          notes={notes}
          onOpenNote={openNote}
          onOpenTag={(t) => {
            setTagFilter(t)
            setView('list')
          }}
        />
      </div>
    )
  }

  // ---------- Danh sách ----------
  return (
    <div>
      <h1 className="page-title">Wiki</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className="btn primary" onClick={() => void createNew()}>
          <Plus size={15} /> Ghi chú mới
        </button>
        <button className="btn" onClick={() => setView('graph')} disabled={notes.length === 0}>
          <Graph size={15} /> Đồ thị
        </button>
      </div>

      <div className="card wiki-ask">
        <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
          <Sparkle size={15} /> Hỏi Wiki (AI đọc các ghi chú liên quan rồi trả lời)
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="name-input"
            style={{ marginBottom: 0, flex: 1 }}
            placeholder="Ví dụ: mình đã note gì về cách viết prompt?"
            value={question}
            disabled={asking}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void ask()}
          />
          <button className="btn primary" disabled={asking || !question.trim()} onClick={() => void ask()}>
            {asking ? <span className="spinner" /> : <PaperPlaneTilt size={16} />}
          </button>
        </div>
        {asking && (
          <div className="revise-working" style={{ marginTop: 10 }}>
            <span className="spinner" /> Đang đọc wiki và trả lời...
          </div>
        )}
        {answer && !answer.ok && (
          <div className="banner error" style={{ marginTop: 10, marginBottom: 0 }}>
            {answer.errorCode === 'NO_CLAUDE'
              ? 'Chưa thấy Claude Code trên máy nên chưa hỏi được.'
              : `Hỏi không thành công: ${answer.message || 'lỗi không rõ'}`}
          </div>
        )}
        {answer?.ok && (
          <div style={{ marginTop: 12 }}>
            <article
              className="doc wiki-answer"
              dangerouslySetInnerHTML={{ __html: mdToHtml(answer.answer ?? '') }}
            />
            {(answer.sources?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <span className="profile-label">Nguồn:</span>
                {answer.sources!.map((s) => (
                  <button key={s.id} className="profile-chip" onClick={() => openNote(s.id)}>
                    {s.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="searchbar">
        <input
          type="search"
          placeholder="Tìm trong wiki..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {allTags.length > 0 && (
        <div className="profile-row" style={{ justifyContent: 'flex-start' }}>
          <span className="profile-label">Tag:</span>
          <button
            className={`profile-chip ${tagFilter === '' ? 'active' : ''}`}
            onClick={() => setTagFilter('')}
          >
            Tất cả
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              className={`profile-chip ${tagFilter === t ? 'active' : ''}`}
              onClick={() => setTagFilter(tagFilter === t ? '' : t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {notes.length === 0 && (
        <div className="empty">
          Chưa có ghi chú nào. Học online thấy gì hay thì bấm <b>Ghi chú mới</b> lưu lại - sau tra
          cứu bằng ô hỏi AI phía trên.
        </div>
      )}
      {visible.map((n) => (
        <div key={n.id} className="meeting-row" onClick={() => openNote(n.id)}>
          <div>
            <div className="m-name">
              {n.title}
              {n.tags.map((t) => (
                <span key={t} className="profile-tag">
                  #{t}
                </span>
              ))}
            </div>
            <div className="m-meta">
              {fmtMeetingTime(n.updated)}
              {n.excerpt ? ` · ${n.excerpt}` : ''}
            </div>
          </div>
          {n.links.length > 0 && <span className="badge on">{n.links.length} liên kết</span>}
        </div>
      ))}
      {q && visible.length === 0 && notes.length > 0 && (
        <div className="empty">Không tìm thấy ghi chú nào khớp.</div>
      )}
    </div>
  )
}
