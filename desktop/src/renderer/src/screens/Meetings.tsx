import { useEffect, useState } from 'react'
import type { MeetingSummary } from '../../../shared/types'
import { Trash, UploadSimple } from '../components/icons'
import { fmtMeetingTime, titleCase, ts } from '../lib/format'

export function Meetings({ onOpen }: { onOpen: (name: string) => void }): React.JSX.Element {
  const [items, setItems] = useState<MeetingSummary[] | null>(null)
  const [profiles, setProfiles] = useState<string[]>([])
  const [filter, setFilter] = useState<string>('') // '' = tất cả, khác = tên hồ sơ ngữ cảnh
  const [processing, setProcessing] = useState<string | null>(null) // cuộc đang xử lý nền
  const [query, setQuery] = useState('')
  // null = không lọc theo tìm kiếm; khác = tập tên cuộc họp khớp (main tìm cả
  // trong nội dung biên bản nên phải hỏi qua IPC, debounce ~250ms)
  const [searchHits, setSearchHits] = useState<Set<string> | null>(null)

  const reload = (): void => {
    void window.wz.meetingsList().then(setItems).catch(() => setItems([]))
  }
  useEffect(() => {
    reload()
    void window.wz.profilesList().then(setProfiles)
    // đồng bộ trạng thái xử lý nền: badge/nút cập nhật ngay khi pipeline chạy/xong
    void window.wz.pipelineState().then((p) => {
      setProcessing(!['idle', 'done', 'error'].includes(p.stage) ? (p.meetingName ?? null) : null)
    })
    return window.wz.onPipelineProgress((p) => {
      const busy = !['idle', 'done', 'error'].includes(p.stage)
      setProcessing(busy ? (p.meetingName ?? null) : null)
      if (!busy) reload() // xong/lỗi -> cập nhật badge transcript/biên bản/pdf
    })
  }, [])

  // tìm theo keyword: title/tên thư mục/nội dung biên bản (main đọc file)
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setSearchHits(null)
      return
    }
    const t = setTimeout(() => {
      void window.wz.meetingsSearch(q).then((names) => setSearchHits(new Set(names)))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  // lọc nhanh theo thẻ ngữ cảnh: gộp hồ sơ đang có + hồ sơ xuất hiện trong cuộc họp cũ
  const filterOptions = [...new Set([...profiles, ...(items ?? []).flatMap((m) => m.profiles)])]
  const visible = (items ?? []).filter(
    (m) =>
      (filter === '' ? true : m.profiles.includes(filter)) &&
      (searchHits === null || searchHits.has(m.name))
  )

  const remove = async (e: React.MouseEvent, name: string): Promise<void> => {
    e.stopPropagation() // đừng mở chi tiết khi bấm xoá
    const r = await window.wz.meetingsDelete(name) // main hiện dialog confirm
    if (r.deleted) reload()
  }

  // Cuộc đã ghi nhưng chưa transcript -> xử lý nền theo yêu cầu
  const process = async (e: React.MouseEvent, name: string): Promise<void> => {
    e.stopPropagation()
    const r = await window.wz.meetingsProcess(name)
    if (!r.started) {
      window.alert(`Đang xử lý cuộc "${r.busyWith ?? ''}" - mỗi lúc một cuộc, xong sẽ bấm lại được.`)
      return
    }
    setProcessing(name)
  }

  // Nhập file ghi âm ngoài: main mở hộp chọn file rồi chạy pipeline; App tự lật
  // sang màn Processing nhờ sự kiện pipeline (không cần làm gì thêm ở đây).
  const importFile = async (): Promise<void> => {
    const r = await window.wz.importFile()
    if (r.error) window.alert(r.error)
  }

  if (items === null) return <div className="empty">Đang tải...</div>

  return (
    <div>
      <h1 className="page-title">Cuộc họp</h1>
      <div style={{ marginBottom: 16 }}>
        <button className="btn" onClick={() => void importFile()}>
          <UploadSimple size={16} /> Nhập file ghi âm
        </button>
      </div>
      <div className="searchbar">
        <input
          type="search"
          placeholder="Tìm cuộc họp theo tiêu đề hoặc nội dung biên bản..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {filterOptions.length > 0 && (
        <div className="profile-row" style={{ justifyContent: 'flex-start' }}>
          <span className="profile-label">Lọc theo ngữ cảnh:</span>
          <button className={`profile-chip ${filter === '' ? 'active' : ''}`} onClick={() => setFilter('')}>
            Tất cả
          </button>
          {filterOptions.map((p) => (
            <button
              key={p}
              className={`profile-chip ${filter === p ? 'active' : ''}`}
              onClick={() => setFilter(filter === p ? '' : p)}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      {items.length === 0 && (
        <div className="empty">
          Chưa có cuộc họp nào. Sang mục <b>Ghi âm</b> để bắt đầu cuộc đầu tiên.
        </div>
      )}
      {query.trim() && visible.length === 0 && items.length > 0 && (
        <div className="empty">Không tìm thấy cuộc họp nào khớp.</div>
      )}
      {visible.map((m) => (
        <div key={m.name} className="meeting-row" onClick={() => onOpen(m.name)}>
          <div>
            <div className="m-name">
              {m.title || titleCase(m.name)}
              {m.profiles.map((p) => (
                <span key={p} className={`profile-tag ${p === 'Cá nhân' ? 'personal' : ''}`}>
                  {p}
                </span>
              ))}
            </div>
            <div className="m-meta">
              {fmtMeetingTime(m.started) || 'Không rõ thời gian'}
              {m.duration ? ` · ${ts(m.duration)}` : ''}
            </div>
          </div>
          <div className="badges">
            {processing === m.name ? (
              <span className="badge on">
                <span className="spinner" style={{ verticalAlign: -2 }} /> Đang xử lý...
              </span>
            ) : (
              !m.hasTranscript &&
              m.hasAudio && (
                <button
                  className="btn"
                  style={{ padding: '3px 10px', fontSize: '0.84rem' }}
                  title="Transcript + viết biên bản + PDF (chạy nền)"
                  onClick={(e) => void process(e, m.name)}
                >
                  Tạo biên bản
                </button>
              )
            )}
            <span className={`badge ${m.hasTranscript ? 'on' : ''}`}>Transcript</span>
            <span className={`badge ${m.hasBienban ? 'on' : ''}`}>Biên bản</span>
            <span className={`badge ${m.hasPdf ? 'on' : ''}`}>PDF</span>
          </div>
          <button
            className="btn icon-btn danger-hover"
            title="Xoá cuộc họp"
            onClick={(e) => void remove(e, m.name)}
          >
            <Trash size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
