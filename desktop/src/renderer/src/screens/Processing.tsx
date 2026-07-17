import { useEffect, useState } from 'react'
import type { PipelineStage, PipelineState } from '../../../shared/types'
import { ClaudeGuide } from '../components/ClaudeGuide'
import { Check, Warning } from '../components/icons'
import { tsFull } from '../lib/format'

const STAGES: { id: PipelineStage; title: string; sub: string }[] = [
  { id: 'stopping', title: 'Dừng ghi âm', sub: 'Gộp các nguồn âm thanh' },
  {
    id: 'transcribing',
    title: 'Chuyển giọng nói thành văn bản',
    sub: 'Whisper large-v3 chạy trên máy - cuộc họp dài có thể mất nhiều phút'
  },
  { id: 'minutes', title: 'Viết biên bản', sub: 'Claude tóm tắt, quyết định, action items' },
  { id: 'pdf', title: 'Xuất PDF', sub: 'Biên bản + transcript, sẵn sàng gửi đi' }
]

const ORDER: PipelineStage[] = ['stopping', 'transcribing', 'minutes', 'pdf', 'done']

export function Processing({
  pipeline,
  onOpenMeeting,
  onRecheckClaude,
  onBack
}: {
  pipeline: PipelineState
  onOpenMeeting: (name: string) => void
  onRecheckClaude: () => void
  /** có = xử lý nền, cho quay về màn ghi âm mà không cần đợi */
  onBack?: () => void
}): React.JSX.Element {
  const [, forceTick] = useState(0)
  const [profiles, setProfiles] = useState<string[]>([])
  const [meetingProfiles, setMeetingProfiles] = useState<string[]>([])
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000)
    void window.wz.profilesList().then(setProfiles)
    return () => clearInterval(id)
  }, [])
  // nạp bộ hồ sơ hiện tại của cuộc họp khi biết tên
  useEffect(() => {
    if (pipeline.meetingName) {
      void window.wz.meetingsGet(pipeline.meetingName).then((d) => setMeetingProfiles(d.profiles))
    }
  }, [pipeline.meetingName])

  // Còn đổi được hồ sơ chừng nào Claude CHƯA viết biên bản (engine đọc hồ sơ
  // từ meeting.json đúng lúc bước viết bắt đầu).
  const profileEditable =
    pipeline.meetingName &&
    (pipeline.stage === 'stopping' || pipeline.stage === 'transcribing' || pipeline.stage === 'error')

  const toggleProfile = async (p: string): Promise<void> => {
    if (!pipeline.meetingName) return
    const next = meetingProfiles.includes(p)
      ? meetingProfiles.filter((x) => x !== p)
      : [...meetingProfiles, p]
    await window.wz.meetingsSetProfiles(pipeline.meetingName, next)
    setMeetingProfiles(next)
  }

  // Nhập file ngoài chỉ có bước transcript (không dừng ghi/biên bản/PDF).
  // Xử lý nền (origin 'process') không có bước "Dừng ghi âm" (dừng đã xong từ trước).
  const isImport = pipeline.origin === 'import'
  const visibleStages = isImport
    ? STAGES.filter((s) => s.id === 'transcribing')
    : pipeline.origin === 'process'
      ? STAGES.filter((s) => s.id !== 'stopping')
      : STAGES

  const current = pipeline.stage === 'error' ? pipeline.errorStage : pipeline.stage
  const currentIdx = ORDER.indexOf(current ?? 'stopping')
  const stageElapsed = pipeline.stageStartedAt
    ? Math.max(0, (Date.now() - pipeline.stageStartedAt) / 1000)
    : 0

  const statusOf = (id: PipelineStage): 'done' | 'running' | 'error' | 'pending' => {
    const idx = ORDER.indexOf(id)
    if (pipeline.stage === 'error') {
      if (id === pipeline.errorStage) return 'error'
      return idx < currentIdx ? 'done' : 'pending'
    }
    if (idx < currentIdx || pipeline.stage === 'done') return 'done'
    if (id === pipeline.stage) return 'running'
    return 'pending'
  }

  const retry = (): void => {
    if (pipeline.meetingName) void window.wz.meetingsWriteMinutes(pipeline.meetingName)
  }

  return (
    <div>
      {onBack && (
        <button className="btn" style={{ marginBottom: 12 }} onClick={onBack}>
          ← Về màn ghi âm (xử lý vẫn chạy nền)
        </button>
      )}
      <h1 className="page-title">
        {pipeline.stage === 'done' ? (
          <>
            Biên bản đã sẵn sàng <Check size={20} />
          </>
        ) : pipeline.stage === 'error' ? (
          'Có lỗi trong lúc xử lý'
        ) : isImport ? (
          'Đang xử lý file ghi âm...'
        ) : (
          'Đang xử lý cuộc họp...'
        )}
      </h1>

      {profiles.length > 0 && pipeline.meetingName && (
        <div className="card" style={{ padding: '14px 20px' }}>
          <div className="profile-row" style={{ justifyContent: 'flex-start', marginBottom: 0 }}>
            <span className="profile-label">
              {profileEditable ? 'Viết biên bản theo ngữ cảnh:' : 'Ngữ cảnh:'}
            </span>
            {profiles.map((p) => (
              <button
                key={p}
                className={`profile-chip ${meetingProfiles.includes(p) ? 'active' : ''}`}
                disabled={!profileEditable}
                title="Bấm để chọn/bỏ - chọn được nhiều hồ sơ, ngữ cảnh sẽ được gộp lại"
                onClick={() => void toggleProfile(p)}
              >
                {meetingProfiles.includes(p) && <Check size={13} />} {p}
              </button>
            ))}
          </div>
          {profileEditable && (
            <div className="stage-sub" style={{ marginTop: 6 }}>
              Các hồ sơ chọn sẽ được gộp làm ngữ cảnh. Chọn được đến khi bước "Viết biên bản" bắt
              đầu; sau đó vẫn đổi được trong trang cuộc họp rồi bấm "Viết lại biên bản".
            </div>
          )}
        </div>
      )}

      <div className="card">
        <ul className="stage-list">
          {visibleStages.map((s) => {
            const st = statusOf(s.id)
            return (
              <li key={s.id}>
                <span className={`stage-ico ${st === 'pending' ? '' : st}`}>
                  {st === 'done' ? (
                    <Check size={15} />
                  ) : st === 'error' ? (
                    '✕'
                  ) : st === 'running' ? (
                    <span className="spinner" />
                  ) : (
                    ''
                  )}
                </span>
                <div>
                  <div className="stage-title">{s.title}</div>
                  <div className="stage-sub">
                    {st === 'running' ? `${s.sub} · ${tsFull(stageElapsed)}` : s.sub}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {pipeline.stage === 'error' && pipeline.errorCode === 'NO_CLAUDE' && (
        <div className="banner warn">
          <b>
            <Warning size={16} /> Chưa thấy Claude Code trên máy nên chưa viết biên bản được.
          </b>{' '}
          Transcript đã được
          lưu an toàn - cài Claude Code xong bấm "Viết biên bản lại" là tiếp tục ngay, không cần ghi
          lại.
          <ClaudeGuide onRecheck={onRecheckClaude} />
          <div className="banner-actions">
            <button className="btn primary" onClick={retry} disabled={!pipeline.meetingName}>
              Viết biên bản lại
            </button>
          </div>
        </div>
      )}

      {pipeline.stage === 'error' && pipeline.errorCode !== 'NO_CLAUDE' && (
        <div className="banner error">
          <b>Lỗi:</b> {pipeline.message || 'Không rõ nguyên nhân.'}
          <div className="banner-actions">
            {pipeline.meetingName && pipeline.errorStage === 'transcribing' && (
              <button
                className="btn primary"
                onClick={() => void window.wz.meetingsProcess(pipeline.meetingName!)}
              >
                Thử lại từ đầu
              </button>
            )}
            {pipeline.meetingName &&
              pipeline.errorStage !== 'stopping' &&
              pipeline.errorStage !== 'transcribing' && (
                <button className="btn primary" onClick={retry}>
                  Thử lại từ bước viết biên bản
                </button>
              )}
            <button className="btn" onClick={() => void window.wz.pipelineReset()}>
              Về màn hình ghi âm
            </button>
          </div>
        </div>
      )}

      {pipeline.stage === 'done' && pipeline.meetingName && (
        <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => onOpenMeeting(pipeline.meetingName!)}>
            Xem biên bản
          </button>
          <button
            className="btn"
            onClick={() => void window.wz.meetingsOpenPdf(pipeline.meetingName!)}
          >
            Mở PDF
          </button>
          <button
            className="btn"
            onClick={() => void window.wz.meetingsOpenFolder(pipeline.meetingName!)}
          >
            Mở thư mục
          </button>
          <button className="btn" onClick={() => void window.wz.pipelineReset()}>
            Ghi cuộc họp mới
          </button>
        </div>
      )}
    </div>
  )
}
