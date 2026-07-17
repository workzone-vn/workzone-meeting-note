import { useEffect, useRef, useState } from 'react'
import type { SetupProgress, SetupStepId } from '../../../shared/types'
import { Check } from '../components/icons'

const STEPS: { id: SetupStepId; title: string }[] = [
  { id: 'uv', title: 'Trình quản lý Python (uv)' },
  { id: 'venv', title: 'Môi trường Python 3.12' },
  { id: 'pip', title: 'Thư viện nhận giọng nói' },
  { id: 'model', title: 'Model Whisper large-v3 (~3GB, chỉ tải 1 lần)' },
  { id: 'engine', title: 'Engine Claude Recorder' }
]

type StepState = { status: 'pending' | 'running' | 'done' | 'error'; pct?: number; message?: string }

export function Onboarding({ onDone }: { onDone: () => void }): React.JSX.Element {
  const [started, setStarted] = useState(false)
  const [steps, setSteps] = useState<Record<SetupStepId, StepState>>({
    uv: { status: 'pending' },
    venv: { status: 'pending' },
    pip: { status: 'pending' },
    model: { status: 'pending' },
    engine: { status: 'pending' }
  })
  const doneRef = useRef(false)

  useEffect(() => {
    const off = window.wz.onSetupProgress((p: SetupProgress) => {
      setSteps((prev) => ({
        ...prev,
        [p.step]: {
          status: p.status,
          pct: p.pct ?? (p.status === 'running' ? prev[p.step].pct : undefined),
          message: p.message ?? (p.status === 'running' ? prev[p.step].message : undefined)
        }
      }))
      if (p.step === 'engine' && p.status === 'done' && !doneRef.current) {
        doneRef.current = true
        setTimeout(onDone, 800)
      }
    })
    return off
  }, [onDone])

  const start = (): void => {
    setStarted(true)
    void window.wz.setupStart()
  }

  const hasError = Object.values(steps).some((s) => s.status === 'error')

  return (
    <div className="content" style={{ height: '100%' }}>
      <div className="onboard">
        <div className="hero" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="eyebrow" style={{ color: '#aecbf0', fontSize: '0.72rem', letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600 }}>
            Claude Recorder · Cài đặt lần đầu
          </div>
          <h1>Claude Recorder</h1>
          <p>
            Ghi âm họp, chuyển giọng nói thành văn bản và viết biên bản - tất cả chạy trên máy bạn,
            audio không rời máy. Lần đầu cần tải bộ nhận giọng nói (~3GB), từ lần sau mở lên là dùng
            ngay.
          </p>
        </div>

        {!started ? (
          <div className="card" style={{ textAlign: 'center', padding: '30px 24px' }}>
            <p style={{ marginTop: 0 }}>
              Cần kết nối mạng cho lần cài đặt này. Máy đã cài Claude Recorder trước đó sẽ được nhận
              diện và bỏ qua phần tải lại.
            </p>
            <button className="btn primary" style={{ fontSize: '1rem', padding: '12px 28px' }} onClick={start}>
              Bắt đầu cài đặt
            </button>
          </div>
        ) : (
          <div className="card">
            <ul className="stage-list">
              {STEPS.map((s) => {
                const st = steps[s.id]
                return (
                  <li key={s.id}>
                    <span className={`stage-ico ${st.status === 'pending' ? '' : st.status}`}>
                      {st.status === 'done' ? (
                        <Check size={15} />
                      ) : st.status === 'error' ? (
                        '✕'
                      ) : st.status === 'running' ? (
                        <span className="spinner" />
                      ) : (
                        ''
                      )}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div className="stage-title">{s.title}</div>
                      {st.status === 'running' && (
                        <>
                          {st.message && <div className="stage-sub">{st.message}</div>}
                          <div className="progress-track">
                            <div
                              className={`progress-fill ${st.pct === undefined ? 'indeterminate' : ''}`}
                              style={{ width: `${st.pct ?? 0}%` }}
                            />
                          </div>
                        </>
                      )}
                      {st.status === 'error' && (
                        <div className="stage-sub" style={{ color: 'var(--red)' }}>{st.message}</div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
            {hasError && (
              <div className="banner error" style={{ marginTop: 14, marginBottom: 0 }}>
                Cài đặt gặp lỗi. Kiểm tra kết nối mạng rồi thử lại - các bước đã xong sẽ được bỏ
                qua.
                <div className="banner-actions">
                  <button className="btn primary" onClick={start}>
                    Thử lại
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
