import { useEffect, useMemo, useState } from 'react'
import type { MeetingDetail as Detail } from '../../../shared/types'
import { ArrowsClockwise, ChatCircle, Check, PencilSimple, Sparkle, Timer, Trash } from '../components/icons'
import { ReviseChat } from '../components/ReviseChat'
import {
  cleanNoise,
  fmtMeetingTime,
  mdToHtml,
  mdToSlack,
  parseActionItems,
  splitMdSections,
  titleCase,
  ts
} from '../lib/format'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function Highlight({ text, query }: { text: string; query: string }): React.JSX.Element {
  if (!query) return <>{text}</>
  const re = new RegExp(`(${escapeRegExp(query)})`, 'gi')
  const parts = text.split(re)
  return (
    <>{parts.map((p, i) => (p.toLowerCase() === query.toLowerCase() ? <mark key={i}>{p}</mark> : p))}</>
  )
}

export function MeetingDetail({
  name,
  onBack
}: {
  name: string
  onBack: () => void
}): React.JSX.Element {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [profiles, setProfiles] = useState<string[]>([])
  const [tab, setTab] = useState<'bienban' | 'transcript'>('bienban')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<string | null>(null) // null = không ở chế độ sửa
  const [titleDraft, setTitleDraft] = useState<string | null>(null) // null = không sửa tiêu đề
  const [showFR, setShowFR] = useState(false)
  const [frPairs, setFrPairs] = useState<{ find: string; replace: string }[]>([
    { find: '', replace: '' }
  ])
  const [frTranscript, setFrTranscript] = useState(true)
  const [showSlack, setShowSlack] = useState(false)
  const [slackSel, setSlackSel] = useState<boolean[]>([])
  const [added, setAdded] = useState<Set<number>>(new Set()) // dòng action item đã bấm thêm

  const reload = (): void => {
    void window.wz.meetingsGet(name).then(setDetail)
  }
  useEffect(reload, [name])
  // pipeline nền xử lý đúng cuộc này xong -> nạp lại transcript/biên bản
  useEffect(() => {
    return window.wz.onPipelineProgress((p) => {
      if (p.meetingName === name && (p.stage === 'done' || p.stage === 'error')) reload()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])
  useEffect(() => setAdded(new Set()), [name]) // đổi cuộc họp -> reset trạng thái "đã thêm"
  useEffect(() => {
    void window.wz.profilesList().then(setProfiles)
  }, [])

  // Action items trong biên bản (nếu có) -> panel "Việc cần làm"
  const actionItems = useMemo(
    () => (detail?.bienBanMd ? parseActionItems(detail.bienBanMd) : []),
    [detail]
  )

  // Lọc nhiễu như viewer.html (clean_noise của render.py)
  const lines = useMemo(() => {
    if (!detail) return []
    return detail.segments
      .map((s) => ({ start: s.start, ...cleanNoise(s.text) }))
      .filter((l) => !l.isNoise)
  }, [detail])

  const q = query.trim().toLowerCase()
  const visible = q ? lines.filter((l) => l.text.toLowerCase().includes(q)) : lines

  if (!detail) return <div className="empty">Đang tải...</div>

  const exportPdf = async (): Promise<void> => {
    setBusy('pdf')
    setNotice(null)
    try {
      await window.wz.meetingsExportPdf(name)
      setNotice('Đã xuất PDF mới.')
      reload()
    } catch (e) {
      setNotice(`Xuất PDF lỗi: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="detail-head">
        <button className="btn" onClick={onBack}>
          ← Danh sách
        </button>
        {titleDraft !== null ? (
          <input
            className="name-input title-edit"
            style={{ marginBottom: 0, flex: 1 }}
            value={titleDraft}
            autoFocus
            placeholder="Tiêu đề cuộc họp (để trống = dùng tên thư mục)"
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Escape') setTitleDraft(null)
              if (e.key === 'Enter') {
                await window.wz.meetingsSetTitle(name, titleDraft)
                setTitleDraft(null)
                reload()
              }
            }}
            onBlur={async () => {
              await window.wz.meetingsSetTitle(name, titleDraft)
              setTitleDraft(null)
              reload()
            }}
          />
        ) : (
          <h1 className="page-title" style={{ margin: 0 }}>
            {detail.title || titleCase(detail.name)}
          </h1>
        )}
        <button
          className="btn icon-btn"
          title="Sửa tiêu đề (Enter lưu, Esc huỷ; xoá bớt chữ thoải mái)"
          disabled={titleDraft !== null}
          onClick={() => setTitleDraft(detail.title || titleCase(detail.name))}
        >
          <PencilSimple size={16} />
        </button>
        <button
          className="btn icon-btn"
          title="Đặt tiêu đề tự động từ nội dung (biên bản/transcript)"
          disabled={busy !== null || (!detail.bienBanMd && detail.segments.length === 0)}
          onClick={async () => {
            setBusy('title')
            setNotice(null)
            try {
              const r = await window.wz.meetingsGenerateTitle(name)
              if (r.ok) {
                reload()
                setNotice(`Đã đặt tiêu đề: ${r.title}`)
              } else if (r.errorCode === 'NO_CLAUDE') {
                setNotice('Chưa có biên bản và thiếu Claude Code nên chưa đặt tiêu đề được.')
              } else {
                setNotice(`Đặt tiêu đề lỗi: ${r.message || 'không rõ nguyên nhân'}`)
              }
              setTimeout(() => setNotice(null), 4000)
            } finally {
              setBusy(null)
            }
          }}
        >
          {busy === 'title' ? <span className="spinner" /> : <Sparkle size={16} />}
        </button>
      </div>
      <p className="count" style={{ marginTop: 0 }}>
        {fmtMeetingTime(detail.started)}
        {detail.duration ? (
          <>
            {' · '}
            <Timer size={13} /> {ts(detail.duration)}
          </>
        ) : (
          ''
        )}
        {' · '}
        <ChatCircle size={13} /> {lines.length} đoạn lời
      </p>

      {profiles.length > 0 && (
        <div className="profile-row" style={{ justifyContent: 'flex-start', marginBottom: 14 }}>
          <span className="profile-label">Ngữ cảnh:</span>
          {profiles.map((p) => (
            <button
              key={p}
              className={`profile-chip ${detail.profiles.includes(p) ? 'active' : ''}`}
              title="Chọn/bỏ nhiều hồ sơ - đổi xong bấm 'Viết lại biên bản' để áp dụng"
              onClick={async () => {
                const next = detail.profiles.includes(p)
                  ? detail.profiles.filter((x) => x !== p)
                  : [...detail.profiles, p]
                await window.wz.meetingsSetProfiles(name, next)
                reload()
                setNotice(
                  `Ngữ cảnh: ${next.length ? next.join(' + ') : '(trống)'}. Bấm "Viết lại biên bản" để tạo lại theo bộ hồ sơ này.`
                )
              }}
            >
              {detail.profiles.includes(p) && <Check size={13} />} {p}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className="btn" disabled={!detail.bienBanMd || busy !== null} onClick={() => void exportPdf()}>
          {busy === 'pdf' ? 'Đang xuất...' : 'Xuất PDF'}
        </button>
        <button
          className="btn"
          disabled={!detail.bienBanMd || editDraft !== null}
          onClick={() => {
            setTab('bienban')
            setEditDraft(detail.bienBanMd ?? '')
          }}
        >
          <PencilSimple size={15} /> Chỉnh sửa
        </button>
        <button className="btn" onClick={() => setShowFR((v) => !v)}>
          <ArrowsClockwise size={15} /> Tìm & thay thế
        </button>
        <button className="btn" disabled={!detail.hasPdf} onClick={() => void window.wz.meetingsOpenPdf(name)}>
          Mở PDF
        </button>
        <button
          className="btn"
          disabled={!detail.bienBanMd}
          title="Copy nội dung biên bản (Markdown) để dán vào chat/email"
          onClick={async () => {
            await navigator.clipboard.writeText(detail.bienBanMd ?? '')
            setNotice('Đã copy biên bản (Markdown).')
            setTimeout(() => setNotice(null), 2000)
          }}
        >
          Copy biên bản
        </button>
        <button
          className="btn"
          disabled={!detail.bienBanMd}
          title="Copy theo định dạng Slack: chọn đề mục cần gửi, heading thành chữ đậm, bảng thành gạch đầu dòng"
          onClick={() => {
            if (showSlack) {
              setShowSlack(false)
              return
            }
            const { sections } = splitMdSections(detail.bienBanMd ?? '')
            // mặc định chỉ tick đề mục 1 và 2 (Tóm tắt + Action items)
            let sel = sections.map((s) => /^[12][.)]\s/.test(s.title))
            if (!sel.some(Boolean)) sel = sections.map((_, i) => i < 2)
            setSlackSel(sel)
            setShowSlack(true)
          }}
        >
          Copy cho Slack
        </button>
        <button className="btn" onClick={() => void window.wz.meetingsOpenFolder(name)}>
          Mở thư mục
        </button>
        <button
          className="btn"
          disabled={detail.segments.length === 0 || busy !== null}
          title="Viết lại biên bản từ transcript bằng Claude"
          onClick={async () => {
            const r = await window.wz.meetingsWriteMinutes(name)
            setNotice(
              r.started
                ? 'Đang viết lại biên bản bằng Claude (chạy nền)... xong sẽ tự cập nhật ở đây.'
                : `Đang xử lý cuộc "${r.busyWith ?? ''}" - mỗi lúc một cuộc, xong bấm lại nhé.`
            )
          }}
        >
          Viết lại biên bản
        </button>
        <button
          className="btn danger-hover"
          style={{ marginLeft: 'auto' }}
          title="Xoá vĩnh viễn cuộc họp này"
          onClick={async () => {
            const r = await window.wz.meetingsDelete(name) // main hiện dialog confirm
            if (r.deleted) onBack()
          }}
        >
          <Trash size={15} /> Xoá cuộc họp
        </button>
      </div>

      {notice && <div className="banner warn">{notice}</div>}

      {showSlack && detail.bienBanMd && (
        <div className="card">
          <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
            Copy cho Slack - chọn đề mục cần gửi
          </div>
          {splitMdSections(detail.bienBanMd).sections.map((s, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <input
                type="checkbox"
                checked={slackSel[i] ?? false}
                onChange={(e) =>
                  setSlackSel((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
                }
              />
              {s.title.replace(/\*/g, '')}
            </label>
          ))}
          <div className="banner-actions" style={{ marginTop: 10 }}>
            <button
              className="btn primary"
              disabled={!slackSel.some(Boolean)}
              onClick={async () => {
                const { preamble, sections } = splitMdSections(detail.bienBanMd ?? '')
                const md = [preamble, ...sections.filter((_, i) => slackSel[i]).map((s) => s.body)]
                  .filter(Boolean)
                  .join('\n')
                await navigator.clipboard.writeText(mdToSlack(md))
                setShowSlack(false)
                setNotice('Đã copy cho Slack - dán vào Slack, khi gửi sẽ tự in đậm.')
                setTimeout(() => setNotice(null), 2500)
              }}
            >
              Copy
            </button>
            <button className="btn" onClick={() => setShowSlack(false)}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {showFR && (
        <div className="card">
          <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
            Tìm & thay thế hàng loạt
          </div>
          <div className="hint" style={{ fontSize: '0.84rem', color: 'var(--muted)', marginBottom: 10 }}>
            Sửa tên riêng/thuật ngữ nghe sai trong toàn bộ nội dung. Xuất PDF lại sẽ theo nội dung
            đã sửa.
          </div>
          {frPairs.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                className="name-input"
                style={{ marginBottom: 0, flex: 1 }}
                placeholder="Tìm..."
                value={p.find}
                onChange={(e) =>
                  setFrPairs((prev) => prev.map((x, j) => (j === i ? { ...x, find: e.target.value } : x)))
                }
              />
              <span style={{ alignSelf: 'center', color: 'var(--muted)' }}>→</span>
              <input
                className="name-input"
                style={{ marginBottom: 0, flex: 1 }}
                placeholder="Thay bằng..."
                value={p.replace}
                onChange={(e) =>
                  setFrPairs((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, replace: e.target.value } : x))
                  )
                }
              />
              <button
                className="btn"
                title="Xoá dòng"
                disabled={frPairs.length === 1}
                onClick={() => setFrPairs((prev) => prev.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => setFrPairs((prev) => [...prev, { find: '', replace: '' }])}>
              + Thêm dòng
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem' }}>
              <input
                type="checkbox"
                checked={frTranscript}
                onChange={(e) => setFrTranscript(e.target.checked)}
              />
              Áp dụng cả transcript
            </label>
            <button
              className="btn primary"
              style={{ marginLeft: 'auto' }}
              disabled={busy !== null || frPairs.every((p) => !p.find)}
              onClick={async () => {
                setBusy('fr')
                try {
                  const r = await window.wz.meetingsFindReplace(
                    name,
                    frPairs.filter((p) => p.find),
                    { bienban: true, transcript: frTranscript }
                  )
                  setNotice(
                    r.count > 0
                      ? `Đã thay ${r.count} chỗ. Bấm "Xuất PDF" để cập nhật file PDF.`
                      : 'Không tìm thấy chỗ nào khớp.'
                  )
                  if (editDraft !== null) setEditDraft(null) // tránh ghi đè bản vừa thay
                  reload()
                } finally {
                  setBusy(null)
                }
              }}
            >
              Thay thế tất cả
            </button>
          </div>
        </div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === 'bienban' ? 'active' : ''}`} onClick={() => setTab('bienban')}>
          Biên bản
        </button>
        <button className={`tab ${tab === 'transcript' ? 'active' : ''}`} onClick={() => setTab('transcript')}>
          Transcript
        </button>
      </div>

      {tab === 'bienban' && editDraft === null && actionItems.length > 0 && (
        <div className="card task-panel">
          <div className="task-panel-head">
            <div style={{ fontWeight: 600, color: 'var(--navy)' }}>Việc cần làm — thêm vào Tasks</div>
            <button
              className="btn primary"
              onClick={async () => {
                await window.wz.tasksCreateMany(
                  actionItems.map((a) => ({ ...a, source: { meeting: name } }))
                )
                setAdded(new Set(actionItems.map((_, i) => i)))
                setNotice(`Đã thêm ${actionItems.length} việc vào Tasks.`)
                setTimeout(() => setNotice(null), 2500)
              }}
            >
              Thêm tất cả
            </button>
          </div>
          {actionItems.map((a, i) => (
            <div className="task-suggest" key={i}>
              <div className="task-suggest-text">
                <span>{a.name || 'Việc chưa đặt tên'}</span>
                {(a.assignee || a.due) && (
                  <span className="task-suggest-meta">
                    {[a.assignee, a.due].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
              <button
                className="btn"
                onClick={async () => {
                  await window.wz.tasksCreate({ ...a, source: { meeting: name } })
                  setAdded((prev) => new Set(prev).add(i))
                  setNotice('Đã thêm 1 việc vào Tasks.')
                  setTimeout(() => setNotice(null), 2000)
                }}
              >
                {added.has(i) ? (
                  <>
                    <Check size={14} /> Đã thêm
                  </>
                ) : (
                  '+ Thêm vào Tasks'
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'bienban' &&
        (editDraft !== null ? (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button
                className="btn primary"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy('save')
                  try {
                    await window.wz.meetingsSaveBienban(name, editDraft)
                    setEditDraft(null)
                    setNotice('Đã lưu biên bản. Bấm "Xuất PDF" để cập nhật file PDF.')
                    reload()
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                {busy === 'save' ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button className="btn" onClick={() => setEditDraft(null)}>
                Huỷ
              </button>
              <span className="count" style={{ margin: 'auto 0' }}>
                Định dạng Markdown - lưu xong bên xem sẽ cập nhật ngay.
              </span>
            </div>
            <textarea
              className="md-editor"
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              spellCheck={false}
            />
          </div>
        ) : detail.bienBanMd ? (
          // Nội dung local do Claude sinh, đã escape trong mdToHtml
          <article className="doc" dangerouslySetInnerHTML={{ __html: mdToHtml(detail.bienBanMd) }} />
        ) : detail.segments.length === 0 && detail.hasAudio ? (
          <div className="empty">
            Đã có ghi âm nhưng chưa transcript.
            <div style={{ marginTop: 12 }}>
              <button
                className="btn primary"
                onClick={async () => {
                  const r = await window.wz.meetingsProcess(name)
                  setNotice(
                    r.started
                      ? 'Đang tạo transcript & biên bản (chạy nền)... xong sẽ tự cập nhật ở đây.'
                      : `Đang xử lý cuộc "${r.busyWith ?? ''}" - mỗi lúc một cuộc, xong bấm lại nhé.`
                  )
                }}
              >
                Tạo transcript & biên bản
              </button>
            </div>
          </div>
        ) : (
          <div className="empty">Chưa có biên bản cho cuộc họp này. Bấm "Viết lại biên bản" để tạo.</div>
        ))}

      {tab === 'transcript' && (
        <div>
          <div className="searchbar">
            <input
              type="search"
              placeholder="Tìm trong transcript..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <p className="count">
            {q ? `${visible.length} / ${lines.length} đoạn khớp` : `${lines.length} đoạn`}
          </p>
          {visible.map((l, i) => (
            <div className="line" key={i}>
              <span className="ts">{ts(l.start)}</span>
              <span className="tx">
                <Highlight text={l.text} query={q} />
              </span>
            </div>
          ))}
          {q && visible.length === 0 && <div className="empty">Không tìm thấy đoạn nào khớp.</div>}
        </div>
      )}

      {/* Trợ lý biên bản: chỉ ở tab Biên bản, đã có nội dung, không ở chế độ sửa tay */}
      {tab === 'bienban' && detail.bienBanMd && editDraft === null && (
        <ReviseChat name={name} onUpdated={reload} />
      )}
    </div>
  )
}
