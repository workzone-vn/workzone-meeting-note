// Kiểu dữ liệu dùng chung main <-> preload <-> renderer.

export interface MeetingSummary {
  name: string
  started: number | null // epoch giây (từ meeting.json)
  /** tiêu đề hiển thị (meeting.json 'title') - null thì UI dùng tên thư mục */
  title: string | null
  profiles: string[] // các hồ sơ ngữ cảnh của cuộc họp (luôn có ít nhất "Cá nhân")
  duration: number | null // giây (end của segment cuối)
  hasAudio: boolean // đã có audio.16k.wav (ghi xong nhưng có thể chưa transcript)
  hasTranscript: boolean
  hasBienban: boolean
  hasPdf: boolean
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export interface MeetingDetail {
  name: string
  started: number | null
  title: string | null
  profiles: string[]
  duration: number | null
  segments: TranscriptSegment[]
  bienBanMd: string | null
  hasAudio: boolean
  hasPdf: boolean
}

/** Kết quả "Kết thúc họp" (chỉ dừng + lưu audio, không transcript). */
export interface RecorderStopResult {
  stopped: boolean
  name?: string
  error?: string
}

/** Kết quả sinh tiêu đề hiển thị (meetings:generateTitle). */
export interface TitleResult {
  ok: boolean
  title?: string
  errorCode?: 'NO_CLAUDE' | 'GENERIC'
  message?: string
}

/** Kết quả chắt nội dung cuộc họp thành ghi chú Wiki (meetings:wikiNote). */
export interface MeetingWikiNoteResult {
  ok: boolean
  id?: string
  title?: string
  errorCode?: 'NO_CLAUDE' | 'GENERIC'
  message?: string
}

/** Kết quả yêu cầu xử lý nền (meetings:process). */
export interface ProcessStart {
  started: boolean
  /** tên cuộc họp đang chiếm pipeline khi từ chối */
  busyWith?: string
}

// Kết quả 1 lượt "Trợ lý biên bản" sửa nội dung (meetings:revise).
// Không throw để renderer hiện lỗi trong bubble chat.
export interface ReviseResult {
  ok: boolean
  errorCode?: 'NO_CLAUDE' | 'BUSY' | 'GENERIC'
  message?: string
}

export interface RecorderStatus {
  recording: boolean
  name?: string
  startedAt?: number // epoch giây
}

// Pipeline xử lý NỀN theo yêu cầu: transcript -> biên bản -> PDF.
// ('stopping' còn trong type cho tương thích; dừng ghi giờ nằm ngoài pipeline.)
export type PipelineStage = 'idle' | 'stopping' | 'transcribing' | 'minutes' | 'pdf' | 'done' | 'error'

export interface PipelineState {
  stage: PipelineStage
  meetingName?: string
  /** nguồn: 'process' = user bấm "Tạo biên bản" cho cuộc đã ghi; 'import' = nhập file ngoài */
  origin?: 'record' | 'import' | 'process'
  /** stage đang chạy khi lỗi xảy ra (chỉ có khi stage === 'error') */
  errorStage?: Exclude<PipelineStage, 'idle' | 'done' | 'error'>
  errorCode?: 'NO_CLAUDE' | 'GENERIC'
  message?: string
  pdfPath?: string
  /** epoch ms lúc stage hiện tại bắt đầu (để renderer hiện elapsed) */
  stageStartedAt?: number
}

// ---------- Wiki (ghi chú markdown + wikilink [[...]] + tag) ----------

export interface WikiNoteMeta {
  id: string // tên file không đuôi .md - ổn định, không đổi khi đổi title
  title: string
  tags: string[]
  updated: number // epoch giây
  excerpt: string // dòng đầu nội dung để hiện trong danh sách
  links: string[] // id các note mà note này trỏ tới qua [[wikilink]] (đã resolve)
  unresolved: string[] // wikilink chưa có note đích (hiện mờ, bấm tạo mới)
}

export interface WikiNote {
  id: string
  title: string
  tags: string[]
  updated: number
  content: string
  backlinks: { id: string; title: string }[] // note khác trỏ về note này
}

export interface WikiAskResult {
  ok: boolean
  answer?: string // markdown
  sources?: { id: string; title: string }[]
  errorCode?: 'NO_CLAUDE' | 'GENERIC'
  message?: string
}

export type SetupStepId = 'uv' | 'venv' | 'pip' | 'model' | 'engine'

export interface SetupProgress {
  step: SetupStepId
  status: 'running' | 'done' | 'error'
  /** 0-100, chỉ có ở bước model */
  pct?: number
  message?: string
}

export interface SetupStatus {
  venvOk: boolean
  modelOk: boolean
  engineSynced: boolean
  claudePath: string | null
  syscapOk: boolean
  /** venvOk && modelOk -> app dùng được (claude riêng, chỉ cảnh báo) */
  ready: boolean
}

export interface GitSyncConfig {
  enabled: boolean
  repoUrl: string // https://github.com/<owner>/<repo>.git
  branch: string // mặc định "main"
  authorName: string // mặc định os.hostname()
  authorEmail: string // mặc định <hostname>@wz-wiki-sync.local
  lastSyncedAt?: number // epoch ms
  lastSyncStatus?: 'ok' | 'conflict' | 'error'
  lastSyncMessage?: string
}

export interface Settings {
  systemAudio: boolean
  audioDeviceIndex: string | null // null = tự chọn mic thật
  lastProfiles: string[] // các hồ sơ ngữ cảnh dùng gần nhất (mặc định ["Cá nhân"])
  hfToken: string | null
  theme: 'light' | 'dark' // giao diện Sáng/Tối (mặc định "light")
  gitSync: GitSyncConfig
  githubTokenSet: boolean // renderer chỉ biết token đã đặt hay chưa
}

// Một việc cần làm trong trang Tasks (lưu ở ~/wz-bien-ban/tasks.json).
export interface Task {
  id: string // randomUUID (main)
  name: string // Việc
  assignee: string // Người phụ trách
  due: string // Deadline (chữ tự do, vd "Trong tuần", "Chưa chốt")
  done: boolean
  archived: boolean // true = đã lưu trữ (ẩn khỏi danh sách đang làm)
  source?: { meeting: string } // tên folder cuộc họp nguồn (nếu thêm từ biên bản)
  createdAt: number // epoch ms, để giữ thứ tự chèn
}

// Dữ liệu đầu vào khi tạo task mới (main tự sinh id/createdAt/done).
export interface TaskInput {
  name?: string
  assignee?: string
  due?: string
  source?: { meeting: string }
}

export interface AudioDevice {
  index: string
  name: string
}

export interface EngineCheck {
  ok: boolean
  detail: string
}
