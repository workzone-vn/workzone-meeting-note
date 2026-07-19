// Wiki cá nhân: ghi chú markdown + tag + wikilink [[...]] kiểu Obsidian.
// - Danh sách: tìm toàn văn, lọc tag, hỏi AI (Claude đọc note liên quan theo graph).
// - Trang note: render markdown với wikilink bấm được + backlinks; sửa/xoá.
// - Đồ thị: WikiGraph (canvas force-directed).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { WikiAskResult, WikiNote, WikiNoteMeta } from '../../../shared/types'
import {
  ArrowsClockwise,
  Copy,
  DownloadSimple,
  Graph,
  PaperPlaneTilt,
  Plus,
  Sparkle,
  Trash
} from '../components/icons'
import { NoteEditor } from '../components/NoteEditor'
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
  // trang note (editor luôn-sửa-được; draft phản chiếu title/tags/content hiện tại)
  const [note, setNote] = useState<WikiNote | null>(null)
  const [draft, setDraft] = useState<{ title: string; tags: string; content: string }>({
    title: '',
    tags: '',
    content: ''
  })
  // hỏi AI
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<WikiAskResult | null>(null)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  // Guard đồng bộ (synchronous) chống double-click trước khi gitSyncConfigGet
  // resolve — setSyncing(true) chạy SAU await nên state syncing không kịp chặn
  // click thứ 2 gần như đồng thời (race gây 2 sync chạy song song trên cùng git tree).
  const syncingRef = useRef(false)

  const reload = (): void => {
    void window.wz.wikiList().then(setNotes)
  }
  useEffect(reload, [])

  const openNote = (id: string): void => {
    setNote(null)
    setView({ note: id })
    void window.wz.wikiGet(id).then(setNote)
  }

  // Đồng bộ draft khi mở note khác (dùng note.id để không reset lúc reload cùng note).
  useEffect(() => {
    if (note) setDraft({ title: note.title, tags: note.tags.join(', '), content: note.content })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

  const parseTags = (s: string): string[] =>
    s.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean)

  // Lưu note: gộp patch vào draft rồi ghi xuống đĩa (title/tags/content).
  const saveNote = async (patch: Partial<typeof draft>): Promise<typeof draft> => {
    const next = { ...draft, ...patch }
    setDraft(next)
    if (note) {
      await window.wz.wikiSave(note.id, {
        title: next.title.trim() || 'Ghi chú mới',
        tags: parseTags(next.tags),
        content: next.content
      })
    }
    return next
  }

  const createNew = async (title = ''): Promise<void> => {
    const id = await window.wz.wikiCreate(title)
    reload()
    openNote(id)
  }

  // bấm wikilink trong editor: có note -> mở, chưa có -> tạo mới với tên đó
  const handleWikilinkClick = async (target: string): Promise<void> => {
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

  const runSync = async (): Promise<void> => {
    if (syncingRef.current) return
    syncingRef.current = true
    const { config } = await window.wz.gitSyncConfigGet()
    if (!config.repoUrl) {
      syncingRef.current = false
      setSyncNote('Chưa cấu hình repo — vào Cài đặt để thiết lập.')
      setTimeout(() => setSyncNote(null), 4000)
      return
    }
    setSyncing(true)
    setSyncNote('Đang đồng bộ...')
    const off = window.wz.onGitSyncProgress((p) => {
      const label: Record<string, string> = {
        start: 'Bắt đầu...',
        commit: 'Lưu thay đổi...',
        fetch: 'Tải về...',
        merge: 'Gộp...',
        push: 'Đẩy lên...',
        done: 'Xong.'
      }
      setSyncNote(label[p] ?? 'Đang đồng bộ...')
    })
    try {
      const res = await window.wz.gitSyncNow()
      setSyncNote(
        res.status === 'conflict'
          ? `Có xung đột ở: ${(res.conflicts ?? []).join(', ')}. Đã giữ cả 2 bản — bản của máy kia nằm ở file "<tên>.remote-*". Xem, gộp thủ công rồi xoá file .remote.`
          : 'Đồng bộ thành công.'
      )
      reload()
    } catch (e) {
      setSyncNote(`Lỗi đồng bộ: ${(e as Error).message}`)
    } finally {
      off()
      setSyncing(false)
      syncingRef.current = false
      setTimeout(() => setSyncNote(null), 6000)
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
      <div className="wiki-note-view">
        <div className="detail-head">
          <button
            className="btn"
            onClick={() => {
              setView('list')
              setNote(null)
              reload()
            }}
          >
            ← Wiki
          </button>
          <p className="count" style={{ margin: 0 }}>
            {fmtMeetingTime(note.updated)}
          </p>
        </div>

        {notice && <div className="banner warn">{notice}</div>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            className="btn"
            onClick={async () => {
              await saveNote({})
              await window.wz.wikiCopyMarkdown(note.id)
              setNotice('Đã copy Markdown vào clipboard')
              setTimeout(() => setNotice(null), 2500)
            }}
          >
            <Copy size={15} /> Copy Markdown
          </button>
          <button
            className="btn"
            onClick={async () => {
              try {
                await saveNote({})
                const r = await window.wz.wikiExportMarkdown(note.id)
                if (r.saved) {
                  setNotice(`Đã tải: ${r.saved}`)
                  setTimeout(() => setNotice(null), 4000)
                }
              } catch (e) {
                setNotice(`Tải .md lỗi: ${e instanceof Error ? e.message : e}`)
              }
            }}
          >
            <DownloadSimple size={15} /> Tải .md
          </button>
          <button
            className="btn"
            disabled={exporting}
            onClick={async () => {
              setExporting(true)
              setNotice(null)
              try {
                await saveNote({})
                const body = renderNoteHtml(draft.content, resolvedMap)
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

        <input
          className="note-title-input"
          placeholder="Tiêu đề ghi chú"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onBlur={() => void saveNote({})}
        />
        <input
          className="note-tags-input"
          placeholder="Tags (phân cách bằng dấu phẩy): ai, marketing…"
          value={draft.tags}
          onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
          onBlur={() => void saveNote({})}
        />

        <NoteEditor
          key={note.id}
          markdown={note.content}
          onChange={(md) => void saveNote({ content: md })}
          onClickWikilink={(t) => void handleWikilinkClick(t)}
        />

        {note.backlinks.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>Liên kết đến đây</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {note.backlinks.map((b) => (
                <button key={b.id} className="profile-chip" onClick={() => openNote(b.id)}>
                  {b.title}
                </button>
              ))}
            </div>
          </div>
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
        <button className="btn" onClick={() => void runSync()} disabled={syncing}>
          <ArrowsClockwise size={15} /> {syncing ? 'Đang đồng bộ...' : 'Sync GitHub'}
        </button>
      </div>
      {syncNote && <div className="banner warn" style={{ marginBottom: 14 }}>{syncNote}</div>}

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
