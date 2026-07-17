// Hai luồng tách biệt (record-first, process-later):
//   1. stopAndSave(): dừng ghi + lưu audio (vài giây) - NGOÀI pipeline, ghi cuộc
//      mới được ngay sau đó.
//   2. processMeeting(): pipeline NỀN theo yêu cầu: transcribing -> minutes -> pdf
//      -> done | error. Mỗi lúc 1 cuộc (Whisper nặng). Trạng thái giữ ở main
//      (renderer có thể đóng/mở giữa chừng), phát qua sự kiện.
import * as path from 'path'
import type { PipelineState } from '../../shared/types'
import { run, runStreaming } from './EngineService'

let state: PipelineState = { stage: 'idle' }
type Listener = (s: PipelineState) => void
const listeners = new Set<Listener>()

export function onPipelineChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getPipelineState(): PipelineState {
  return state
}

function setState(patch: Partial<PipelineState>): void {
  state = { ...state, ...patch, stageStartedAt: Date.now() }
  for (const fn of listeners) fn(state)
}

function fail(
  errorStage: NonNullable<PipelineState['errorStage']>,
  message: string,
  errorCode: PipelineState['errorCode'] = 'GENERIC'
): void {
  setState({ stage: 'error', errorStage, errorCode, message: message.slice(-500) })
}

/** Viết biên bản (claude -p) rồi xuất PDF bằng Electron. Dùng cả cho retry
 * (giữ origin đang có; retry từ màn chi tiết khi state đã idle -> 'process'). */
async function minutesAndPdf(name: string): Promise<void> {
  setState({ stage: 'minutes', origin: state.origin ?? 'process', meetingName: name, errorStage: undefined, errorCode: undefined, message: undefined })
  const bb = await runStreaming(['bienban', name, '--no-pdf'], () => {})
  if (bb.code === 2 || bb.stdout.includes('NO_CLAUDE')) {
    fail('minutes', 'Chưa thấy Claude Code trên máy. Transcript đã lưu an toàn.', 'NO_CLAUDE')
    return
  }
  if (bb.code !== 0) {
    fail('minutes', bb.stdout + bb.stderr)
    return
  }
  await exportPdfStage(name)
}

async function exportPdfStage(name: string): Promise<void> {
  setState({ stage: 'pdf', meetingName: name })
  const ph = await run(['print-html', name])
  const m = ph.stdout.match(/^PRINT_HTML=(.+)$/m)
  if (ph.code !== 0 || !m) {
    fail('pdf', ph.stdout + ph.stderr)
    return
  }
  const htmlPath = m[1].trim()
  const pdfPath = path.join(path.dirname(htmlPath), 'bien-ban.pdf')
  try {
    // import động để tránh vòng phụ thuộc lúc test không có Electron
    const { renderPdf } = await import('../pdf/PdfService')
    await renderPdf(htmlPath, pdfPath)
  } catch (e) {
    fail('pdf', String(e))
    return
  }
  setState({ stage: 'done', meetingName: name, pdfPath })
}

/** Dừng ghi + trộn nguồn âm thanh -> audio.16k.wav. KHÔNG transcript, KHÔNG đụng
 * pipeline state - dừng xong là ghi cuộc mới được ngay. Transcript/biên bản chạy
 * sau qua processMeeting() khi user bấm. */
export async function stopAndSave(): Promise<{ name: string | null; error?: string }> {
  let name: string | null = null
  const r = await runStreaming(['record-stop', '--save-only'], (line) => {
    if (line.startsWith('OUTPUT_DIR=')) {
      name = path.basename(line.slice('OUTPUT_DIR='.length).trim())
    }
  })
  if (r.code !== 0 || !name) {
    return { name, error: (r.stdout + r.stderr).slice(-300) || 'Dừng ghi thất bại.' }
  }
  return { name }
}

/** Pipeline nền theo yêu cầu: transcript -> biên bản -> PDF cho cuộc họp đã có
 * audio. Trả false nếu pipeline đang bận cuộc khác (mỗi lúc chỉ 1 - Whisper nặng). */
export async function processMeeting(name: string): Promise<boolean> {
  if (state.stage !== 'idle' && state.stage !== 'done' && state.stage !== 'error') return false
  setState({
    stage: 'transcribing',
    origin: 'process',
    meetingName: name,
    pdfPath: undefined,
    errorStage: undefined,
    errorCode: undefined,
    message: undefined
  })
  const r = await runStreaming(['transcribe', name], () => {})
  if (r.code !== 0) {
    fail('transcribing', (r.stdout + r.stderr).slice(-500) || 'Transcript thất bại.')
    return true
  }
  await minutesAndPdf(name)
  return true
}

/** Nhập file ghi âm ngoài: giải mã + transcript rồi DỪNG (không biên bản/PDF).
 * Biên bản viết sau khi user bấm ở màn chi tiết. */
export async function importAndProcess(src: string): Promise<void> {
  if (state.stage !== 'idle' && state.stage !== 'done' && state.stage !== 'error') return
  setState({
    stage: 'transcribing',
    origin: 'import',
    meetingName: undefined,
    pdfPath: undefined,
    errorStage: undefined,
    errorCode: undefined,
    message: undefined
  })
  let name: string | null = null
  const r = await runStreaming(['import-file', src], (line) => {
    if (line.includes('Đang transcript')) {
      setState({ stage: 'transcribing' }) // giữ ở transcribing (engine đã bắt đầu giải mã)
    }
    if (line.startsWith('OUTPUT_DIR=')) {
      name = path.basename(line.slice('OUTPUT_DIR='.length).trim())
      setState({ meetingName: name })
    }
  })
  if (r.code !== 0 || !name) {
    fail('transcribing', r.stdout + r.stderr || 'Nhập file ghi âm thất bại.')
    return
  }
  // DỪNG ở đây: không chạy minutesAndPdf, không pdfPath.
  setState({ stage: 'done', origin: 'import', meetingName: name })
}

/** Retry từ màn hình lỗi hoặc từ MeetingDetail: chỉ viết lại biên bản + PDF.
 * Trả false nếu pipeline đang bận cuộc KHÁC (không stomp trạng thái đang chạy). */
export async function retryMinutes(name: string): Promise<boolean> {
  const busy = state.stage !== 'idle' && state.stage !== 'done' && state.stage !== 'error'
  if (busy && state.meetingName !== name) return false
  await minutesAndPdf(name)
  return true
}

/** Xuất lại PDF cho một cuộc họp đã có bien-ban.md (không đụng pipeline state). */
export async function exportPdfFor(name: string): Promise<string> {
  const ph = await run(['print-html', name])
  const m = ph.stdout.match(/^PRINT_HTML=(.+)$/m)
  if (ph.code !== 0 || !m) throw new Error(ph.stdout + ph.stderr)
  const htmlPath = m[1].trim()
  const pdfPath = path.join(path.dirname(htmlPath), 'bien-ban.pdf')
  const { renderPdf } = await import('../pdf/PdfService')
  await renderPdf(htmlPath, pdfPath)
  return pdfPath
}

/** Cho phép quay về Home sau done/error. */
export function resetPipeline(): void {
  if (state.stage === 'done' || state.stage === 'error') setState({ stage: 'idle', origin: undefined, meetingName: undefined, pdfPath: undefined, errorStage: undefined, errorCode: undefined, message: undefined })
}
