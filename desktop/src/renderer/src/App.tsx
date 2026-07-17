import { useCallback, useEffect, useRef, useState } from 'react'
import type { PipelineState, RecorderStatus, SetupStatus } from '../../shared/types'
import { ClaudeGuide } from './components/ClaudeGuide'
import { CheckCircle, FileText, Gear, Microphone, Moon, Notebook, Sun, Warning } from './components/icons'
import { titleCase } from './lib/format'
import { Home } from './screens/Home'
import { MeetingDetail } from './screens/MeetingDetail'
import { Meetings } from './screens/Meetings'
import { Onboarding } from './screens/Onboarding'
import { Processing } from './screens/Processing'
import { Settings } from './screens/Settings'
import { Tasks } from './screens/Tasks'
import { Wiki } from './screens/Wiki'

type Tab = 'record' | 'meetings' | 'tasks' | 'wiki' | 'settings'

export default function App(): React.JSX.Element {
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [tab, setTab] = useState<Tab>('record')
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null)
  const [recorder, setRecorder] = useState<RecorderStatus>({ recording: false })
  const [pipeline, setPipeline] = useState<PipelineState>({ stage: 'idle' })
  const [showClaudeGuide, setShowClaudeGuide] = useState(false)
  const [version, setVersion] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  // Pipeline nền không chặn Home nữa - màn Processing chỉ mở khi user muốn xem
  const [viewProgress, setViewProgress] = useState(false)
  const importDoneRef = useRef<string | null>(null)

  const refreshSetup = useCallback(() => {
    void window.wz.setupGetStatus().then(setSetup)
  }, [])

  // Hiện version app ở góc dưới trái để dễ debug đang chạy bản nào.
  useEffect(() => {
    void window.wz.appVersion().then(setVersion)
  }, [])

  // Nạp giao diện Sáng/Tối đã lưu và áp ngay vào <html data-theme> khi mở app.
  useEffect(() => {
    void window.wz.settingsGet().then((s) => {
      setTheme(s.theme)
      document.documentElement.setAttribute('data-theme', s.theme)
    })
  }, [])

  // Đổi Sáng<->Tối: cập nhật state + thuộc tính data-theme tức thì rồi lưu lại.
  const toggleTheme = (): void => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    void window.wz.settingsSet({ theme: next })
  }

  useEffect(() => {
    refreshSetup()
    void window.wz.recorderStatus().then(setRecorder)
    void window.wz.pipelineState().then(setPipeline)
    const off1 = window.wz.onRecorderChanged(setRecorder)
    const off2 = window.wz.onPipelineProgress(setPipeline)
    return () => {
      off1()
      off2()
    }
  }, [refreshSetup])

  // Nhập file có thể khởi từ tab "Cuộc họp" -> lật sang tab "Ghi âm" để thấy màn
  // Processing (tiến trình pipeline hiện ở đó).
  useEffect(() => {
    if (pipeline.stage === 'transcribing' && pipeline.origin === 'import' && tab !== 'record') {
      setTab('record')
    }
  }, [pipeline.stage, pipeline.origin, tab])

  // Pipeline về idle -> đóng màn tiến trình nếu đang mở
  useEffect(() => {
    if (pipeline.stage === 'idle') setViewProgress(false)
  }, [pipeline.stage])

  // Nhập file transcript xong -> tự mở màn chi tiết cuộc họp rồi reset pipeline.
  // Ref để chỉ chạy một lần cho mỗi lần done (reset -> stage idle -> ref về null).
  useEffect(() => {
    if (pipeline.stage === 'done' && pipeline.origin === 'import' && pipeline.meetingName) {
      if (importDoneRef.current === pipeline.meetingName) return
      importDoneRef.current = pipeline.meetingName
      setSelectedMeeting(pipeline.meetingName)
      setTab('meetings')
      void window.wz.pipelineReset()
    } else if (pipeline.stage !== 'done') {
      importDoneRef.current = null
    }
  }, [pipeline.stage, pipeline.origin, pipeline.meetingName])

  if (setup === null) {
    return <div className="empty">Đang khởi động...</div>
  }

  if (!setup.ready) {
    return <Onboarding onDone={refreshSetup} />
  }

  const pipelineBusy = !['idle', 'done', 'error'].includes(pipeline.stage)
  const noClaude = setup.claudePath === null

  const openMeeting = (name: string): void => {
    setSelectedMeeting(name)
    setTab('meetings')
  }

  // Màn Processing: nhập file giữ luồng cũ (bắt buộc xem), còn xử lý nền chỉ
  // hiện khi user bấm "Xem tiến trình" (viewProgress).
  const showProcessing =
    pipeline.stage !== 'idle' && (pipeline.origin === 'import' || viewProgress)

  const stageLabel: Record<string, string> = {
    transcribing: 'đang chuyển giọng nói thành văn bản',
    minutes: 'đang viết biên bản',
    pdf: 'đang xuất PDF'
  }

  // Banner nền (mọi tab): tiến trình / xong / lỗi của pipeline origin 'process'
  const processBanner = pipeline.origin === 'process' && !showProcessing && (
    <>
      {pipelineBusy && (
        <div className="banner warn">
          <span className="spinner" style={{ verticalAlign: -2, marginRight: 6 }} /> Đang tạo biên
          bản nền: <b>{titleCase(pipeline.meetingName ?? '')}</b>
          {' - '}
          {stageLabel[pipeline.stage] ?? 'đang xử lý'}. Bạn vẫn ghi cuộc họp mới được bình thường.{' '}
          <button
            className="btn"
            style={{ padding: '3px 10px', fontSize: '0.84rem' }}
            onClick={() => {
              setViewProgress(true)
              setTab('record')
            }}
          >
            Xem tiến trình
          </button>
        </div>
      )}
      {pipeline.stage === 'done' && pipeline.meetingName && (
        <div className="banner warn">
          <CheckCircle size={15} /> Biên bản <b>{titleCase(pipeline.meetingName)}</b> đã xong.{' '}
          <button
            className="btn"
            style={{ padding: '3px 10px', fontSize: '0.84rem' }}
            onClick={() => {
              openMeeting(pipeline.meetingName!)
              void window.wz.pipelineReset()
            }}
          >
            Mở biên bản
          </button>{' '}
          <button
            className="btn"
            style={{ padding: '3px 10px', fontSize: '0.84rem' }}
            onClick={() => void window.wz.pipelineReset()}
          >
            Đóng
          </button>
        </div>
      )}
      {pipeline.stage === 'error' && (
        <div className="banner error">
          <Warning size={15} /> Tạo biên bản <b>{titleCase(pipeline.meetingName ?? '')}</b> gặp
          lỗi.{' '}
          <button
            className="btn"
            style={{ padding: '3px 10px', fontSize: '0.84rem' }}
            onClick={() => {
              setViewProgress(true)
              setTab('record')
            }}
          >
            Xem chi tiết
          </button>
        </div>
      )}
    </>
  )

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="name">Claude Recorder</div>
        </div>
        <button
          className={`nav-item ${tab === 'record' ? 'active' : ''}`}
          onClick={() => setTab('record')}
        >
          <Microphone size={18} /> Ghi âm
          {recorder.recording && <span className="dot" />}
        </button>
        <button
          className={`nav-item ${tab === 'meetings' ? 'active' : ''}`}
          onClick={() => {
            setSelectedMeeting(null)
            setTab('meetings')
          }}
        >
          <FileText size={18} /> Cuộc họp
        </button>
        <button
          className={`nav-item ${tab === 'tasks' ? 'active' : ''}`}
          onClick={() => setTab('tasks')}
        >
          <CheckCircle size={18} /> Tasks
        </button>
        <button
          className={`nav-item ${tab === 'wiki' ? 'active' : ''}`}
          onClick={() => setTab('wiki')}
        >
          <Notebook size={18} /> Wiki
        </button>
        <button
          className={`nav-item ${tab === 'settings' ? 'active' : ''}`}
          onClick={() => setTab('settings')}
        >
          <Gear size={18} /> Cài đặt
        </button>
        <button
          className="nav-item theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
        </button>
        <div className="foot">Claude Recorder{version && ` · v${version}`}</div>
      </aside>

      <main className="content">
        <div className="content-inner">
          {noClaude && tab !== 'settings' && (
            <div className="banner warn">
              <b>
                <Warning size={16} /> Chưa có Claude Code trên máy.
              </b>{' '}
              App vẫn ghi âm và tạo transcript bình thường,
              nhưng chưa tự viết biên bản được.{' '}
              <button
                className="btn"
                style={{ padding: '3px 10px', fontSize: '0.84rem' }}
                onClick={() => setShowClaudeGuide((v) => !v)}
              >
                {showClaudeGuide ? 'Ẩn hướng dẫn' : 'Hướng dẫn cài'}
              </button>
              {showClaudeGuide && <ClaudeGuide onRecheck={refreshSetup} />}
            </div>
          )}

          {processBanner}

          {tab === 'record' &&
            (showProcessing ? (
              <Processing
                pipeline={pipeline}
                onOpenMeeting={openMeeting}
                onRecheckClaude={refreshSetup}
                onBack={pipeline.origin === 'process' ? () => setViewProgress(false) : undefined}
              />
            ) : (
              <Home recorder={recorder} onOpenMeeting={openMeeting} />
            ))}

          {tab === 'meetings' &&
            (selectedMeeting ? (
              <MeetingDetail name={selectedMeeting} onBack={() => setSelectedMeeting(null)} />
            ) : (
              <Meetings onOpen={openMeeting} />
            ))}

          {tab === 'tasks' && <Tasks onOpenMeeting={openMeeting} />}

          {tab === 'wiki' && <Wiki />}

          {tab === 'settings' && <Settings setup={setup} onRecheck={refreshSetup} />}
        </div>
      </main>
    </div>
  )
}
