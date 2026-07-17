import { useEffect, useState } from 'react'
import type { RecorderStatus, Settings } from '../../../shared/types'
import { Check, CheckCircle, Microphone, Record, SpeakerHigh, Stop, Warning } from '../components/icons'
import { titleCase, tsFull } from '../lib/format'

export function Home({
  recorder,
  onOpenMeeting,
  onOpenSettings
}: {
  recorder: RecorderStatus
  onOpenMeeting: (name: string) => void
  onOpenSettings: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [warnSilent, setWarnSilent] = useState(false)
  const [warnNoSys, setWarnNoSys] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedName, setSavedName] = useState<string | null>(null) // vừa lưu xong cuộc nào
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [profiles, setProfiles] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>(['Cá nhân'])
  // Máy mới chưa viết ngữ cảnh cá nhân -> gợi ý khởi tạo (tắt được, nhớ trong máy)
  const [showContextHint, setShowContextHint] = useState(false)
  const [, forceTick] = useState(0)

  useEffect(() => {
    void window.wz.settingsGet().then((s) => {
      setSettings(s)
      setSelected(s.lastProfiles)
    })
    void window.wz.profilesList().then(setProfiles)
    if (localStorage.getItem('wz.contextHintDismissed') !== '1') {
      void window.wz.glossaryGet(null).then((g) => setShowContextHint(!g.exists))
    }
  }, [])

  const toggle = (p: string): void => {
    setSelected((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
  }

  // đồng hồ ghi âm cập nhật mỗi giây
  useEffect(() => {
    if (!recorder.recording) return
    const id = setInterval(() => forceTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [recorder.recording])

  const start = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setSavedName(null)
    setWarnSilent(false)
    setWarnNoSys(false)
    try {
      const r = await window.wz.recorderStart(name.trim() || undefined, selected)
      setWarnSilent(r.warnSilent)
      setWarnNoSys(r.warnNoSystemAudio)
      setName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // invoke trả về SAU khi main dừng + trộn audio xong (vài giây) -> trong lúc
  // đó nút hiện "Đang lưu..." (dialog xác nhận là modal nên không gây hiểu nhầm).
  const stop = async (): Promise<void> => {
    setBusy(true)
    setSaving(true)
    try {
      const r = await window.wz.recorderStop()
      if (!r.stopped) return // user huỷ dialog
      if (r.error) setError(`Lưu ghi âm lỗi: ${r.error}`)
      else if (r.name) setSavedName(r.name)
    } finally {
      setBusy(false)
      setSaving(false)
    }
  }

  // Tạo biên bản ngay sau khi lưu (pipeline nền - banner tiến trình do App hiện)
  const processNow = async (n: string): Promise<void> => {
    const r = await window.wz.meetingsProcess(n)
    if (r.started) setSavedName(null)
    else setError(`Đang xử lý cuộc "${r.busyWith ?? ''}" - xong sẽ bấm lại được.`)
  }

  const elapsed = recorder.startedAt ? Math.max(0, Date.now() / 1000 - recorder.startedAt) : 0

  return (
    <div>
      <h1 className="page-title">Ghi âm cuộc họp</h1>

      {error && <div className="banner error">{error}</div>}
      {showContextHint && !recorder.recording && (
        <div className="banner warn">
          <b>Mẹo cho biên bản chính xác hơn:</b> viết vài dòng ngữ cảnh riêng của bạn (bạn là ai,
          đồng nghiệp hay họp cùng, thuật ngữ/tên riêng hay bị nghe sai). AI sẽ dùng khi viết biên
          bản.{' '}
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <button
              className="btn primary"
              style={{ padding: '3px 10px', fontSize: '0.84rem' }}
              onClick={onOpenSettings}
            >
              Viết ngữ cảnh
            </button>
            <button
              className="btn"
              style={{ padding: '3px 10px', fontSize: '0.84rem' }}
              onClick={() => {
                localStorage.setItem('wz.contextHintDismissed', '1')
                setShowContextHint(false)
              }}
            >
              Để sau
            </button>
          </span>
        </div>
      )}
      {savedName && !recorder.recording && (
        <div className="banner warn">
          <b>
            <CheckCircle size={16} /> Đã lưu cuộc họp "{titleCase(savedName)}".
          </b>{' '}
          Tạo transcript & biên bản lúc nào cũng được - hoặc ghi luôn cuộc mới.{' '}
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <button
              className="btn primary"
              style={{ padding: '3px 10px', fontSize: '0.84rem' }}
              onClick={() => void processNow(savedName)}
            >
              Tạo biên bản ngay
            </button>
            <button
              className="btn"
              style={{ padding: '3px 10px', fontSize: '0.84rem' }}
              onClick={() => onOpenMeeting(savedName)}
            >
              Mở cuộc họp
            </button>
          </span>
        </div>
      )}
      {warnSilent && recorder.recording && (
        <div className="banner warn">
          <b>
            <Warning size={16} /> Mic không có tín hiệu.
          </b>{' '}
          Đang ghi nhưng thiết bị im lặng tuyệt đối. Kiểm tra: mic
          có bị tắt? chọn đúng mic chưa (Cài đặt)? đã cấp quyền Micro cho app chưa? Nên bấm{' '}
          <b>Kết thúc</b>, sửa lại rồi ghi mới - tránh mất cả buổi họp.
        </div>
      )}
      {warnNoSys && recorder.recording && (
        <div className="banner warn">
          <b>
            <Warning size={16} /> Không ghi được tiếng trong máy.
          </b>{' '}
          Chưa cấp quyền <b>Ghi âm thanh hệ thống</b> (hoặc máy chạy macOS cũ hơn 14.2) nên đang ghi
          bằng <b>mic</b> - tiếng người họp online (qua tai nghe/loa) có thể không rõ. Cấp quyền rồi
          ghi lại để bắt đủ tiếng.{' '}
          <button
            className="btn"
            style={{ padding: '3px 10px', fontSize: '0.84rem' }}
            onClick={() => void window.wz.openScreenRecordingPrefs()}
          >
            Mở cài đặt quyền
          </button>
        </div>
      )}

      <div className="card record-hero">
        {!recorder.recording ? (
          <>
            <div className="profile-row">
              <span className="profile-label">Ngữ cảnh:</span>
              {profiles.map((p) => (
                <button
                  key={p}
                  className={`profile-chip ${selected.includes(p) ? 'active' : ''}`}
                  title="Bấm để chọn/bỏ - chọn được nhiều hồ sơ cùng lúc"
                  onClick={() => toggle(p)}
                >
                  {selected.includes(p) && <Check size={13} />} {p}
                </button>
              ))}
            </div>
            <input
              className="name-input"
              placeholder="Tên cuộc họp (tuỳ chọn, để trống sẽ tự đặt theo ngày giờ)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && void start()}
            />
            <button className="record-btn" disabled={busy} onClick={() => void start()}>
              {busy ? (
                '...'
              ) : (
                <>
                  <Record size={22} /> Bắt đầu
                </>
              )}
            </button>
            <p className="rec-meta" style={{ marginTop: 22 }}>
              Âm thanh xử lý hoàn toàn trên máy bạn, không gửi đi đâu.
            </p>
          </>
        ) : (
          <>
            <button className="record-btn recording" disabled={busy} onClick={() => void stop()}>
              <Stop size={22} /> {saving ? 'Đang lưu...' : 'Kết thúc'}
            </button>
            <div className="timer">{tsFull(elapsed)}</div>
            <div className="rec-meta">
              Đang ghi: <b>{recorder.name}</b>
            </div>
          </>
        )}
        {settings && (
          <span className="chip">
            {settings.systemAudio ? (
              <>
                <SpeakerHigh size={14} /> Ghi <b>mic + tiếng trong máy</b>
              </>
            ) : (
              <>
                <Microphone size={14} /> Ghi qua <b>mic</b> (bật loa ngoài để bắt tiếng mọi người)
              </>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
